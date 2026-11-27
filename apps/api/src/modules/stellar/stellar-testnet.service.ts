import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import * as StellarSdk from '@stellar/stellar-sdk';
import { parseDestination, type ParsedDestination } from './address';
import { resolveStellarEndpoints } from './stellar-endpoints';

/** Horizon balance shape both the wallet and sandbox pages render. */
export interface Balance {
  assetType: string;
  assetCode: string | null;
  assetIssuer: string | null;
  balance: string;
  limit?: string;
}

/** The part of a Horizon account response the API reads. */
export interface HorizonAccount {
  account_id: string;
  sequence: string;
  balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
    limit?: string;
  }>;
  signers: Array<{ public_key: string; weight: number }>;
  thresholds: {
    low_threshold: number;
    med_threshold: number;
    high_threshold: number;
  };
  flags: {
    auth_required: boolean;
    auth_revocable: boolean;
    auth_immutable: boolean;
    /** Present on every Horizon account; optional so older fixtures still type. */
    auth_clawback_enabled?: boolean;
  };
}

/** The part of a Horizon submission result the API reads. */
export interface SubmittedTransaction {
  hash: string;
  fee_charged?: string;
  result_codes?: { operation_results?: unknown[] };
}

/** The part of a Horizon account the balance helpers need. */
type BalancesOnly = Pick<HorizonAccount, 'balances'>;

/**
 * Friendbot's answer, left unthrown so each caller can add its own recovery
 * before deciding whether the request really failed.
 */
export type FriendbotReply =
  | { ok: true; hash: string | null }
  | { ok: false; status: number; statusText: string; body: string };

export interface PaymentRequest {
  sourceSecret: string;
  destination: string;
  asset: string;
  amount: string;
  memo?: string;
}


const FRIENDBOT_TIMEOUT_MS = 30000;
const FRIENDBOT_STARTING_BALANCE = '10,000 XLM';

/** True when an error is an AbortSignal timeout (TimeoutError or AbortError). */
function isTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError')
  );
}

/**
 * Stellar network operations shared by the wallet and sandbox modules.
 *
 * Resolved from shared configuration rather than module constants, supporting
 * public testnet, local Stellar quickstart nodes, and private networks (Savitura/Savitools#323).
 */
@Injectable()
export class StellarTestnetService {
  private readonly logger = new Logger(StellarTestnetService.name);
  private readonly servers = new Map<string, StellarSdk.Horizon.Server>();

  serverFor(network: string = 'testnet', overrides?: any): StellarSdk.Horizon.Server {
    const endpoints = resolveStellarEndpoints(network, overrides);
    const cacheKey = `${endpoints.network}:${endpoints.horizonUrl}`;
    if (!this.servers.has(cacheKey)) {
      const allowHttp = endpoints.horizonUrl.startsWith('http://');
      this.servers.set(
        cacheKey,
        new StellarSdk.Horizon.Server(endpoints.horizonUrl, { allowHttp }),
      );
    }
    return this.servers.get(cacheKey)!;
  }

  get server(): StellarSdk.Horizon.Server {
    return this.serverFor('testnet');
  }

  /**
   * Random keypair labelled with its network.
   *
   * The raw secret buffer is overwritten once the string secret has been read,
   * so a copy of the seed does not stay resident in the process.
   */
  generateKeypair(network: string = 'testnet'): {
    publicKey: string;
    secretKey: string;
    network: string;
  } {
    const endpoints = resolveStellarEndpoints(network);
    const keypair = Keypair.random();
    const secretKey = keypair.secret();
    const publicKey = keypair.publicKey();

    this.wipeRawSecret(keypair);

    return { publicKey, secretKey, network: endpoints.network };
  }

  /**
   * Overwrite the raw secret bytes now that the string secret is captured.
   *
   * rawSecretKey() is the current SDK accessor and rawSecret() is the older
   * one, so the wipe goes through whichever this build exposes. It is best
   * effort: the caller already holds the string secret either way.
   */
  private wipeRawSecret(keypair: Keypair): void {
    const accessor = keypair as unknown as {
      rawSecretKey?: () => Buffer;
      rawSecret?: () => Buffer;
    };
    const read = accessor.rawSecretKey ?? accessor.rawSecret;
    if (!read) {
      return;
    }

    try {
      const raw = read.call(keypair);
      if (Buffer.isBuffer(raw)) {
        raw.fill(0);
      }
    } catch {
      // The accessor refused to hand over the bytes; nothing to wipe.
    }
  }

