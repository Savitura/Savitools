import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Keypair, TransactionBuilder, BASE_FEE, Networks, Operation, Asset, Memo } from '@stellar/stellar-sdk';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PaymentDto } from './dto/payment.dto';

export interface Balance {
  assetType: string;
  assetCode: string | null;
  assetIssuer: string | null;
  balance: string;
  limit?: string;
}

export interface AccountDetails {
  publicKey: string;
  sequenceNumber: string;
  balances: Balance[];
  signers: Array<{ publicKey: string; weight: number }>;
  thresholds: {
    lowThreshold: number;
    medThreshold: number;
    highThreshold: number;
  };
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authImmutable: boolean;
  };
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  private readonly server = new StellarSdk.Horizon.Server('https://horizon-testnet.stellar.org');
  private readonly friendbotUrl = 'https://friendbot.stellar.org';

  generateKeypair() {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  async fundFromFriendbot(publicKey: string) {
    const url = `${this.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Friendbot request failed for ${publicKey}: ${message}`);
      throw new BadRequestException(`Friendbot request failed: ${message}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Friendbot error for ${publicKey}: ${response.status} ${body}`);
      throw new BadRequestException(
        `Friendbot funding failed (${response.status}): ${body || response.statusText}`,
      );
    }

    const json: any = await response.json().catch(() => ({}));

    return {
      publicKey,
      funded: true,
      txHash: json.hash ?? null,
      confirmationStatus: 'success',
      startingBalance: '10,000 XLM',
    };
  }

  async getAccount(publicKey: string): Promise<AccountDetails> {
    let account: any;
    try {
      account = await this.server.loadAccount(publicKey);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to load account ${publicKey}: ${message}`);
      if (message.includes('not found') || message.includes('404')) {
        throw new BadRequestException(
          `Account ${publicKey} not found on testnet. Fund it via Friendbot first.`,
        );
      }
      throw new BadRequestException(`Failed to load account: ${message}`);
    }

    const balances: Balance[] = account.balances.map((b: any) => ({
      assetType: b.asset_type,
      assetCode: b.asset_code ?? null,
      assetIssuer: b.asset_issuer ?? null,
      balance: b.balance,
      limit: b.limit ?? undefined,
    }));

    const signers = account.signers.map((s: any) => ({
      publicKey: s.public_key,
      weight: s.weight,
    }));

    return {
      publicKey,
      sequenceNumber: account.sequence,
      balances,
      signers,
      thresholds: {
        lowThreshold: account.thresholds.low_threshold,
        medThreshold: account.thresholds.med_threshold,
        highThreshold: account.thresholds.high_threshold,
      },
      flags: {
        authRequired: account.flags.auth_required,
        authRevocable: account.flags.auth_revocable,
        authImmutable: account.flags.auth_immutable,
      },
    };
  }

  async sendPayment(dto: PaymentDto) {
    let sourceKeypair: Keypair;
    try {
      sourceKeypair = Keypair.fromSecret(dto.fromSecret);
    } catch {
      throw new BadRequestException('Invalid source secret key');
    }

    const sourcePublicKey = sourceKeypair.publicKey();

    if (!dto.toPublicKey || dto.toPublicKey.length < 56) {
      throw new BadRequestException('Invalid destination public key');
    }

    const parsedAmount = parseFloat(dto.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    let paymentAsset: Asset;
    if (dto.asset === 'XLM') {
      paymentAsset = Asset.native();
    } else {
      const parts = dto.asset.split(':');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new BadRequestException(
          `Invalid asset format: "${dto.asset}". Use "XLM" or "CODE:ISSUER"`,
        );
      }
      paymentAsset = new Asset(parts[0], parts[1]);
    }

    let sourceAccount: any;
    try {
      sourceAccount = await this.server.loadAccount(sourcePublicKey);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to load source account ${sourcePublicKey}: ${message}`);
      throw new BadRequestException(`Failed to load source account: ${message}`);
    }

    let txBuilder = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    });

    txBuilder = txBuilder.addOperation(
      Operation.payment({
        destination: dto.toPublicKey,
        asset: paymentAsset,
        amount: dto.amount,
      }),
    );

    if (dto.memo) {
      try {
        txBuilder = txBuilder.addMemo(Memo.text(dto.memo));
      } catch (err) {
        throw new BadRequestException('Invalid memo format');
      }
    }

    let tx: StellarSdk.Transaction;
    try {
      tx = txBuilder.setTimeout(30).build();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new BadRequestException(`Failed to build transaction: ${message}`);
    }

    tx.sign(sourceKeypair);

    let result: any;
    try {
      result = await this.server.submitTransaction(tx);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Transaction submission failed: ${message}`);
      throw new BadRequestException(`Payment failed: ${message}`);
    }

    return {
      success: true,
      txHash: result.hash,
      feeCharged: result.fee_charged,
      resultCode: result.result_codes?.operation_results?.[0] || 'success',
      destination: dto.toPublicKey,
      asset: dto.asset,
      amount: dto.amount,
    };
  }
}
