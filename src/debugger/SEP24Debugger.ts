import { Horizon, Keypair, Networks, TransactionBuilder, BASE_FEE, Operation, Asset } from 'stellar-sdk';
import { SEP10Debugger } from './SEP10Debugger';
import { StellarTomlResolver } from '../util/StellarTomlResolver';
import { URLValidator } from '../util/URLValidator';
import { Redactor } from '../util/Redactor';

interface SEP24Config {
  anchorDomain: string;
  asset: string;
  flowType: 'deposit' | 'withdrawal';
  testnet: boolean;
  timeout?: number;
}

interface TimelineEntry {
  timestamp: string;
  action: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  state?: string;
  url?: string;
}

interface TransactionStatus {
  id: string;
  status: string;
  status_eta?: number;
  more_info_url?: string;
  message?: string;
  required_fields?: string[];
}

interface SEP24FlowResult {
  transactionId: string;
  interactiveUrl: string;
  timeline: TimelineEntry[];
  finalStatus: string;
}

export class SEP24Debugger {
  private config: SEP24Config;
  private sep10Debugger: SEP10Debugger;
  private tomlResolver: StellarTomlResolver;
  private urlValidator: URLValidator;
  private redactor: Redactor;
  private timeline: TimelineEntry[] = [];
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(config: SEP24Config, sep10Debugger?: SEP10Debugger) {
    this.config = {
      timeout: 300000, // 5 minutes default
      ...config
    };
    this.sep10Debugger = sep10Debugger || new SEP10Debugger();
    this.tomlResolver = new StellarTomlResolver();
    this.urlValidator = new URLValidator();
    this.redactor = new Redactor();
  }

