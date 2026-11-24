import { ConfigService } from '@nestjs/config';
import { DiagnosticsService } from './diagnostics.service';

/**
 * End-to-end redaction assertion: plant several real-shaped secrets in every
 * field a bundle could touch, then verify none survive serialization.
 */
function makeConfig(values: Record<string, string>): ConfigService {
  return {
    get: <T = string>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

describe('Diagnostics bundle secret scanner (Savitura/Savitools#506)', () => {
  const JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVlLWhlcmU';
  const SEED = 'S' + 'A'.repeat(55);
  const BEARER = 'Bearer abc.def.ghi';
  const JWT_ENV_VALUE = 'super-secret-jwt-value-with-length';
  const ENCRYPTION_ENV_VALUE = 'super-secret-encryption-value-longer-than-32';

  const planted: Array<[string, string]> = [
    ['JWT', JWT],
    ['Seed', SEED],
    ['Bearer token', BEARER],
    ['JWT_SECRET value', JWT_ENV_VALUE],
    ['ENCRYPTION_SECRET value', ENCRYPTION_ENV_VALUE],
  ];

  it.each(planted)(
    'does not leak %s in the serialized bundle',
    (_kind, value) => {
      const service = new DiagnosticsService(
        makeConfig({
          JWT_SECRET: JWT_ENV_VALUE,
          ENCRYPTION_SECRET: ENCRYPTION_ENV_VALUE,
        }),
      );

      service.recordError(`incident: saw ${value} while processing`);
      const serialized = JSON.stringify(service.build());
      expect(serialized).not.toContain(value);
    },
  );

  it('redacts bearer tokens that were present in the recorded message', () => {
    const service = new DiagnosticsService(makeConfig({}));
    service.recordError(`Authorization: ${BEARER}`);
    const serialized = JSON.stringify(service.build());
    expect(serialized).not.toContain('abc.def.ghi');
    expect(serialized).toContain('[REDACTED]');
  });
});
