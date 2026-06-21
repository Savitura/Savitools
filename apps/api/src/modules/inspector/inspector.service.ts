import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { decodeOperation, DecodedOperation } from './operation-decoder';
import { explainOpCode, explainTxCode } from './result-codes';

export interface DecodedEffect {
  type: string;
  account: string;
  [key: string]: string | number | boolean | null;
}

export interface DecodedOperationResult extends DecodedOperation {
  index: number;
  resultCode: string | null;
  resultExplanation: string | null;
  success: boolean;
  effects: DecodedEffect[];
}

export interface TransactionBreakdown {
  hash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  sequenceNumber: string;
  feeCharged: string;
  maxFee: string;
  memo: string | null;
  memoType: string;
  timeBounds: { minTime: string | null; maxTime: string | null } | null;
  signatures: string[];
  success: boolean;
  resultCode: string;
  resultExplanation: string;
  operationCount: number;
  operations: DecodedOperationResult[];
  rawJson: Record<string, unknown> | null;
  network: string;
  composerPayload: ComposerPayload | null;
}

export interface TxSummary {
  hash: string;
  createdAt: string;
  operationCount: number;
  feeCharged: string;
  success: boolean;
  resultCode: string;
}

export interface ComposerPayload {
  sourceAccount: string;
  network: string;
  memo: string | undefined;
  operations: Array<Record<string, unknown> & { type: string }>;
}

@Injectable()
export class InspectorService {
  private readonly logger = new Logger(InspectorService.name);

  constructor(private readonly config: ConfigService) {}

  private horizon(network: 'testnet' | 'mainnet') {
    const url =
      network === 'mainnet'
        ? this.config.get<string>('STELLAR_HORIZON_MAINNET_URL', 'https://horizon.stellar.org')
        : this.config.get<string>('STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org');
    return new StellarSdk.Horizon.Server(url);
  }

  private networkPassphrase(network: 'testnet' | 'mainnet') {
    return network === 'mainnet' ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET;
  }

  // ─── GET /inspector/tx/:hash ──────────────────────────────────────────────

  async inspectTransaction(hash: string, network: 'testnet' | 'mainnet' = 'testnet'): Promise<TransactionBreakdown> {
    const server = this.horizon(network);

    let horizonTx: StellarSdk.Horizon.ServerApi.TransactionRecord;
    try {
      horizonTx = await server.transactions().transaction(hash).call();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) {
        throw new NotFoundException(`Transaction ${hash} not found on ${network}`);
      }
      throw new BadRequestException(`Horizon error: ${msg}`);
    }

    // Fetch operations and effects in parallel
    const [opsPage, effectsPage] = await Promise.all([
      server.operations().forTransaction(hash).limit(200).call(),
      server.effects().forTransaction(hash).limit(200).call(),
    ]);

    const effects = effectsPage.records as Array<Record<string, unknown>>;
    const horizonOps = opsPage.records as Array<Record<string, unknown>>;

    // Decode XDR envelope for operations with full field resolution
    const passphrase = this.networkPassphrase(network);
    let xdrOps: DecodedOperation[] = [];
    try {
      const tx = new StellarSdk.Transaction(horizonTx.envelope_xdr, passphrase);
      xdrOps = tx.operations.map(decodeOperation);
    } catch {
      // fallback: use Horizon operation records
      xdrOps = horizonOps.map((op) => decodeOperation(op));
    }

    // Decode result XDR for per-op result codes
    const opResultCodes = this.extractOpResultCodes(horizonTx.result_xdr, passphrase);

    const operations: DecodedOperationResult[] = xdrOps.map((op, i) => {
      const resultCode = opResultCodes[i] ?? null;
      const opEffects = effects
        .filter((e) => (e as any).operation_id === (horizonOps[i] as any)?.id)
        .map((e) => ({
          type: String(e.type ?? ''),
          account: String(e.account ?? ''),
          ...Object.fromEntries(
            Object.entries(e).filter(([k]) => !['type', 'account', '_links', 'id', 'paging_token', 'operation_id', 'created_at'].includes(k))
          ) as Record<string, string | number | boolean | null>,
        }));

      return {
        ...op,
        index: i,
        resultCode,
        resultExplanation: resultCode ? explainOpCode(resultCode) : null,
        success: !resultCode || resultCode === 'op_success',
        effects: opEffects,
      };
    });

