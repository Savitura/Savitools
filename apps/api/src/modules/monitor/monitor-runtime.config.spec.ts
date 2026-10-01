import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_MAX_SSE_CONNECTIONS,
  MonitorRuntimeConfig,
} from './monitor-runtime.config';

describe('MonitorRuntimeConfig', () => {
  function makeConfig(values: Record<string, string> = {}): MonitorRuntimeConfig {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        Object.prototype.hasOwnProperty.call(values, key)
          ? values[key]
          : fallback,
      ),
    } as unknown as ConfigService;
    return new MonitorRuntimeConfig(configService);
  }

  it('defaults to role=all with both producers and consumers enabled', () => {
    const runtime = makeConfig();
    expect(runtime.role).toBe('all');
    expect(runtime.producerEnabled).toBe(true);
    expect(runtime.consumerEnabled).toBe(true);
    expect(runtime.maxSseConnections).toBe(DEFAULT_MAX_SSE_CONNECTIONS);
    expect(runtime.leaderLeaseMs).toBe(30_000);
    expect(runtime.dispatchIntervalMs).toBe(30_000);
    expect(runtime.evaluationIntervalMs).toBe(60_000);
  });

  it('disables producers in api role', () => {
    const runtime = makeConfig({ MONITOR_ROLE: 'api' });
    expect(runtime.role).toBe('api');
    expect(runtime.producerEnabled).toBe(false);
    expect(runtime.consumerEnabled).toBe(false);
  });

  it('enables producers and consumers in worker role', () => {
    const runtime = makeConfig({ MONITOR_ROLE: 'worker' });
    expect(runtime.role).toBe('worker');
    expect(runtime.producerEnabled).toBe(true);
    expect(runtime.consumerEnabled).toBe(true);
  });

  it('rejects an invalid MONITOR_ROLE at startup', () => {
    expect(() => makeConfig({ MONITOR_ROLE: 'invalid' })).toThrow(
      /MONITOR_ROLE must be one of/,
    );
  });

  it('resolves MAX_SSE_CONNECTIONS from environment without inline fallbacks', () => {
    const runtime = makeConfig({ MAX_SSE_CONNECTIONS: '25' });
    expect(runtime.maxSseConnections).toBe(25);
  });

  it('falls back to default when MAX_SSE_CONNECTIONS is non-positive or unparseable', () => {
    expect(makeConfig({ MAX_SSE_CONNECTIONS: '0' }).maxSseConnections).toBe(
      DEFAULT_MAX_SSE_CONNECTIONS,
    );
    expect(makeConfig({ MAX_SSE_CONNECTIONS: '-5' }).maxSseConnections).toBe(
      DEFAULT_MAX_SSE_CONNECTIONS,
    );
    expect(makeConfig({ MAX_SSE_CONNECTIONS: 'abc' }).maxSseConnections).toBe(
      DEFAULT_MAX_SSE_CONNECTIONS,
    );
  });

  it('honors MONITOR_EVALUATION_INTERVAL_MS=0 for disabling state evaluation', () => {
    const runtime = makeConfig({ MONITOR_EVALUATION_INTERVAL_MS: '0' });
    expect(runtime.evaluationIntervalMs).toBe(0);
  });

  it('enforces a minimum lease duration of 1000ms', () => {
    const runtime = makeConfig({ MONITOR_LEADER_LEASE_MS: '100' });
    expect(runtime.leaderLeaseMs).toBe(1000);
  });
});
