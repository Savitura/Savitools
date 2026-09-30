import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { getHorizonUrl, parseAssetParams, fetchFromHorizon, ParsedAsset } from './horizon.util';
import { TradesQueryDto, OrderQuoteDto } from './dto/trades.dto';
import { BadRequestException } from '@nestjs/common';
import {
  DecimalFormatError,
  FIXED_SCALE,
  divFixed,
  divRound,
  formatFixed,
  mulFixed,
  parseFixed as parseDecimal,
} from '../../common/decimal.util';

export type OrderbookNetwork = 'mainnet' | 'testnet';

export interface OrderbookLevel {
  /** Horizon's price string, passed through unchanged. */
  price: string;
  /** Horizon's amount string, passed through unchanged. */
  amount: string;
  /** Exact running total, seven-decimal string. */
  cumulativeAmount: string;
  /** Running total as a percentage of the side total, rounded to 2 decimals (half away from zero). */
  cumulativePercent: number;
}

/**
 * Order-book analytics.
 *
 * All arithmetic is exact (bigint stroops). Rounding happens once, at this API
 * boundary, and is stated per field:
 *
 * - `spread`, `midPrice`, `cumulativeAmount`: seven-decimal strings. `spread`
 *   and `cumulativeAmount` are exact. `midPrice` is (bestBid + bestAsk) / 2
 *   rounded half up to the seventh decimal (only differs from exact when the
 *   two prices sum to an odd number of stroops).
 * - `spreadBps`: (ask - bid) / exact mid * 10 000, rounded to 2 decimals,
 *   half away from zero. Uses the exact mid, not the rounded `midPrice`.
 * - `cumulativePercent`: rounded to 2 decimals, half away from zero.
 * - `liquidityScore`: whole number 0-100, half away from zero. Counts volume on
 *   bids priced >= 99% and asks priced <= 101% of the exact mid (inclusive).
 * - `bestBid` / `bestAsk` / level `price` / level `amount`: Horizon's strings,
 *   unchanged. An empty side reports "0".
 */
export interface OrderbookResult {
  selling: string;
  buying: string;
  network: OrderbookNetwork;
  spread: string;
  spreadBps: number;
  midPrice: string;
  bestBid: string;
  bestAsk: string;
  liquidityScore: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  lastUpdated: number;
}

export interface MidPriceSnapshot {
  timestamp: number;
  midPrice: string;
}

export interface TradeRow {
  id: string;
  pagingToken: string;
  operationId: string | null;
  ledger: number | null;
  closeTime: string | null;
  tradeType: string;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  baseAmount: string;
  quoteAmount: string;
  buyer: string;
  seller: string;
  side: 'buy' | 'sell';
}

export interface TradeTapeResult {
  selling: string;
  buying: string;
  network: OrderbookNetwork;
  order: 'asc' | 'desc';
  limit: number;
  cursor: string | null;
  trades: TradeRow[];
  nextCursor: string | null;
  hasMore: boolean;
  truncated: boolean;
  lastUpdated: number;
}

export type QuoteStatus = 'filled' | 'partial' | 'unfilled';

export interface OrderQuoteResult {
  selling: string;
  buying: string;
  network: OrderbookNetwork;
  side: 'buy' | 'sell';
  requestedAmount: string;
  filledAmount: string;
  unfilledAmount: string;
  status: QuoteStatus;
  averagePrice: string | null;
  worstPrice: string | null;
  bestPrice: string | null;
  cost: string;
  priceImpactBps: number | null;
  estimatedFee: string;
  levelsConsumed: number;
  lastUpdated: number;
}

const MAX_TRADE_PAGES = 5;
const ESTIMATED_TRADE_FEE_STROOPS = '100';

/**
 * Parses a decimal string, surfacing malformed input as a 400 like the rest of
 * this service. The arithmetic itself lives in common/decimal.util.
 */
