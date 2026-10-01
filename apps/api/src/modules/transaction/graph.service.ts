import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { GraphMode, GraphQueryDto } from './dto/graph.dto';

export type GraphNodeType = 'account' | 'multisig' | 'anchor' | 'contract';

export type GraphRelationship =
  | 'signs_for'
  | 'co_signer'
  | 'offer_match'
  | 'payment';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: GraphRelationship;
  metadata: Record<string, unknown>;
}

/** Deepest traversal a query may ask for; mirrors `GraphQueryDto.depth`'s `@Max(3)`. */
export const GRAPH_MAX_DEPTH = 3;
/** Default ceiling on nodes in one graph (override with `GRAPH_MAX_NODES`). */
export const DEFAULT_GRAPH_MAX_NODES = 150;
/** Default ceiling on Horizon calls per graph (override with `GRAPH_MAX_HORIZON_REQUESTS`). */
export const DEFAULT_GRAPH_MAX_HORIZON_REQUESTS = 60;

export type GraphTruncation = 'node_limit' | 'horizon_request_limit';

export interface GraphLimits {
  maxDepth: number;
  maxNodes: number;
  maxHorizonRequests: number;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootAccount: string;
  depth: number;
  mode: GraphMode;
  nodeCount: number;
  edgeCount: number;
  /** True when a limit stopped the traversal early, so the graph is partial. */
  truncated: boolean;
  /** The first limit hit, or null for a complete graph. */
  truncatedBy: GraphTruncation | null;
  /** Horizon calls this graph actually made. */
  horizonRequests: number;
  limits: GraphLimits;
}

/**
 * Per-request accounting for one `buildGraph` call (#260). Every Horizon call
 * reserves a request first and every new node checks for room, so one query can
 * no longer fan out into an unbounded crawl; the first limit hit is recorded.
 */
class TraversalBudget {
  requests = 0;
  truncatedBy: GraphTruncation | null = null;

  constructor(private readonly limits: GraphLimits) {}

  /** Reserve one Horizon request; false once the budget is spent. */
  takeRequest(): boolean {
    if (this.requests >= this.limits.maxHorizonRequests) {
      this.truncatedBy ??= 'horizon_request_limit';
      return false;
    }
    this.requests += 1;
    return true;
  }

  /** Whether a graph that already holds `current` nodes may take `extra` more. */
  hasRoomFor(current: number, extra = 1): boolean {
    if (current + extra > this.limits.maxNodes) {
      this.truncatedBy ??= 'node_limit';
      return false;
    }
    return true;
  }

  get exhausted(): boolean {
    return this.truncatedBy !== null;
  }
}

interface HorizonSigner {
  key: string;
  weight: number;
  type?: string;
}

/** Lightweight account view used while traversing the graph. */
interface AccountSnapshot {
  publicKey: string;
  signers: HorizonSigner[];
  balances: StellarSdk.Horizon.HorizonApi.BalanceLine[];
  thresholds?: StellarSdk.Horizon.HorizonApi.AccountThresholds;
}