  /** Load an account, mapping Horizon's "not found" onto the shared 400 copy. */
  async loadAccount(
    publicKey: string,
    network: string = 'testnet',
    overrides?: any,
  ): Promise<HorizonAccount> {
    const srv = this.serverFor(network, overrides);
    try {
      return (await srv.loadAccount(
        publicKey,
      )) as unknown as HorizonAccount;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to load account ${publicKey} on ${network}: ${message}`);
      if (message.includes('not found') || message.includes('404')) {
        throw new BadRequestException(
          `Account ${publicKey} not found on ${network}. Fund it via Friendbot first.`,
        );
      }
      throw new BadRequestException(`Failed to load account: ${message}`);
    }
  }

  /** The same load, but a missing account is an expected answer, not an error. */
  async loadAccountIfPresent(
    publicKey: string,
    network: string = 'testnet',
    overrides?: any,
  ): Promise<HorizonAccount | null> {
    const srv = this.serverFor(network, overrides);
    try {
      return (await srv.loadAccount(
        publicKey,
      )) as unknown as HorizonAccount;
    } catch {
      return null;
    }
  }

  /** Native balance label for an account Horizon returned. */
  startingBalanceOf(account: BalancesOnly | null): string {
    const native = (account?.balances ?? []).find(
      (balance) => balance.asset_type === 'native',
    );
    return native ? `${native.balance} XLM` : FRIENDBOT_STARTING_BALANCE;
  }

  /** Horizon balances in the shape both frontends render. */
  mapBalances(account: BalancesOnly | null): Balance[] {
    return (account?.balances ?? []).map((balance) => ({
      assetType: balance.asset_type,
      assetCode: balance.asset_code ?? null,
      assetIssuer: balance.asset_issuer ?? null,
      balance: balance.balance,
      limit: balance.limit ?? undefined,
    }));
  }

  /**
   * Ask Friendbot for funds on the selected network.
   *
   * Transport failures throw, because no caller can recover from them. An HTTP
   * failure is returned so the sandbox can treat "already funded" as success.
   */
  async requestFriendbotFunding(
    publicKey: string,
    network: string = 'testnet',
    overrides?: any,
  ): Promise<FriendbotReply> {
    const endpoints = resolveStellarEndpoints(network, overrides);
    const friendbotUrl = endpoints.friendbotUrl;
    if (!friendbotUrl) {
      throw new BadRequestException(
        `Friendbot is not configured for network "${network}". Automatic funding is not supported on this network.`,
      );
    }

    const url = `${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(FRIENDBOT_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      if (isTimeoutError(err)) {
        this.logger.error(
          `Friendbot request timed out for ${publicKey} on ${network} after ${FRIENDBOT_TIMEOUT_MS} ms`,
        );
        throw new GatewayTimeoutException(
          `Friendbot did not respond within ${FRIENDBOT_TIMEOUT_MS} ms for network "${network}" at ${friendbotUrl}.`,
        );
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Friendbot request failed for ${publicKey} on ${network}: ${message}`,
      );
      throw new BadGatewayException(
        `Friendbot is unavailable for network "${network}" at ${friendbotUrl}. Ensure your local Stellar quickstart container is running and Friendbot is enabled, or use a network profile with an accessible Friendbot. (${message})`,
      );
    }

    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch (err: unknown) {
        if (isTimeoutError(err)) {
          throw new GatewayTimeoutException(
            `Friendbot did not finish responding within ${FRIENDBOT_TIMEOUT_MS} ms for network "${network}" at ${friendbotUrl}.`,
          );
        }
      }
      this.logger.error(
        `Friendbot error for ${publicKey} on ${network}: ${response.status} ${body}`,
      );
      if (
        !body.includes('account already funded') &&
        !body.includes('op_already_exists') &&
        (response.status === 404 || response.status >= 500)
      ) {
        throw new BadRequestException(
          `Friendbot is unavailable for network "${network}" at ${friendbotUrl}. Ensure your local Stellar quickstart container is running and Friendbot is enabled, or use a network profile with an accessible Friendbot. (HTTP ${response.status}: ${body || response.statusText})`,
        );
      }
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        body,
      };
    }

    let json: { hash?: string };
    try {
      json = (await response.json()) as { hash?: string };
    } catch (err: unknown) {
      if (isTimeoutError(err)) {
        throw new GatewayTimeoutException(
          `Friendbot did not finish responding within ${FRIENDBOT_TIMEOUT_MS} ms for network "${network}" at ${friendbotUrl}.`,
        );
      }
      json = {};
    }
    return { ok: true, hash: json.hash ?? null };
  }

  /** True when Friendbot refused because the account already holds funds. */
  isAlreadyFundedReply(reply: Extract<FriendbotReply, { ok: false }>): boolean {
    return (
      reply.body.includes('account already funded') ||
      reply.body.includes('op_already_exists') ||
      reply.status === 400
    );
  }

  /** The single rejection message both modules raise for a refused call. */
  friendbotFailure(
    reply: Extract<FriendbotReply, { ok: false }>,
  ): BadRequestException {
    return new BadRequestException(
      `Friendbot funding failed (${reply.status}): ${reply.body || reply.statusText}`,
    );
  }

  keypairFromSecret(secret: string): Keypair {
    try {
      return Keypair.fromSecret(secret);
    } catch {
      throw new BadRequestException('Invalid source secret key');
    }
  }

  /**
   * Validate a payment destination and return its decoded form.
   *
   * Accepts both `G…` accounts and `M…` muxed accounts; see
   * {@link parseDestination} for the rejection copy.
   */
  assertDestination(destination: string): ParsedDestination {
    return parseDestination(destination);
  }

  /**
   * Build the payment operation for a request.
   *
   * Kept separate from {@link submitPayment} so the XDR-level behaviour — in
   * particular that a muxed destination survives into the operation as
   * `keyTypeMuxedEd25519` with its payment ID intact — is testable without a
   * Horizon round trip. `Operation.payment` accepts the `M…` strkey directly
   * and packs it into the muxed arm of `xdr.MuxedAccount`.
   *
   * The asset is normally parsed by the caller so the format is rejected
   * before any network load; parsing lazily here keeps the method usable on
   * its own.
   */
  buildPaymentOperation(
    request: PaymentRequest,
    asset: Asset = this.parseAsset(request.asset),
  ) {
    return Operation.payment({
      destination: request.destination,
      asset,
      amount: request.amount,
    });
  }

  /**
   * Parse an asset string (`native` or `CODE:ISSUER`) into an SDK Asset.
   */
  parseAsset(asset: string): Asset {
    if (asset === 'native' || asset === 'XLM') {
      return Asset.native();
    }
    const [code, issuer] = asset.split(':');
    if (!code || !issuer) {
      throw new BadRequestException(
        `Invalid asset "${asset}". Use "native" or "CODE:ISSUER".`,
      );
    }
    return new Asset(code, issuer);
  }
}