    const txResultCode = this.extractTxResultCode(horizonTx.result_xdr, passphrase) ?? 'tx_success';

    return {
      hash: horizonTx.hash,
      ledger: (horizonTx as any).ledger_attr ?? (horizonTx as any).ledger ?? 0,
      createdAt: horizonTx.created_at,
      sourceAccount: horizonTx.source_account,
      sequenceNumber: horizonTx.source_account_sequence,
      feeCharged: String(horizonTx.fee_charged ?? '0'),
      maxFee: String(horizonTx.max_fee ?? '0'),
      memo: (horizonTx.memo ?? null) as string | null,
      memoType: horizonTx.memo_type,
      timeBounds: this.extractTimeBounds(horizonTx.valid_before, horizonTx.valid_after),
      signatures: (horizonTx as any).signatures ?? [],
      success: horizonTx.successful,
      resultCode: txResultCode,
      resultExplanation: explainTxCode(txResultCode),
      operationCount: horizonTx.operation_count,
      operations,
      rawJson: horizonTx as unknown as Record<string, unknown>,
      network,
      composerPayload: this.buildComposerPayload(horizonTx, xdrOps, network),
    };
  }

  // ─── GET /inspector/account/:publicKey/txs ────────────────────────────────

  async getAccountTransactions(publicKey: string, network: 'testnet' | 'mainnet' = 'testnet'): Promise<TxSummary[]> {
    const server = this.horizon(network);

    let page: StellarSdk.Horizon.ServerApi.CollectionPage<StellarSdk.Horizon.ServerApi.TransactionRecord>;
    try {
      page = await server.transactions().forAccount(publicKey).limit(20).order('desc').call();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('not found')) {
        throw new NotFoundException(`Account ${publicKey} not found on ${network}`);
      }
      throw new BadRequestException(`Horizon error: ${msg}`);
    }

    const passphrase = this.networkPassphrase(network);

    return page.records.map((tx) => {
      const code = this.extractTxResultCode(tx.result_xdr, passphrase) ?? 'tx_success';
      return {
        hash: tx.hash,
        createdAt: tx.created_at,
        operationCount: tx.operation_count,
        feeCharged: String(tx.fee_charged ?? '0'),
        success: tx.successful,
        resultCode: code,
      };
    });
  }

  // ─── POST /inspector/decode-xdr ──────────────────────────────────────────

  async decodeXdr(xdr: string, network: 'testnet' | 'mainnet' = 'testnet'): Promise<TransactionBreakdown> {
    const passphrase = this.networkPassphrase(network);

    let tx: StellarSdk.Transaction | StellarSdk.FeeBumpTransaction;
    try {
      tx = StellarSdk.TransactionBuilder.fromXDR(xdr, passphrase);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Invalid XDR: ${msg}`);
    }

    const innerTx = tx instanceof StellarSdk.FeeBumpTransaction ? tx.innerTransaction : tx;
    const xdrOps = innerTx.operations.map(decodeOperation);

    const operations: DecodedOperationResult[] = xdrOps.map((op, i) => ({
      ...op,
      index: i,
      resultCode: null,
      resultExplanation: null,
      success: true, // unknown until submitted
      effects: [],
    }));

    const memo = innerTx.memo;
    const memoText = memo.type === 'text'
      ? (typeof memo.value === 'string' ? memo.value : memo.value?.toString('utf8') ?? null)
      : memo.type === 'id' || memo.type === 'hash' || memo.type === 'return'
        ? String(memo.value)
        : null;

    const timeBounds = innerTx.timeBounds
      ? {
          minTime: innerTx.timeBounds.minTime ? String(innerTx.timeBounds.minTime) : null,
          maxTime: innerTx.timeBounds.maxTime ? String(innerTx.timeBounds.maxTime) : null,
        }
      : null;

    return {
      hash: innerTx.hash().toString('hex'),
      ledger: 0,
      createdAt: '',
      sourceAccount: innerTx.source,
      sequenceNumber: innerTx.sequence,
      feeCharged: '0',
      maxFee: String(innerTx.fee),
      memo: memoText,
      memoType: memo.type,
      timeBounds,
      signatures: innerTx.signatures.map((s) => s.signature().toString('hex')),
      success: true,
      resultCode: 'tx_success',
      resultExplanation: 'Transaction decoded from XDR — not yet submitted.',
      operationCount: xdrOps.length,
      operations,
      rawJson: null,
      network,
      composerPayload: this.buildComposerPayload(null, xdrOps, network, innerTx),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private extractOpResultCodes(resultXdr: string, _passphrase: string): (string | null)[] {
    try {
      const result = StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, 'base64');
      const inner = result.result();
      const results = inner.results?.() ?? [];
      return results.map((r: any) => {
        try {
          const inner = r.tr?.()?.switch?.()?.name ?? null;
          if (inner) return inner;
          return r.switch?.()?.name ?? null;
        } catch {
          return null;
        }
      });
    } catch {
      return [];
    }
  }

  private extractTxResultCode(resultXdr: string, _passphrase: string): string | null {
    try {
      const result = StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, 'base64');
      return result.result().switch().name ?? null;
    } catch {
      return null;
    }
  }

  private extractTimeBounds(
    validBefore: string | undefined,
    validAfter: string | undefined,
  ): { minTime: string | null; maxTime: string | null } | null {
    if (!validBefore && !validAfter) return null;
    return { minTime: validAfter ?? null, maxTime: validBefore ?? null };
  }

  private buildComposerPayload(
    horizonTx: any,
    ops: DecodedOperation[],
    network: string,
    innerTx?: StellarSdk.Transaction,
  ): ComposerPayload | null {
    try {
      const source = horizonTx?.source_account ?? innerTx?.source ?? null;
      if (!source) return null;

      const composerOps = ops
        .filter((op) => COMPOSER_SUPPORTED_TYPES.has(op.type))
        .map((op) => buildComposerOp(op));

      if (composerOps.length === 0) return null;

      return {
        sourceAccount: source,
        network,
        memo: horizonTx?.memo ?? (innerTx?.memo?.type !== 'none' ? undefined : undefined),
        operations: composerOps,
      };
    } catch {
      return null;
    }
  }
}

const COMPOSER_SUPPORTED_TYPES = new Set([
  'payment', 'create_account', 'change_trust', 'manage_sell_offer',
  'manage_buy_offer', 'create_passive_sell_offer', 'set_options',
  'account_merge', 'allow_trust', 'path_payment_strict_send',
  'path_payment_strict_receive', 'manage_data',
]);

function buildComposerOp(op: DecodedOperation): Record<string, unknown> & { type: string } {
  const f = op.fields;
  switch (op.type) {
    case 'payment':
      return { type: 'payment', destination: f.destination, amount: f.amount, asset: parseAssetField(f.asset) };
    case 'create_account':
      return { type: 'create_account', destination: f.destination, startingBalance: parseFloat(f.startingBalance ?? '0') };
    case 'change_trust':
      return { type: 'change_trust', asset: parseAssetField(f.asset), limit: f.limit === 'max' ? undefined : f.limit };
    case 'manage_sell_offer':
      return { type: 'manage_sell_offer', selling: parseAssetField(f.selling), buying: parseAssetField(f.buying), amount: f.amount, price: parsePrice(f.price), offerId: f.offerId };
    case 'manage_buy_offer':
      return { type: 'manage_buy_offer', selling: parseAssetField(f.selling), buying: parseAssetField(f.buying), buyAmount: f.buyAmount, price: parsePrice(f.price), offerId: f.offerId };
    case 'account_merge':
      return { type: 'account_merge', destination: f.destination };
    case 'manage_data':
      return { type: 'manage_data', name: f.name, value: f.value };
    default:
      return { type: op.type, ...f };
  }
}

function parseAssetField(val: string | null | undefined): Record<string, string> {
  if (!val || val === 'XLM') return { code: 'XLM' };
  const [code, issuer] = val.split(':');
  return { code: code ?? 'XLM', issuer: issuer ?? '' };
}

function parsePrice(val: string | null | undefined): Record<string, number> {
  if (!val) return { n: 1, d: 1 };
  const match = val.match(/^(\d+)\/(\d+)/);
  if (match) return { n: parseInt(match[1]!), d: parseInt(match[2]!) };
  return { n: 1, d: 1 };
}
