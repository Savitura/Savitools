import {
  DEFAULT_PLAYGROUND_BASE_URLS,
  configuredPlaygroundBaseUrl,
  normalizePlaygroundBaseUrl,
  playgroundBaseUrlEnvKey,
  playgroundConnectOrigins,
  resolvePlaygroundBaseUrl,
} from '@/lib/playground-origins';

const ENV_KEYS = ['NEXT_PUBLIC_FLUXA_API_URL', 'NEXT_PUBLIC_CROWDPAY_API_URL'] as const;

const originalEnv = ENV_KEYS.reduce<Record<string, string | undefined>>((acc, key) => {
  acc[key] = process.env[key];
  return acc;
}, {});

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('playground origins', () => {
  afterEach(restoreEnv);

  it('falls back to the documented hosted defaults when nothing is configured', () => {
    delete process.env.NEXT_PUBLIC_FLUXA_API_URL;
    delete process.env.NEXT_PUBLIC_CROWDPAY_API_URL;

    expect(resolvePlaygroundBaseUrl('fluxa')).toBe(DEFAULT_PLAYGROUND_BASE_URLS.fluxa);
    expect(resolvePlaygroundBaseUrl('crowdpay')).toBe(DEFAULT_PLAYGROUND_BASE_URLS.crowdpay);
    expect(configuredPlaygroundBaseUrl('fluxa')).toBeNull();
  });

  it('uses the configured base URL instead of the hard-coded default', () => {
    process.env.NEXT_PUBLIC_CROWDPAY_API_URL = 'https://crowdpay.example.org';

    expect(resolvePlaygroundBaseUrl('crowdpay')).toBe('https://crowdpay.example.org');
    // The other provider keeps its own default: overrides are per provider.
    expect(resolvePlaygroundBaseUrl('fluxa')).toBe(DEFAULT_PLAYGROUND_BASE_URLS.fluxa);
  });

  it('keeps a base path but drops the trailing slash', () => {
    process.env.NEXT_PUBLIC_FLUXA_API_URL = 'https://fluxa.example.org/api/';

    expect(resolvePlaygroundBaseUrl('fluxa')).toBe('https://fluxa.example.org/api');
  });

  it('strips credentials, query strings and fragments from a configured base', () => {
    process.env.NEXT_PUBLIC_CROWDPAY_API_URL =
      'https://user:secret@crowdpay.example.org/api?token=abc#frag';

    expect(resolvePlaygroundBaseUrl('crowdpay')).toBe('https://crowdpay.example.org/api');
  });

  it('rejects unusable values and falls back to the default', () => {
    process.env.NEXT_PUBLIC_FLUXA_API_URL = 'ftp://fluxa.example.org';
    expect(normalizePlaygroundBaseUrl(process.env.NEXT_PUBLIC_FLUXA_API_URL)).toBeNull();
    expect(resolvePlaygroundBaseUrl('fluxa')).toBe(DEFAULT_PLAYGROUND_BASE_URLS.fluxa);

    process.env.NEXT_PUBLIC_FLUXA_API_URL = '   ';
    expect(resolvePlaygroundBaseUrl('fluxa')).toBe(DEFAULT_PLAYGROUND_BASE_URLS.fluxa);
  });

  it('returns bare origins for the CSP allow-list, without the base path', () => {
    delete process.env.NEXT_PUBLIC_FLUXA_API_URL;
    delete process.env.NEXT_PUBLIC_CROWDPAY_API_URL;

    expect(playgroundConnectOrigins()).toEqual([
      'https://api.fluxa.io',
      'https://crowdpay.up.railway.app',
    ]);

    process.env.NEXT_PUBLIC_CROWDPAY_API_URL = 'https://crowdpay.example.org/api';

    const origins = playgroundConnectOrigins();
    expect(origins).toContain('https://crowdpay.example.org');
    // The superseded default must not stay allow-listed.
    expect(origins).not.toContain('https://crowdpay.up.railway.app');
    expect(origins.every((origin) => new URL(origin).pathname === '/')).toBe(true);
  });

  it('exposes the environment variable name each provider reads', () => {
    expect(playgroundBaseUrlEnvKey('fluxa')).toBe('NEXT_PUBLIC_FLUXA_API_URL');
    expect(playgroundBaseUrlEnvKey('crowdpay')).toBe('NEXT_PUBLIC_CROWDPAY_API_URL');
  });
});
