import { ConfigService } from '@nestjs/config';
import { DiagnosticsService } from './diagnostics.service';
import { REDACTED } from '../../common/redaction';

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: <T = string>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

describe('DiagnosticsService (Savitura/Savitools#506)', () => {
  const SECRET_JWT =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVl';
  const SECRET_SEED = 'S' + 'A'.repeat(55);

  it('builds a bundle with metadata and env statuses (primary path)', () => {
    const service = new DiagnosticsService(
      makeConfig({
        JWT_SECRET: 'super-secret-jwt-value-with-length',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        STELLAR_NETWORK: 'testnet',
        STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org/some/path',
      }),
    );

    const bundle = service.build();

    expect(bundle.serviceName).toBe('savitools-api');
    expect(bundle.requiredEnvStatus.JWT_SECRET).toBe('set');
    expect(bundle.requiredEnvStatus.ENCRYPTION_SECRET).toBe('missing');
    expect(bundle.networkConfig.stellarNetwork).toBe('testnet');
    expect(bundle.networkConfig.STELLAR_HORIZON_URL).toBe(
      'https://horizon-testnet.stellar.org/some/path',
    );
    expect(bundle.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts a JWT recorded via recordError', () => {
    const service = new DiagnosticsService(makeConfig({}));
    service.recordError(`Auth failed for token ${SECRET_JWT}`);

    const bundle = service.build();
    const joined = bundle.recentErrors.join('\n');

    expect(joined).toContain(REDACTED);
    expect(joined).not.toContain(SECRET_JWT);
    expect(bundle.redactionCount).toBeGreaterThan(0);
  });

  it('redacts a Stellar secret seed in a recorded log line', () => {
    const service = new DiagnosticsService(makeConfig({}));
    service.recordError(`Deployer key ${SECRET_SEED} was used`);

    const bundle = service.build();
    expect(bundle.recentErrors.join('\n')).not.toContain(SECRET_SEED);
    expect(bundle.recentErrors.join('\n')).toContain(REDACTED);
  });

  it('caps recentErrors at 20 entries', () => {
    const service = new DiagnosticsService(makeConfig({}));
    for (let i = 0; i < 30; i += 1) {
      service.recordError(`error ${i}`);
    }
    const bundle = service.build();
    expect(bundle.recentErrors).toHaveLength(20);
    expect(bundle.recentErrors[0]).toBe('error 10');
  });

  it('never serializes the value of a known secret env var', () => {
    const secretValue = 'a-very-long-secret-value-that-should-never-leak-12345';
    const service = new DiagnosticsService(makeConfig({ JWT_SECRET: secretValue }));

    const serialized = JSON.stringify(service.build());
    expect(serialized).not.toContain(secretValue);
  });
});