interface PendingOffer {
  id: string;
  seller: string;
  selling: { type: string; code?: string; issuer?: string };
  buying: { type: string; code?: string; issuer?: string };
  price: string;
}

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(private readonly configService: ConfigService) {}

  private limits(): GraphLimits {
    const positive = (key: string, fallback: number) => {
      const value = Number(this.configService.get<string | number>(key));
      return Number.isInteger(value) && value > 0 ? value : fallback;
    };
    return {
      maxDepth: GRAPH_MAX_DEPTH,
      maxNodes: positive('GRAPH_MAX_NODES', DEFAULT_GRAPH_MAX_NODES),
      maxHorizonRequests: positive('GRAPH_MAX_HORIZON_REQUESTS', DEFAULT_GRAPH_MAX_HORIZON_REQUESTS),
    };
  }

  private horizon(network: 'mainnet' | 'testnet'): StellarSdk.Horizon.Server {
    const url =
      network === 'mainnet'
        ? this.configService.get<string>(
            'STELLAR_HORIZON_MAINNET_URL',
            'https://horizon.stellar.org',
          )
        : this.configService.get<string>(
            'STELLAR_HORIZON_URL',
            'https://horizon-testnet.stellar.org',
          );
    return new StellarSdk.Horizon.Server(url);
  }

  /** Builds an SDK Asset from a compact {type, code?, issuer?} descriptor. */
  private sdkAsset(
    asset: PendingOffer['selling'],
  ): StellarSdk.Asset {
    if (asset.type === 'native' || !asset.code) {
      return StellarSdk.Asset.native();
    }
    return new StellarSdk.Asset(asset.code, asset.issuer!);
  }

  /** Renders a compact label like `XLM` or `USDC:GABC` for a pending-offer asset. */
  private assetLabel(
    asset: PendingOffer['selling'],
  ): string {
    if (asset.type === 'native' || !asset.code) return 'XLM';
    return asset.issuer ? `${asset.code}:${asset.issuer}` : asset.code;
  }

  // ─── Account fetching with dedup ──────────────────────────────────────

  private async fetchAccount(
    server: StellarSdk.Horizon.Server,
    publicKey: string,
  ): Promise<AccountSnapshot | null> {
    try {
      const account = await server.loadAccount(publicKey);
      return {
        publicKey,
        signers: (account.signers ?? []) as HorizonSigner[],
        balances: (account.balances ?? []) as StellarSdk.Horizon.HorizonApi.BalanceLine[],
        thresholds: account.thresholds as
          | StellarSdk.Horizon.HorizonApi.AccountThresholds
          | undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) {
        return null;
      }
      this.logger.warn(`loadAccount(${publicKey}) failed: ${msg}`);
      return null;
    }
  }

  /**
   * Caches account lookups so each account is only fetched once per query, and
   * charges each real fetch to the budget; once it is spent, lookups return null.
   */
  private createAccountCache(server: StellarSdk.Horizon.Server, budget: TraversalBudget) {
    const cache = new Map<string, Promise<AccountSnapshot | null>>();
    return (publicKey: string): Promise<AccountSnapshot | null> => {
      let p = cache.get(publicKey);
      if (!p) {
        p = budget.takeRequest() ? this.fetchAccount(server, publicKey) : Promise.resolve(null);
        cache.set(publicKey, p);
      }
      return p;
    };
  }

  // ─── Node classification ──────────────────────────────────────────────

  private classifyNode(
    publicKey: string,
    account: AccountSnapshot | null,
  ): GraphNodeType {
    if (publicKey.startsWith('C')) return 'contract';
    if (!account) return 'account';
    const signerCount = account.signers.length;
    const thresholds = account.thresholds;
    const highThreshold =
      thresholds && thresholds.med_threshold > 1 ? true : false;
    if (signerCount >= 2 || highThreshold) return 'multisig';
    const creditBalances = account.balances.filter(
      (b) => 'asset_code' in b && Boolean(b.asset_code),
    );
    if (creditBalances.length >= 3) return 'anchor';
    return 'account';
  }

  private classifyLabel(publicKey: string, type: GraphNodeType): string {
    if (type === 'contract') return `contract:${publicKey.slice(0, 8)}…`;
    return publicKey;
  }

  /** Returns the node, or null when the node limit leaves no room for a new one. */
  private buildNode(
    publicKey: string,
    account: AccountSnapshot | null,
    seenNodes: Map<string, GraphNode>,
    budget: TraversalBudget,
  ): GraphNode | null {
    const existing = seenNodes.get(publicKey);
    if (existing) return existing;
    if (!budget.hasRoomFor(seenNodes.size)) return null;
    const type = this.classifyNode(publicKey, account);
    const node: GraphNode = {
      id: publicKey,
      label: this.classifyLabel(publicKey, type),
      type,
      metadata: {
        publicKey,
        type,
        signerCount: account ? account.signers.length : 0,
        balanceCount: account ? account.balances.length : 0,
      },
    };
    seenNodes.set(publicKey, node);
    return node;
  }

  // ─── Graph builders ───────────────────────────────────────────────────

  private async buildSignersGraph(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
    depth: number,
    loadAccount: (pk: string) => Promise<AccountSnapshot | null>,
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[],
    budget: TraversalBudget,
  ): Promise<void> {
    // BFS over signer relationships, stopping as soon as a limit is hit.
    const visited = new Set<string>();
    const queue: Array<{ pk: string; level: number }> = [
      { pk: rootAccount, level: 0 },
    ];
    visited.add(rootAccount);

    while (queue.length > 0 && !budget.exhausted) {
      const { pk, level } = queue.shift()!;
      const account = await loadAccount(pk);
      if (!this.buildNode(pk, account, nodes, budget)) break;

      if (level >= depth || !account || account.signers.length === 0) continue;

      // Only signers that fit under the node limit get nodes and edges.
      const signerKeys: string[] = [];
      for (const s of account.signers) {
        if (!s.key || !s.key.startsWith('G')) continue;
        if (!this.buildNode(s.key, null, nodes, budget)) break;
        signerKeys.push(s.key);
      }

      for (const signer of signerKeys) {
        // signer signs_for pk
        edges.push({
          source: signer,
          target: pk,
          relationship: 'signs_for',
          metadata: {
            weight: account.signers.find((s) => s.key === signer)?.weight ?? 1,
          },
        });
        if (!visited.has(signer) && level + 1 < depth + 1) {
          visited.add(signer);
          queue.push({ pk: signer, level: level + 1 });
        }
      }

      // co_signer: all signers of a multisig account co-sign together
      if (signerKeys.length >= 2) {
        for (let i = 0; i < signerKeys.length; i++) {
          for (let j = i + 1; j < signerKeys.length; j++) {
            edges.push({
              source: signerKeys[i],
              target: signerKeys[j],
              relationship: 'co_signer',
              metadata: { ofAccount: pk },
            });
          }
        }
      }
    }
  }

  private async fetchOffers(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
    budget: TraversalBudget,
  ): Promise<PendingOffer[]> {
    if (!budget.takeRequest()) return [];
    try {
      const page = await server.offers().forAccount(rootAccount).limit(200).call();
      return page.records.map((o) => ({
        id: String(o.id),
        seller: o.seller,
        selling: {
          type: o.selling.asset_type,
          code: o.selling.asset_code,
          issuer: o.selling.asset_issuer,
        },
        buying: {
          type: o.buying.asset_type,
          code: o.buying.asset_code,
          issuer: o.buying.asset_issuer,
        },
        price: o.price,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) return [];
      this.logger.warn(`offers.forAccount(${rootAccount}) failed: ${msg}`);
      return [];
    }
  }

  private async buildOffersGraph(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
    loadAccount: (pk: string) => Promise<AccountSnapshot | null>,
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[],
    budget: TraversalBudget,
  ): Promise<void> {
    const offers = await this.fetchOffers(server, rootAccount, budget);
    this.buildNode(rootAccount, await loadAccount(rootAccount), nodes, budget);
    if (offers.length === 0) return;

    // Find counterparties whose offers match each of the root's offers. Each
    // counter-offer query costs a request, and each new seller needs node room.
    const matchedSellers = new Set<string>();
    // Sellers not yet in the graph; only these need node room (an ALL query may
    // already hold a seller from the signers pass).
    const pendingNew = new Set<string>();
    counterOffers: for (const offer of offers) {
      if (!budget.takeRequest()) break;
      // Counter-offers sell what we buy and buy what we sell.
      const sellingAsset = this.sdkAsset(offer.selling);
      const buyingAsset = this.sdkAsset(offer.buying);

      let page: StellarSdk.Horizon.ServerApi.CollectionPage<StellarSdk.Horizon.ServerApi.OfferRecord>;
      try {
        page = await server
          .offers()
          .selling(buyingAsset)
          .buying(sellingAsset)
          .limit(20)
          .call();
      } catch {
        continue;
      }

      for (const counter of page.records) {
        if (counter.seller === rootAccount) continue;
        if (!nodes.has(counter.seller) && !pendingNew.has(counter.seller)) {
          if (!budget.hasRoomFor(nodes.size + pendingNew.size)) break counterOffers;
          pendingNew.add(counter.seller);
        }
        matchedSellers.add(counter.seller);
        const rel = edges.some(
          (e) =>
            e.source === counter.seller &&
            e.target === rootAccount &&
            e.relationship === 'offer_match',
        );
        if (!rel) {
          edges.push({
            source: counter.seller,
            target: rootAccount,
            relationship: 'offer_match',
            metadata: {
              sellingAsset: this.assetLabel(offer.buying),
              buyingAsset: this.assetLabel(offer.selling),
              price: counter.price,
            },
          });
        }
      }
    }

    for (const seller of matchedSellers) {
      this.buildNode(seller, await loadAccount(seller), nodes, budget);
    }
  }

  private async buildPaymentsGraph(
    server: StellarSdk.Horizon.Server,
    rootAccount: string,
    loadAccount: (pk: string) => Promise<AccountSnapshot | null>,
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[],
    budget: TraversalBudget,
  ): Promise<void> {
    if (!budget.takeRequest()) {
      this.buildNode(rootAccount, await loadAccount(rootAccount), nodes, budget);
      return;
    }
    let page: StellarSdk.Horizon.ServerApi.CollectionPage<
      StellarSdk.Horizon.ServerApi.PaymentOperationRecord | StellarSdk.Horizon.ServerApi.PathPaymentOperationRecord
    >;
    try {
      const result = await server.payments().forAccount(rootAccount).limit(100).call();
      page = result as StellarSdk.Horizon.ServerApi.CollectionPage<
        StellarSdk.Horizon.ServerApi.PaymentOperationRecord | StellarSdk.Horizon.ServerApi.PathPaymentOperationRecord
      >;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) {
        this.buildNode(rootAccount, await loadAccount(rootAccount), nodes, budget);
        return;
      }
      this.logger.warn(`payments.forAccount(${rootAccount}) failed: ${msg}`);
      this.buildNode(rootAccount, await loadAccount(rootAccount), nodes, budget);
      return;
    }

    const paymentOps = page.records.filter((r) => r.type === 'payment');
    if (paymentOps.length === 0) {
      this.buildNode(rootAccount, await loadAccount(rootAccount), nodes, budget);
      return;
    }

    this.buildNode(rootAccount, await loadAccount(rootAccount), nodes, budget);

    const connected = new Set<string>();
    // Endpoints not yet in the graph; only these need node room.
    const pendingNew = new Set<string>();
    for (const op of paymentOps) {
      const from = (op as StellarSdk.Horizon.ServerApi.PaymentOperationRecord).from;
      const to = (op as StellarSdk.Horizon.ServerApi.PaymentOperationRecord).to;
      if (!from || !to) continue;
      const fresh = [...new Set([from, to])].filter((pk) => !nodes.has(pk) && !pendingNew.has(pk));
      if (!budget.hasRoomFor(nodes.size + pendingNew.size, fresh.length)) break;
      fresh.forEach((pk) => pendingNew.add(pk));
      connected.add(from);
      connected.add(to);
      edges.push({
        source: from,
        target: to,
        relationship: 'payment',
        metadata: {
          amount: op.amount,
          asset: op.asset_code ? op.asset_code : op.asset_type === 'native' ? 'XLM' : op.asset_code,
          transactionHash: op.transaction_hash,
        },
      });
    }

    for (const pk of connected) {
      this.buildNode(pk, await loadAccount(pk), nodes, budget);
    }
  }

  // ─── Public entrypoint ────────────────────────────────────────────────

  async buildGraph(dto: GraphQueryDto): Promise<GraphResult> {
    const network = dto.network ?? 'testnet';
    const server = this.horizon(network);
    const limits = this.limits();
    const budget = new TraversalBudget(limits);
    const loadAccount = this.createAccountCache(server, budget);
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    // Validate root account exists up-front so we fail fast with a clear error.
    const rootAccount = await loadAccount(dto.rootAccount);
    if (!rootAccount) {
      throw new NotFoundException(
        `Account ${dto.rootAccount} not found on ${network}`,
      );
    }

    try {
      if (dto.mode === GraphMode.SIGNERS || dto.mode === GraphMode.ALL) {
        await this.buildSignersGraph(
          server,
          dto.rootAccount,
          dto.depth,
          loadAccount,
          nodes,
          edges,
          budget,
        );
      }
      // Once a limit has cut the graph short, later modes would only spend
      // Horizon calls on nodes that can no longer be added.
      if (!budget.exhausted && (dto.mode === GraphMode.OFFERS || dto.mode === GraphMode.ALL)) {
        await this.buildOffersGraph(
          server,
          dto.rootAccount,
          loadAccount,
          nodes,
          edges,
          budget,
        );
      }
      if (!budget.exhausted && (dto.mode === GraphMode.PAYMENTS || dto.mode === GraphMode.ALL)) {
        await this.buildPaymentsGraph(
          server,
          dto.rootAccount,
          loadAccount,
          nodes,
          edges,
          budget,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Graph build failed: ${msg}`);
      throw new BadRequestException(`Graph build failed: ${msg}`);
    }

    const nodeList = Array.from(nodes.values());
    return {
      nodes: nodeList,
      edges,
      rootAccount: dto.rootAccount,
      depth: dto.depth,
      mode: dto.mode,
      nodeCount: nodeList.length,
      edgeCount: edges.length,
      truncated: budget.exhausted,
      truncatedBy: budget.truncatedBy,
      horizonRequests: budget.requests,
      limits,
    };
  }
}
