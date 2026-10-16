import { Keypair, Networks, TransactionBuilder, BASE_FEE, Operation } from 'stellar-sdk';
import { URLValidator } from '../util/URLValidator';
import { Redactor } from '../util/Redactor';

interface SEP10AuthResult {
  token: string;
  clientSecret: string;
}

interface SEP10Config {
  anchorDomain: string;
  testnet: boolean;
}

export class SEP10Debugger {
  private config: SEP10Config;
  private urlValidator: URLValidator;
  private redactor: Redactor;
  private authTokens: Map<string, { token: string; expiresAt: number }> = new Map();
  private clientKeypair: Keypair;

  constructor(config?: Partial<SEP10Config>) {
    this.config = {
      testnet: true,
      ...config
    };
    this.urlValidator = new URLValidator();
    this.redactor = new Redactor();
    this.clientKeypair = Keypair.random();
  }

  public async startAuthFlow(
    authEndpoint: string,
    testnet: boolean = this.config.testnet
  ): Promise<SEP10AuthResult> {
    const challenge = await this.fetchChallenge(authEndpoint);
    const signedChallenge = this.signChallenge(challenge, testnet);
    const tokenResponse = await this.submitChallenge(
      authEndpoint,
      signedChallenge
    );

    const token = tokenResponse.token || tokenResponse.jwt;
    if (!token) {
      throw new Error('No token in SEP-10 response');
    }

    this.authTokens.set(authEndpoint, {
      token,
      expiresAt: Date.now() + (tokenResponse.expires_in || 3600) * 1000
    });

    return {
      token,
      clientSecret: this.clientKeypair.secret()
    };
  }

  public hasValidToken(authEndpoint: string): boolean {
    const stored = this.authTokens.get(authEndpoint);
    if (!stored) return false;
    return stored.expiresAt > Date.now();
  }

  public getToken(authEndpoint: string): string {
    const stored = this.authTokens.get(authEndpoint);
    if (!stored || stored.expiresAt <= Date.now()) {
      throw new Error('No valid token available');
    }
    return stored.token;
  }

  private async fetchChallenge(authEndpoint: string): Promise<Record<string, unknown>> {
    const url = new URL(authEndpoint);
    url.searchParams.append('account', this.clientKeypair.publicKey());
    url.searchParams.append('memo', 'test_debugger');

    const response = await this.safeFetch(url.toString());
    return this.parseJsonResponse(response);
  }

  private signChallenge(
    challenge: Record<string, unknown>,
    testnet: boolean
  ): string {
    const network = testnet ? Networks.TESTNET : Networks.PUBLIC;
    const transaction = new TransactionBuilder(
      {
        fee: BASE_FEE,
        networkPassphrase: network
      },
      {
        timebounds: {
          minTime: Math.floor(Date.now() / 1000),
          maxTime: Math.floor(Date.now() / 1000) + 600 // 10 minutes
        }
      }
    )
      .addOperation(
        Operation.manageData({
          name: 'SEP-10 Auth',
          value: JSON.stringify(challenge),
          source: this.clientKeypair.publicKey()
        })
      )
      .setTimeout(30)
      .build();

    transaction.sign(this.clientKeypair);
    return transaction.toXDR();
  }

  private async submitChallenge(
    authEndpoint: string,
    signedChallenge: string
  ): Promise<Record<string, unknown>> {
    const response = await this.safeFetch(authEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction: signedChallenge
      })
    });

    return this.parseJsonResponse(response);
  }

  private async safeFetch(url: string, options?: RequestInit): Promise<Response> {
    this.urlValidator.validate(url);

    const response = await fetch(url, {
      ...options,
      redirect: 'manual'
    });

    if (response.status >= 400) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return response;
  }

  private async parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Non-JSON response: ${text.substring(0, 200)}`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
