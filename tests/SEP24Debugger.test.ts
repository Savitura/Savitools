import { SEP24Debugger } from '../src/debugger/SEP24Debugger';
import { SEP10Debugger } from '../src/debugger/SEP10Debugger';
import { mockServer, MockAnchor } from './mocks/MockAnchor';

describe('SEP24Debugger', () => {
  let mockAnchor: MockAnchor;
  let sep24Debugger: SEP24Debugger;
  let sep10Debugger: SEP10Debugger;

  beforeAll(async () => {
    mockAnchor = new MockAnchor();
    await mockAnchor.start();
  });

  afterAll(async () => {
    await mockAnchor.stop();
  });

  beforeEach(() => {
    sep10Debugger = new SEP10Debugger({
      anchorDomain: mockAnchor.domain,
      testnet: true
    });
    sep24Debugger = new SEP24Debugger(
      {
        anchorDomain: mockAnchor.domain,
        asset: 'TEST:USDC',
        flowType: 'deposit',
        testnet: true,
        timeout: 10000
      },
      sep10Debugger
    );
  });

  describe('successful flows', () => {
    it('should complete deposit flow successfully', async () => {
      mockAnchor.setupDepositSuccess();

      const result = await sep24Debugger.startFlow();

      expect(result.finalStatus).toBe('completed');
      expect(result.timeline.length).toBeGreaterThan(0);
      expect(result.interactiveUrl).toContain('interactive');

      // Verify timeline contains expected entries
      const actions = result.timeline.map(entry => entry.action);
      expect(actions).toContain('discovery');
      expect(actions).toContain('interactive_request');
      expect(actions).toContain('status_poll');
    });

    it('should complete withdrawal flow successfully', async () => {
      sep24Debugger = new SEP24Debugger(
        {
          anchorDomain: mockAnchor.domain,
          asset: 'TEST:USDC',
          flowType: 'withdrawal',
          testnet: true,
          timeout: 10000
        },
        sep10Debugger
      );

      mockAnchor.setupWithdrawalSuccess();

      const result = await sep24Debugger.startFlow();

      expect(result.finalStatus).toBe('completed');
      expect(result.timeline.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle user action required state', async () => {
      mockAnchor.setupUserActionRequired();

      const result = await sep24Debugger.startFlow();

      expect(result.finalStatus).toBe('user_action_required');
      expect(result.timeline.some(e => e.state === 'user_action_required')).toBe(true);
    });

    it('should handle transaction errors', async () => {
      mockAnchor.setupTransactionError();

      const result = await sep24Debugger.startFlow();

      expect(result.finalStatus).toBe('error');
      expect(result.timeline.some(e => e.state === 'error')).toBe(true);
    });

    it('should handle polling timeout', async () => {
      mockAnchor.setupPollingTimeout();

      const result = await sep24Debugger.startFlow();

      expect(result.finalStatus).toBe('error');
      expect(result.timeline.some(e => e.action === 'polling_timeout')).toBe(true);
    });

    it('should handle non-JSON responses', async () => {
      mockAnchor.setupNonJsonResponse();

      await expect(sep24Debugger.startFlow()).rejects.toThrow('Non-JSON response');
    });

    it('should handle missing transfer server', async () => {
      mockAnchor.setupMissingTransferServer();

      await expect(sep24Debugger.startFlow()).rejects.toThrow(
        'TRANSFER_SERVER_SEP0024 not found'
      );
    });
  });

  describe('security', () => {
    it('should block unsafe URLs', async () => {
      mockAnchor.setupUnsafeUrl();

      await expect(sep24Debugger.startFlow()).rejects.toThrow('Blocked URL scheme');
    });

    it('should redact sensitive data in timeline', async () => {
      mockAnchor.setupDepositSuccess();

      const result = await sep24Debugger.startFlow();

      // Check that no timeline entry contains unredacted sensitive data
      for (const entry of result.timeline) {
        const entryStr = JSON.stringify(entry);
        expect(entryStr).not.toMatch(/eyJ[A-Za-z0-9-_=]+/); // JWT
        expect(entryStr).not.toMatch(/S[A-Z2-7]{55}/); // Secret key
      }
    });
  });
});