function parseFixed(value: string): bigint {
  try {
    return parseDecimal(value);
  } catch (err) {
    if (err instanceof DecimalFormatError) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}

function formatAssetString(asset: ParsedAsset): string {
  if (asset.type === 'native' || !asset.code) return 'XLM';
  return `${asset.code}:${asset.issuer ?? ''}`;
}

/**
 * Canonical spelling of one side of a trading pair.
 *
 * Accepts "XLM", "CODE:ISSUER", and the legacy literal "native" that earlier
 * versions of `registerActivePair` wrote into the active-pair set (#285).
 */
function canonicalAssetString(value: string): string {
  if (value === 'native') return 'XLM';
  return formatAssetString(parseAssetParams(value));
}

/**
 * Legacy spelling of one side: native as the literal "native".
 *
 * Only used to read history that was written under the old key shape, so a
 * deploy does not orphan snapshots still sitting in Redis (#285).
 */
function legacyAssetString(value: string): string {
  if (value === 'native') return 'native';
  const asset = parseAssetParams(value);
  return asset.type === 'native' ? 'native' : `${asset.code}:${asset.issuer}`;
}

/**
 * Canonical key for a trading pair, shared by the active-pair set, the
 * mid-price sampler and the history lookup.
 *
 * The sampler used to store snapshots under the literal "native|…" while
 * `getHistory` looked up "XLM|…", so no snapshot was ever read back (#285).
 */
function canonicalPairKey(selling: string, buying: string): string {
  return pairKey(canonicalAssetString(selling), canonicalAssetString(buying));
}

function formatPriceRatio(price: unknown): string {
  if (typeof price === 'string') {
    return formatFixed(parseFixed(price));
  }
  if (price && typeof price === 'object' && 'n' in price && 'd' in price) {
    const n = BigInt(String((price as { n: unknown }).n));
    const d = BigInt(String((price as { d: unknown }).d));
    if (d === 0n) throw new BadRequestException('Invalid trade price');
    return formatFixed((n * FIXED_SCALE) / d);
  }
  throw new BadRequestException('Invalid trade price in Horizon response');
}

function mapHorizonTrade(record: any): TradeRow {
  const baseAsset = formatAssetString({
    type: record.base_asset_type,
    code: record.base_asset_code,
    issuer: record.base_asset_issuer,
  });
  const quoteAsset = formatAssetString({
    type: record.counter_asset_type,
    code: record.counter_asset_code,
    issuer: record.counter_asset_issuer,
  });
  const baseIsSeller = record.base_is_seller === true;
  const closeTime = record.ledger_close_time ?? record.created_at ?? null;
  const id = String(record.id ?? record.paging_token ?? '');
  return {
    id,
    pagingToken: String(record.paging_token ?? ''),
    operationId: id ? id.split('-')[0] : null,
    ledger: typeof record.ledger === 'number' ? record.ledger : null,
    closeTime,
    tradeType: String(record.trade_type ?? record.operation_type ?? 'orderbook'),
    baseAsset,
    quoteAsset,
    price: formatPriceRatio(record.price),
    baseAmount: String(record.base_amount ?? '0'),
    quoteAmount: String(record.counter_amount ?? '0'),
    buyer: baseIsSeller ? String(record.counter_account ?? '') : String(record.base_account ?? ''),
    seller: baseIsSeller ? String(record.base_account ?? '') : String(record.counter_account ?? ''),
    side: baseIsSeller ? 'sell' : 'buy',
  };
}


interface HorizonOrderBookLevel {
  price: string;
  amount: string;
}

interface HorizonOrderBookResponse {
  bids?: HorizonOrderBookLevel[];
  asks?: HorizonOrderBookLevel[];
}

/** A Horizon level with its price and amount parsed to exact stroops. */
interface ParsedLevel {
  raw: HorizonOrderBookLevel;
  price: bigint;
  amount: bigint;
}

const HISTORY_LENGTH = 60;
const DEFAULT_ACTIVE_PAIR = {
  selling: 'XLM',
  buying: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  network: 'testnet' as OrderbookNetwork,
};

function pairKey(selling: string, buying: string): string {
  return `${selling}|${buying}`;
}

/** Parses every level's price and amount exactly. Throws 400 on malformed input. */
function parseLevels(levels: HorizonOrderBookLevel[]): ParsedLevel[] {
  return levels.map((raw) => ({
    raw,
    price: parseFixed(raw.price),
    amount: parseFixed(raw.amount),
  }));
}

function sumAmounts(levels: ParsedLevel[]): bigint {
  return levels.reduce((sum, level) => sum + level.amount, 0n);
}

function buildLevels(levels: ParsedLevel[]): OrderbookLevel[] {
  const total = sumAmounts(levels);
  let cumulative = 0n;

  return levels.map((level) => {
    cumulative += level.amount;
    // Percent to 2 decimals = basis points of the total / 100, rounded once.
    const percentBps = total > 0n ? divRound(cumulative * 10_000n, total) : 0n;
    return {
      price: level.raw.price,
      amount: level.raw.amount,
      cumulativeAmount: formatFixed(cumulative),
      cumulativePercent: Number(percentBps) / 100,
    };
  });
}

/**
 * Total amount within 1% of the mid price on one side (inclusive at the edge).
 *
 * `midTwice` is bestBid + bestAsk, i.e. 2x the exact mid, so the 99% / 101%
 * thresholds are compared as exact integers with no rounded threshold:
 *   bids: price >= 0.99 * mid  <=>  200 * price >= 99  * midTwice
 *   asks: price <= 1.01 * mid  <=>  200 * price <= 101 * midTwice
 */
function volumeWithinOnePercent(
  levels: ParsedLevel[],
  midTwice: bigint,
  side: 'bids' | 'asks',
): bigint {
  return levels.reduce((sum, level) => {
    const scaled = level.price * 200n;
    const withinRange =
      side === 'bids' ? scaled >= midTwice * 99n : scaled <= midTwice * 101n;
    return withinRange ? sum + level.amount : sum;
  }, 0n);
}

@Injectable()
export class OrderbookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderbookService.name);
  private redisClient?: RedisClientType;
  private pollInterval?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redisClient = createClient({ url: redisUrl });
    this.redisClient.on('error', (err) => this.logger.error('Redis Client Error', err));

    try {
      await this.redisClient.connect();
      this.logger.log('Connected to Redis for order book polling');

      await this.registerActivePair(
        DEFAULT_ACTIVE_PAIR.selling,
        DEFAULT_ACTIVE_PAIR.buying,
        DEFAULT_ACTIVE_PAIR.network,
      );

      await this.pollActivePairs();
      this.pollInterval = setInterval(() => this.pollActivePairs(), 60_000);
    } catch (err) {
      this.logger.error('Failed to connect to Redis', err as Error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  private async fetchHorizonOrderBook(
    selling: string,
    buying: string,
    network: OrderbookNetwork,
  ): Promise<HorizonOrderBookResponse> {
    const horizonUrl = getHorizonUrl(network);
    const sell = parseAssetParams(selling);
    const buy = parseAssetParams(buying);

    const params = new URLSearchParams({
      selling_asset_type: sell.type,
      buying_asset_type: buy.type,
      limit: '50',
    });
    if (sell.code) params.set('selling_asset_code', sell.code);
    if (sell.issuer) params.set('selling_asset_issuer', sell.issuer);
    if (buy.code) params.set('buying_asset_code', buy.code);
    if (buy.issuer) params.set('buying_asset_issuer', buy.issuer);

    return fetchFromHorizon(`${horizonUrl}/order_book?${params.toString()}`);
  }

  private computeOrderbook(
    selling: string,
    buying: string,
    network: OrderbookNetwork,
    raw: HorizonOrderBookResponse,
  ): OrderbookResult {
    const rawBids = raw.bids ?? [];
    const rawAsks = raw.asks ?? [];
    const bids = parseLevels(rawBids);
    const asks = parseLevels(rawAsks);

    const bestBid = rawBids[0]?.price ?? '0';
    const bestAsk = rawAsks[0]?.price ?? '0';
    const bestBidFixed = bids[0]?.price ?? 0n;
    const bestAskFixed = asks[0]?.price ?? 0n;

    const twoSided = bestBidFixed > 0n && bestAskFixed > 0n;

    // 2x the exact mid: bid + ask when both sides are quoted, otherwise twice
    // the one quoted price (mid falls back to that side), or 0 for an empty book.
    const midTwice = twoSided
      ? bestBidFixed + bestAskFixed
      : bestBidFixed > 0n
        ? bestBidFixed * 2n
        : bestAskFixed * 2n;
    // Half up at the seventh decimal.
    const midPrice = (midTwice + 1n) / 2n;

    const spread = twoSided ? bestAskFixed - bestBidFixed : 0n;
    // spread / mid * 10 000 bps, in hundredths of a bp: spread * 1e6 / mid,
    // and mid = midTwice / 2.
    const spreadBpsHundredths =
      midTwice > 0n ? divRound(spread * 2_000_000n, midTwice) : 0n;

    const totalVolume = sumAmounts(bids) + sumAmounts(asks);
    const volumeWithin1Pct =
      volumeWithinOnePercent(bids, midTwice, 'bids') +
      volumeWithinOnePercent(asks, midTwice, 'asks');
    const liquidityScore =
      totalVolume > 0n
        ? Math.min(100, Number(divRound(volumeWithin1Pct * 100n, totalVolume)))
        : 0;

    return {
      selling,
      buying,
      network,
      spread: formatFixed(spread),
      spreadBps: Number(spreadBpsHundredths) / 100,
      midPrice: formatFixed(midPrice),
      bestBid,
      bestAsk,
      liquidityScore,
      bids: buildLevels(bids),
      asks: buildLevels(asks),
      lastUpdated: Date.now(),
    };
  }

  async getOrderbook(
    selling: string,
    buying: string,
    network: OrderbookNetwork = 'testnet',
  ): Promise<OrderbookResult> {
    const raw = await this.fetchHorizonOrderBook(selling, buying, network);
    const result = this.computeOrderbook(selling, buying, network, raw);

    await this.registerActivePair(selling, buying, network);

    return result;
  }

  private async registerActivePair(
    selling: string,
    buying: string,
    network: OrderbookNetwork,
  ): Promise<void> {
    const redis = this.redisClient;
    if (!redis) return;
    try {
      // Validate to prevent creating unbounded unique junk keys, then store the
      // canonical pair so the sampler's history keys match what getHistory
      // looks up (#285).
      parseAssetParams(selling);
      parseAssetParams(buying);

      // Use a sorted set to track when it was last requested
      const key = `orderbook:active_pairs:${network}`;
      await redis.zAdd(key, [{ score: Date.now(), value: canonicalPairKey(selling, buying) }]);
      // Limit to max 1000 active pairs per network to prevent unbounded growth
      if (await redis.zCard(key) > 1000) {
        await redis.zRemRangeByRank(key, 0, 0); // remove the oldest
      }
    } catch (err) {
      this.logger.error('Failed to register active pair', err as Error);
    }
  }

  private async pollActivePairs(): Promise<void> {
    const redis = this.redisClient;
    if (!redis) return;

    const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    for (const network of ['mainnet', 'testnet'] as OrderbookNetwork[]) {
      let pairs: string[];
      try {
        const key = `orderbook:active_pairs:${network}`;
        // Clean up pairs that haven't been requested recently
        await redis.zRemRangeByScore(key, 0, now - EXPIRY_MS);
        // Fetch up to 100 pairs to poll
        pairs = await redis.zRange(key, 0, 99, { REV: true });
      } catch (err) {
        this.logger.error(`Failed to read active pairs for ${network}`, err as Error);
        continue;
      }

      // Concurrency control: map in chunks or use Promise.all with small arrays
      const CONCURRENCY_LIMIT = 5;
      for (let i = 0; i < pairs.length; i += CONCURRENCY_LIMIT) {
        const chunk = pairs.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.allSettled(chunk.map(async (pair) => {
          const [selling, buying] = pair.split('|');
          if (!selling || !buying) return;

          try {
            const raw = await this.fetchHorizonOrderBook(selling, buying, network);
            const { midPrice } = this.computeOrderbook(selling, buying, network, raw);
            const snapshot: MidPriceSnapshot = { timestamp: Date.now(), midPrice };

            const historyKey = `orderbook:history:${network}:${pair}`;
            await redis.lPush(historyKey, JSON.stringify(snapshot));
            await redis.lTrim(historyKey, 0, HISTORY_LENGTH - 1);
          } catch (err) {
            this.logger.error(`Failed to poll order book for ${network}:${pair}`, err as Error);
          }
        }));
      }
    }
  }

  async getHistory(
    selling: string,
    buying: string,
    network: OrderbookNetwork = 'testnet',
  ): Promise<MidPriceSnapshot[]> {
    const redis = this.redisClient;
    if (!redis) return [];

    try {
      const historyKey = `orderbook:history:${network}:${canonicalPairKey(selling, buying)}`;
      let results = await redis.lRange(historyKey, 0, HISTORY_LENGTH - 1);

      // Read-only fallback for snapshots written before the key was
      // canonicalised: pairs sampled as "native|…" are still in Redis until the
      // active-pair set rotates, and their history would otherwise be lost.
      if (results.length === 0) {
        const legacyKey = `orderbook:history:${network}:${pairKey(
          legacyAssetString(selling),
          legacyAssetString(buying),
        )}`;
        if (legacyKey !== historyKey) {
          results = await redis.lRange(legacyKey, 0, HISTORY_LENGTH - 1);
        }
      }

      return results.map((r) => JSON.parse(r) as MidPriceSnapshot).reverse();
    } catch (err) {
      this.logger.error('Failed to read order book history', err as Error);
      return [];
    }
  }

  async getTrades(query: TradesQueryDto): Promise<TradeTapeResult> {
    const network: OrderbookNetwork = query.network ?? 'testnet';
    const selling = query.selling;
    const buying = query.buying;
    const sell = parseAssetParams(selling);
    const buy = parseAssetParams(buying);
    const horizonUrl = getHorizonUrl(network);
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const order: 'asc' | 'desc' = query.order ?? 'desc';

    const trades: TradeRow[] = [];
    let cursor = query.cursor;
    let lastScannedToken: string | null = query.cursor ?? null;
    let pages = 0;
    let stopReason: 'limit' | 'end-of-data' | 'window-end' | 'scan-bound' | null = null;

    while (trades.length < limit && pages < MAX_TRADE_PAGES) {
      const params = new URLSearchParams({ limit: String(limit), order });
      params.set('base_asset_type', sell.type);
      if (sell.code) params.set('base_asset_code', sell.code);
      if (sell.issuer) params.set('base_asset_issuer', sell.issuer);
      params.set('counter_asset_type', buy.type);
      if (buy.code) params.set('counter_asset_code', buy.code);
      if (buy.issuer) params.set('counter_asset_issuer', buy.issuer);
      if (cursor) params.set('cursor', cursor);

      const data = await fetchFromHorizon(`${horizonUrl}/trades?${params.toString()}`);
      const batch: any[] = data?._embedded?.records ?? [];
      if (batch.length === 0) {
        stopReason = 'end-of-data';
        break;
      }
      pages++;

      let windowExhausted = false;
      for (const record of batch) {
        lastScannedToken = String(record.paging_token ?? '') || lastScannedToken;

        const closeMs = Date.parse(
          String(record.ledger_close_time ?? record.created_at ?? ''),
        );
        if (!Number.isNaN(closeMs)) {
          const closeSeconds = Math.floor(closeMs / 1000);
          if (query.startTime !== undefined && closeSeconds < query.startTime) {
            if (order === 'desc') {
              windowExhausted = true;
              break;
            }
            continue;
          }
          if (query.endTime !== undefined && closeSeconds > query.endTime) {
            if (order === 'asc') {
              windowExhausted = true;
              break;
            }
            continue;
          }
        }

        const row = mapHorizonTrade(record);
        if (query.side && row.side !== query.side) continue;
        if (query.account && row.buyer !== query.account && row.seller !== query.account) {
          continue;
        }

        trades.push(row);
        if (trades.length >= limit) break;
      }

      if (windowExhausted) {
        stopReason = 'window-end';
        break;
      }
      if (trades.length >= limit) {
        stopReason = 'limit';
        break;
      }
      cursor = String(batch[batch.length - 1].paging_token ?? '');
      if (batch.length < limit) {
        stopReason = 'end-of-data';
        break;
      }
    }

    if (stopReason === null) {
      stopReason = 'scan-bound';
    }

    let nextCursor: string | null = null;
    if (stopReason === 'limit' && trades.length > 0) {
      nextCursor = trades[trades.length - 1].pagingToken;
    } else if (stopReason === 'scan-bound' && lastScannedToken) {
      nextCursor = lastScannedToken;
    }

    return {
      selling,
      buying,
      network,
      order,
      limit,
      cursor: query.cursor ?? null,
      trades,
      nextCursor,
      hasMore: nextCursor !== null,
      truncated: stopReason === 'scan-bound' && nextCursor !== null,
      lastUpdated: Date.now(),
    };
  }

  async getQuote(dto: OrderQuoteDto): Promise<OrderQuoteResult> {
    const network: OrderbookNetwork = dto.network ?? 'testnet';
    const requested = parseFixed(dto.amount);
    if (requested <= 0n) {
      throw new BadRequestException('amount must be positive');
    }

    const raw = await this.fetchHorizonOrderBook(dto.selling, dto.buying, network);
    const side = dto.side;

    const levels = (side === 'buy' ? (raw.asks ?? []) : (raw.bids ?? []))
      .map((level) => ({
        price: parseFixed(level.price),
        amount: parseFixed(level.amount),
      }))
      .filter((level) => level.price > 0n && level.amount > 0n)
      .sort((a, b) => {
        if (a.price === b.price) return 0;
        if (side === 'buy') return a.price < b.price ? -1 : 1;
        return a.price > b.price ? -1 : 1;
      });

    let remaining = requested;
    let filled = 0n;
    let cost = 0n;
    let worstPrice: bigint | null = null;
    let levelsConsumed = 0;

    for (const level of levels) {
      if (remaining <= 0n) break;
      const take = level.amount < remaining ? level.amount : remaining;
      filled += take;
      cost += mulFixed(take, level.price);
      remaining -= take;
      worstPrice = level.price;
      levelsConsumed++;
    }

    const status: QuoteStatus =
      filled === requested ? 'filled' : filled === 0n ? 'unfilled' : 'partial';
    const averagePrice = filled > 0n ? divFixed(cost, filled) : null;
    const bestPrice = levelsConsumed > 0 ? levels[0].price : null;

    let priceImpactBps: number | null = null;
    if (averagePrice !== null && bestPrice !== null && bestPrice > 0n) {
      const delta = side === 'buy' ? averagePrice - bestPrice : bestPrice - averagePrice;
      const bps = (delta * 10000n) / bestPrice;
      priceImpactBps = bps > 0n ? Number(bps) : 0;
    }

    return {
      selling: dto.selling,
      buying: dto.buying,
      network,
      side,
      requestedAmount: formatFixed(requested),
      filledAmount: formatFixed(filled),
      unfilledAmount: formatFixed(remaining),
      status,
      averagePrice: averagePrice !== null ? formatFixed(averagePrice) : null,
      worstPrice: worstPrice !== null ? formatFixed(worstPrice) : null,
      bestPrice: bestPrice !== null ? formatFixed(bestPrice) : null,
      cost: formatFixed(cost),
      priceImpactBps,
      estimatedFee: filled > 0n ? ESTIMATED_TRADE_FEE_STROOPS : '0',
      levelsConsumed,
      lastUpdated: Date.now(),
    };
  }
}
