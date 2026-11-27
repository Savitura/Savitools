import {
  logToolExecutionFailure,
  executeToolAction,
  addToolExecutionFailureListener,
  removeToolExecutionFailureListener,
  clearToolExecutionFailureListeners,
  redactString,
  redactValue,
  sanitizeUrl,
  REDACTED,
} from '@/lib/tool-execution-logger';

describe('tool-execution-logger', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    clearToolExecutionFailureListeners();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    clearToolExecutionFailureListeners();
  });

  describe('logToolExecutionFailure - Primary path', () => {
    it('produces a normalized structured log payload and logs to console.error', () => {
      const error = new Error('Transaction simulation failed: insufficient balance');
      error.stack = 'Error: Transaction simulation failed\n    at simulate (composer.ts:42:15)';

      const payload = logToolExecutionFailure({
        toolName: 'Composer',
        action: 'simulate_transaction',
        error,
        context: {
          network: 'testnet',
          operationCount: 3,
        },
        componentStack: '    in OperationForm\n    in ComposerTool',
        url: 'https://tools.savitools.org/composer?draft=123',
      });

      expect(payload).toMatchObject({
        level: 'error',
        event: 'tool_execution_failed',
        toolName: 'Composer',
        action: 'simulate_transaction',
        error: {
          name: 'Error',
          message: 'Transaction simulation failed: insufficient balance',
          stack: expect.stringContaining('simulate (composer.ts:42:15)'),
        },
        componentStack: expect.stringContaining('in OperationForm'),
        context: {
          network: 'testnet',
          operationCount: 3,
        },
        url: '/composer',
      });
      expect(typeof payload.timestamp).toBe('string');
      expect(new Date(payload.timestamp).getTime()).not.toBeNaN();
      expect(payload.environment).toBeDefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ToolExecutionError:Composer]',
        expect.stringContaining('"event": "tool_execution_failed"'),
      );
    });
  });

  describe('Edge cases and error formats', () => {
    it('handles string errors gracefully', () => {
      const payload = logToolExecutionFailure({
        toolName: 'Inspector',
        action: 'decode_xdr',
        error: 'Malformed XDR envelope string',
      });

      expect(payload.error).toEqual({
        name: 'Error',
        message: 'Malformed XDR envelope string',
      });
      expect(payload.toolName).toBe('Inspector');
      expect(payload.action).toBe('decode_xdr');
    });

    it('handles null and undefined errors without throwing', () => {
      const payloadNull = logToolExecutionFailure({
        toolName: 'Sandbox',
        error: null,
      });
      expect(payloadNull.error.name).toBe('UnknownError');
      expect(payloadNull.error.message).toBe('null');

      const payloadUndefined = logToolExecutionFailure({
        toolName: 'Sandbox',
        error: undefined,
      });
      expect(payloadUndefined.error.name).toBe('UnknownError');
      expect(payloadUndefined.error.message).toBe('undefined');
    });

    it('extracts error codes and status codes when present on the error object', () => {
      const customError = new Error('Resource not found');
      (customError as unknown as Record<string, unknown>).code = 'ACCOUNT_NOT_FOUND';
      (customError as unknown as Record<string, unknown>).statusCode = 404;

      const payload = logToolExecutionFailure({
        toolName: 'Inspector',
        error: customError,
      });

      expect(payload.error.code).toBe('ACCOUNT_NOT_FOUND');
      expect(payload.error.statusCode).toBe(404);
    });

    it('falls back to default toolName if omitted or empty', () => {
      const payload = logToolExecutionFailure({
        toolName: '',
        error: new Error('boom'),
      });

      expect(payload.toolName).toBe('UnknownTool');
    });

    it('strips newlines and control characters from toolName and action to prevent log injection', () => {
      const payload = logToolExecutionFailure({
        toolName: 'Inspector\r\n[InjectedHeader: true]',
        action: 'run\ncmd',
        error: new Error('safe'),
      });

      expect(payload.toolName).toBe('Inspector[InjectedHeader: true]');
      expect(payload.action).toBe('runcmd');
    });
  });

  describe('Privacy and security redaction', () => {
    it('redacts Stellar secret seeds from error message, stack, and context', () => {
      const secretSeed = 'SCZANGBA5YHTNYVVV4C3U252E2B6P6F5T3U6L6XG7S6R5N4M3K2J1H0G';
      const error = new Error(`Failed to sign with seed ${secretSeed}`);
      error.stack = `Error: Failed with seed ${secretSeed}\n    at sign (signer.ts:10)`;

      const payload = logToolExecutionFailure({
        toolName: 'Composer',
        action: 'sign',
        error,
        context: {
          key: secretSeed,
          nested: {
            userSeed: secretSeed,
          },
        },
      });

      expect(payload.error.message).not.toContain(secretSeed);
      expect(payload.error.message).toContain(REDACTED);
      expect(payload.error.stack).not.toContain(secretSeed);
      expect(payload.error.stack).toContain(REDACTED);
      expect(payload.context?.key).toBe(REDACTED);
      expect((payload.context?.nested as Record<string, unknown>).userSeed).toBe(REDACTED);
    });

    it('redacts JWT tokens and Bearer headers', () => {
      const sampleJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const error = new Error(`Auth failed with token Bearer ${sampleJwt}`);

      const payload = logToolExecutionFailure({
        toolName: 'Playground',
        action: 'proxy_request',
        error,
        context: {
          authorization: `Bearer ${sampleJwt}`,
          authToken: sampleJwt,
        },
      });

      expect(payload.error.message).not.toContain(sampleJwt);
      expect(payload.error.message).toContain(REDACTED);
      expect(payload.context?.authorization).toBe(REDACTED);
      expect(payload.context?.authToken).toBe(REDACTED);
    });

    it('redacts sensitive keys in context objects regardless of value format', () => {
      const context = {
        password: 'my-super-secret-password',
        signing_key: 'custom-private-key-material',
        apiKey: 'fluxa_live_998877665544332211',
        session_token: 'tok_abc123',
        normalField: 'public-data',
        count: 42,
      };

      const redacted = redactValue(context) as Record<string, unknown>;

      expect(redacted.password).toBe(REDACTED);
      expect(redacted.signing_key).toBe(REDACTED);
      expect(redacted.apiKey).toBe(REDACTED);
      expect(redacted.session_token).toBe(REDACTED);
      expect(redacted.normalField).toBe('public-data');
      expect(redacted.count).toBe(42);
    });

    it('handles circular references in context gracefully', () => {
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;

      const payload = logToolExecutionFailure({
        toolName: 'Graph',
        error: new Error('Cycle detected'),
        context: circular,
      });

      expect(payload.context?.name).toBe('test');
      expect(payload.context?.self).toBe('[Circular]');
    });

    it('guards against excessive nesting depth in context', () => {
      const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };
      const redacted = redactValue(deep) as Record<string, unknown>;
      const level3 = (redacted.a as any).b.c;
      expect(level3).toBe('[MaxDepthExceeded]');
    });

    it('sanitizes URL by stripping query parameters and basic auth credentials', () => {
      const rawUrl = 'https://admin:secretPass@horizon.stellar.org/accounts?api_key=secret#anchor';
      const sanitized = sanitizeUrl(rawUrl);
      expect(sanitized).toBe('/accounts');
      expect(sanitized).not.toContain('secretPass');
      expect(sanitized).not.toContain('api_key');
    });
  });

  describe('executeToolAction wrapper', () => {
    it('returns the result when the action succeeds without logging', async () => {
      const result = await executeToolAction('Simulator', 'find_paths', async () => {
        return { paths: ['USDC', 'XLM'] };
      });

      expect(result).toEqual({ paths: ['USDC', 'XLM'] });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('logs structured failure and rethrows when action throws', async () => {
      const failureError = new Error('Path not found');

      await expect(
        executeToolAction('Simulator', 'find_paths', async () => {
          throw failureError;
        }, { sourceAsset: 'XLM', destAsset: 'NONEXISTENT' }),
      ).rejects.toThrow('Path not found');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ToolExecutionError:Simulator]',
        expect.stringContaining('"action": "find_paths"'),
      );
    });
  });

  describe('Listeners and telemetry subscriptions', () => {
    it('notifies registered listeners of structured failure events', () => {
      const listenerA = jest.fn();
      const listenerB = jest.fn();

      const unsubscribeA = addToolExecutionFailureListener(listenerA);
      addToolExecutionFailureListener(listenerB);

      const payload = logToolExecutionFailure({
        toolName: 'Multisig',
        action: 'verify_signatures',
        error: new Error('Threshold not met'),
      });

      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerA).toHaveBeenCalledWith(payload);
      expect(listenerB).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledWith(payload);

      // Unsubscribe listener A
      unsubscribeA();

      logToolExecutionFailure({
        toolName: 'Multisig',
        action: 'second_attempt',
        error: new Error('Still failing'),
      });

      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(2);
    });

    it('does not let exceptions in a listener disrupt logging execution', () => {
      const faultyListener = jest.fn(() => {
        throw new Error('Listener internal failure');
      });
      const healthyListener = jest.fn();

      addToolExecutionFailureListener(faultyListener);
      addToolExecutionFailureListener(healthyListener);

      expect(() => {
        logToolExecutionFailure({
          toolName: 'Contracts',
          error: new Error('Deploy error'),
        });
      }).not.toThrow();

      expect(faultyListener).toHaveBeenCalled();
      expect(healthyListener).toHaveBeenCalled();
    });

    it('supports removeToolExecutionFailureListener directly', () => {
      const listener = jest.fn();
      addToolExecutionFailureListener(listener);
      removeToolExecutionFailureListener(listener);

      logToolExecutionFailure({
        toolName: 'Webhooks',
        error: new Error('Delivery failed'),
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