  public async startFlow(): Promise<SEP24FlowResult> {
    try {
      const transferServerUrl = await this.discoverTransferServer();
      const authResult = await this.handleAuthentication(transferServerUrl);
      const { interactiveUrl, transactionId } = await this.initiateInteractiveFlow(
        transferServerUrl,
        authResult.token
      );

      await this.monitorTransactionStatus(transferServerUrl, transactionId);

      return {
        transactionId,
        interactiveUrl,
        timeline: this.getRedactedTimeline(),
        finalStatus: this.timeline[this.timeline.length - 1]?.state || 'unknown'
      };
    } catch (error) {
      this.addTimelineEntry({
        action: 'flow_error',
        state: 'error',
        response: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    } finally {
      this.stopPolling();
    }
  }

  private async discoverTransferServer(): Promise<string> {
    const toml = await this.tomlResolver.resolve(this.config.anchorDomain);
    const transferServer = toml.TRANSFER_SERVER_SEP0024;

    if (!transferServer) {
      throw new Error(`TRANSFER_SERVER_SEP0024 not found in ${this.config.anchorDomain}/.well-known/stellar.toml`);
    }

    this.addTimelineEntry({
      action: 'discovery',
      state: 'completed',
      response: { transferServer }
    });

    return transferServer;
  }

  private async handleAuthentication(transferServerUrl: string): Promise<{ token: string }> {
    if (this.sep10Debugger.hasValidToken(transferServerUrl)) {
      const token = this.sep10Debugger.getToken(transferServerUrl);
      this.addTimelineEntry({
        action: 'auth_reuse',
        state: 'completed',
        response: { reused: true }
      });
      return { token };
    }

    const authResult = await this.sep10Debugger.startAuthFlow(
      transferServerUrl,
      this.config.testnet
    );

    this.addTimelineEntry({
      action: 'authentication',
      state: 'completed',
      response: { authenticated: true }
    });

    return { token: authResult.token };
  }

  private async initiateInteractiveFlow(
    transferServerUrl: string,
    authToken: string
  ): Promise<{ interactiveUrl: string; transactionId: string }> {
    const endpoint = this.getInteractiveEndpoint(transferServerUrl);
    const requestBody = this.buildInteractiveRequest(authToken);

    this.addTimelineEntry({
      action: 'interactive_request',
      request: this.redactor.redact(requestBody),
      url: endpoint
    });

    const response = await this.safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Interactive request failed: ${response.status} ${response.statusText}`);
    }

    const data = await this.parseJsonResponse(response);
    this.validateInteractiveResponse(data);

    this.addTimelineEntry({
      action: 'interactive_response',
      response: this.redactor.redact(data),
      state: 'interactive_ready'
    });

    return {
      interactiveUrl: data.url,
      transactionId: data.id
    };
  }

  private getInteractiveEndpoint(baseUrl: string): string {
    const url = new URL(baseUrl);
    return `${url.origin}/transactions/${this.config.flowType}/interactive`;
  }

  private buildInteractiveRequest(authToken: string): Record<string, unknown> {
    const baseRequest = {
      asset: this.config.asset,
      client_domain: this.config.anchorDomain,
      locale: 'en'
    };

    if (this.config.flowType === 'deposit') {
      return {
        ...baseRequest,
        type: 'bank_account',
        fields: {
          transaction: {
            kind: 'deposit',
            asset: this.config.asset
          }
        }
      };
    }

    // Withdrawal flow
    return {
      ...baseRequest,
      type: 'bank_account',
      fields: {
        transaction: {
          kind: 'withdrawal',
          asset: this.config.asset
        },
        destination: Keypair.random().publicKey()
      }
    };
  }

  private async monitorTransactionStatus(
    transferServerUrl: string,
    transactionId: string
  ): Promise<void> {
    this.isPolling = true;
    const startTime = Date.now();

    const poll = async () => {
      if (!this.isPolling) return;

      if (Date.now() - startTime > (this.config.timeout || 300000)) {
        this.addTimelineEntry({
          action: 'polling_timeout',
          state: 'error',
          response: { error: 'Polling timeout reached' }
        });
        this.stopPolling();
        return;
      }

      try {
        const status = await this.fetchTransactionStatus(transferServerUrl, transactionId);
        this.addTimelineEntry({
          action: 'status_poll',
          state: status.status,
          response: this.redactor.redact(status)
        });

        if (this.isTerminalState(status.status)) {
          this.stopPolling();
          return;
        }

        if (status.status_eta) {
          await this.delay(status.status_eta * 1000);
        } else {
          await this.delay(5000); // Default 5s delay
        }

        if (this.isPolling) {
          poll();
        }
      } catch (error) {
        this.addTimelineEntry({
          action: 'status_poll_error',
          state: 'error',
          response: { error: error instanceof Error ? error.message : String(error) }
        });
        this.stopPolling();
      }
    };

    await poll();
  }

  private async fetchTransactionStatus(
    transferServerUrl: string,
    transactionId: string
  ): Promise<TransactionStatus> {
    const url = `${transferServerUrl}/transaction?id=${transactionId}`;
    const response = await this.safeFetch(url);

    if (!response.ok) {
      throw new Error(`Status fetch failed: ${response.status} ${response.statusText}`);
    }

    return this.parseJsonResponse(response);
  }

  private isTerminalState(status: string): boolean {
    const terminalStates = [
      'completed',
      'processed',
      'error',
      'no_issuer',
      'reversed'
    ];
    return terminalStates.includes(status);
  }

  private async safeFetch(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
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

  private validateInteractiveResponse(data: Record<string, unknown>): void {
    if (!data.url || typeof data.url !== 'string') {
      throw new Error('Invalid interactive response: missing url');
    }

    if (!data.id || typeof data.id !== 'string') {
      throw new Error('Invalid interactive response: missing transaction id');
    }

    this.urlValidator.validate(data.url as string);
  }

  private addTimelineEntry(entry: Omit<TimelineEntry, 'timestamp'>): void {
    this.timeline.push({
      ...entry,
      timestamp: new Date().toISOString()
    });
  }

  private getRedactedTimeline(): TimelineEntry[] {
    return this.timeline.map(entry => ({
      ...entry,
      request: entry.request ? this.redactor.redact(entry.request) : undefined,
      response: entry.response ? this.redactor.redact(entry.response) : undefined
    }));
  }

  private stopPolling(): void {
    this.isPolling = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
