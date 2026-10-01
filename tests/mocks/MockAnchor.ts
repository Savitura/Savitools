import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import { Keypair, Networks, TransactionBuilder, BASE_FEE, Operation } from 'stellar-sdk';

export class MockAnchor {
  public app: Express;
  public server: ReturnType<typeof this.app.listen> | null = null;
  public domain: string;
  private port: number;
  private currentState: Record<string, unknown> = {};

  constructor(port: number = 3001) {
    this.port = port;
    this.domain = `mock-anchor.local:${port}`;
    this.app = express();
    this.setupBaseRoutes();
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  private setupBaseRoutes(): void {
    this.app.use(bodyParser.json());

    // stellar.toml
    this.app.get('/.well-known/stellar.toml', (req: Request, res: Response) => {
      res.type('application/toml');
      res.send(`
        TRANSFER_SERVER_SEP0024="http://${this.domain}/sep24"
        SIGNING_KEY="${Keypair.random().publicKey()}"
        HORIZON_URL="https://horizon-testnet.stellar.org"
      `);
    });

    // SEP-10 authentication
    this.app.get('/sep10/auth', (req: Request, res: Response) => {
      const account = req.query.account as string;
      if (!account) {
        return res.status(400).json({ error: 'account is required' });
      }

      const challenge = {
        transaction: TransactionBuilder
          .fromXDR(
            new TransactionBuilder(
              {
                fee: BASE_FEE,
                networkPassphrase: Networks.TESTNET
              },
              {
                timebounds: {
                  minTime: Math.floor(Date.now() / 1000),
                  maxTime: Math.floor(Date.now() / 1000) + 600
                }
              }
            )
              .addOperation(
                Operation.manageData({
                  name: 'SEP-10 Auth',
                  value: 'test',
                  source: account
                })
              )
              .setTimeout(30)
              .build()
              .toXDR(),
            Networks.TESTNET
          )
          .toXDR(),
        network_passphrase: Networks.TESTNET
      };

      res.json(challenge);
    });

    this.app.post('/sep10/auth', (req: Request, res: Response) => {
      const { transaction } = req.body;
      if (!transaction) {
        return res.status(400).json({ error: 'transaction is required' });
      }

      res.json({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        expires_in: 3600
      });
    });

    // SEP-24 endpoints
    this.app.post('/sep24/transactions/deposit/interactive', (req: Request, res: Response) => {
      if (this.currentState.depositError) {
        return res.status(400).json({ error: 'Deposit not available' });
      }

      res.json({
        id: 'test-deposit-' + Date.now(),
        url: `http://${this.domain}/sep24/interactive?transaction_id=test-deposit-${Date.now()}`
      });
    });

    this.app.post('/sep24/transactions/withdrawal/interactive', (req: Request, res: Response) => {
      if (this.currentState.withdrawalError) {
        return res.status(400).json({ error: 'Withdrawal not available' });
      }

      res.json({
        id: 'test-withdrawal-' + Date.now(),
        url: `http://${this.domain}/sep24/interactive?transaction_id=test-withdrawal-${Date.now()}`
      });
    });

    this.app.get('/sep24/transaction', (req: Request, res: Response) => {
      const id = req.query.id as string;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      if (this.currentState.nonJsonResponse) {
        return res.type('text/plain').send('Not a JSON response');
      }

      if (this.currentState.timeout) {
        // Never respond to simulate timeout
        return;
      }

      if (this.currentState.userActionRequired) {
        return res.json({
          id,
          status: 'user_action_required',
          status_eta: 30,
          more_info_url: `http://${this.domain}/more-info`,
          message: 'User action is required to complete this transaction'
        });
      }

      if (this.currentState.error) {
        return res.json({
          id,
          status: 'error',
          message: 'Transaction failed'
        });
      }

      // Default success response
      res.json({
        id,
        status: 'completed',
        message: 'Transaction completed successfully'
      });
    });

    // Setup methods for tests
    public setupDepositSuccess(): void {
      this.currentState = { depositError: false };
    }

    public setupWithdrawalSuccess(): void {
      this.currentState = { withdrawalError: false };
    }

    public setupUserActionRequired(): void {
      this.currentState = { userActionRequired: true };
    }

    public setupTransactionError(): void {
      this.currentState = { error: true };
    }

    public setupPollingTimeout(): void {
      this.currentState = { timeout: true };
    }

    public setupNonJsonResponse(): void {
      this.currentState = { nonJsonResponse: true };
    }

    public setupMissingTransferServer(): void {
      this.app.get('/.well-known/stellar.toml', (req: Request, res: Response) => {
        res.type('application/toml');
        res.send(`
          SIGNING_KEY="${Keypair.random().publicKey()}"
          HORIZON_URL="https://horizon-testnet.stellar.org"
        `);
      });
    }

    public setupUnsafeUrl(): void {
      // This would be handled by the URLValidator in the actual implementation
      // For testing, we just need to ensure the validator is called
    }
}
