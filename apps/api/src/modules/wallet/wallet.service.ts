import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Keypair, TransactionBuilder, BASE_FEE, Networks, Operation, Asset } from '@stellar/stellar-sdk';
import * as StellarSdk from '@stellar/stellar-sdk';

export interface Balance {
  assetType: string;
  assetCode: string | null;
  assetIssuer: string | null;
  balance: string;
  limit?: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

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
      startingBalance: '10,000 XLM',
    };
  }

  async getBalances(publicKey: string) {
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

    return { publicKey, balances };
  }

  async sendPayment(
    sourceSecret: string,
    destination: string,
    assetString: string,
    amount: string,
  ) {
    let sourceKeypair: Keypair;
    try {
      sourceKeypair = Keypair.fromSecret(sourceSecret);
    } catch {
      throw new BadRequestException('Invalid source secret key');
    }

    const sourcePublicKey = sourceKeypair.publicKey();

    if (!destination || destination.length < 56) {
      throw new BadRequestException('Invalid destination public key');
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    let paymentAsset: Asset;
    if (assetString === 'XLM') {
      paymentAsset = Asset.native();
    } else {
      const parts = assetString.split(':');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new BadRequestException(
          `Invalid asset format: "${assetString}". Use "XLM" or "CODE:ISSUER"`,
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

    let tx: StellarSdk.Transaction;
    try {
      tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.payment({
          destination,
          asset: paymentAsset,
          amount,
        }))
        .setTimeout(30)
        .build();
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
      destination,
      asset: assetString,
      amount,
    };
  }
}
