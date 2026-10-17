import { Injectable } from '@nestjs/common';
import {
  StellarTestnetService,
  type Balance,
} from '../stellar/stellar-testnet.service';

export type { Balance };

/**
 * Testnet wallet behind the Wallet page.
 *
 * The Stellar mechanics live in StellarTestnetService so this module and the
 * sandbox cannot drift apart. What stays here is the response shape the Wallet
 * page renders.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly stellar: StellarTestnetService = new StellarTestnetService(),
  ) {}

  /** Horizon client shared with the sandbox. */
  private get server() {
    return this.stellar.server;
  }

  generateKeypair() {
    return this.stellar.generateKeypair();
  }

  async fundFromFriendbot(publicKey: string) {
    const reply = await this.stellar.requestFriendbotFunding(publicKey);

    if (!reply.ok) {
      throw this.stellar.friendbotFailure(reply);
    }

    return {
      publicKey,
      funded: true,
      txHash: reply.hash,
      startingBalance: '10,000 XLM',
    };
  }

  async getBalances(publicKey: string) {
    const account = await this.stellar.loadAccount(publicKey);

    return {
      publicKey,
      balances: this.stellar.mapBalances(account),
    };
  }

  async sendPayment(
    sourceSecret: string,
    destination: string,
    assetString: string,
    amount: string,
  ) {
    const result = await this.stellar.submitPayment({
      sourceSecret,
      destination,
      asset: assetString,
      amount,
    });

    // Decoded after the submission so the validation order (and therefore the
    // error a caller sees for a bad destination) stays inside submitPayment.
    const parsed = this.stellar.assertDestination(destination);

    return {
      success: true,
      txHash: result.hash,
      destination,
      // For an M… address, the funds land in the underlying G… account; the
      // wallet page shows the two halves separately rather than echoing the
      // muxed string as if it were an account.
      destinationAccount: parsed.account,
      muxedId: parsed.muxedId,
      asset: assetString,
      amount,
    };
  }
}
