/**
 * Single source of truth for the API hosts the Playground talks to.
 *
 * Every host that appears in the Playground UI — the provider labels in
 * `api-selector.tsx` and the URL embedded in `copy-curl-button.tsx` — is
 * resolved here instead of being written inline in the components, so that a
 * deployment can point the Playground at its own origins through
 * `NEXT_PUBLIC_FLUXA_API_URL` / `NEXT_PUBLIC_CROWDPAY_API_URL`.
 *
 * `next.config.ts` imports `playgroundConnectOrigins` for the same reason: a
 * configurable base that the Content Security Policy does not allow is not
 * actually usable, so the allow-list has to be derived from the same values.
 */

export type PlaygroundRemoteProvider = 'fluxa' | 'crowdpay';

/** Hosts used when the deployment does not configure an override. */
export const DEFAULT_PLAYGROUND_BASE_URLS: Record<PlaygroundRemoteProvider, string> = {
  fluxa: 'https://api.fluxa.io',
  crowdpay: 'https://crowdpay.up.railway.app',
};

const BASE_URL_ENV_KEYS: Record<PlaygroundRemoteProvider, string> = {
  fluxa: 'NEXT_PUBLIC_FLUXA_API_URL',
  crowdpay: 'NEXT_PUBLIC_CROWDPAY_API_URL',
};

/** The environment variable that overrides a provider's base URL. */
export function playgroundBaseUrlEnvKey(provider: PlaygroundRemoteProvider): string {
  return BASE_URL_ENV_KEYS[provider];
}

/**
 * Trim, validate and normalise a configured base URL.
 *
 * Returns `null` for anything that is not a usable http(s) base so callers can
 * fall back to the documented default instead of emitting a broken cURL sample.
 * Credentials, query strings and fragments are dropped: they must never reach a
 * copied command or a provider label.
 */
export function normalizePlaygroundBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';

  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/**
 * The configured base URL for one provider, or `null` when unset/unusable.
 *
 * The `process.env.NEXT_PUBLIC_*` reads stay as literal member expressions on
 * purpose: Next.js inlines those at build time, and an indirect lookup such as
 * `process.env[key]` would be left as `undefined` in the browser bundle.
 */
export function configuredPlaygroundBaseUrl(provider: PlaygroundRemoteProvider): string | null {
  switch (provider) {
    case 'fluxa':
      return normalizePlaygroundBaseUrl(process.env.NEXT_PUBLIC_FLUXA_API_URL);
    case 'crowdpay':
      return normalizePlaygroundBaseUrl(process.env.NEXT_PUBLIC_CROWDPAY_API_URL);
    default:
      return null;
  }
}

/** The base URL to print in the UI: configured value first, documented default second. */
export function resolvePlaygroundBaseUrl(provider: PlaygroundRemoteProvider): string {
  return configuredPlaygroundBaseUrl(provider) ?? DEFAULT_PLAYGROUND_BASE_URLS[provider];
}

/**
 * Bare origins (scheme + host + port, no path) for `connect-src`.
 *
 * Paths are stripped because CSP matches on origins; keeping `/api` would make
 * the directive silently match nothing and block the configured host.
 */
export function playgroundConnectOrigins(): string[] {
  const origins = new Set<string>();

  for (const provider of Object.keys(DEFAULT_PLAYGROUND_BASE_URLS) as PlaygroundRemoteProvider[]) {
    try {
      origins.add(new URL(resolvePlaygroundBaseUrl(provider)).origin);
    } catch {
      // A default that cannot be parsed is a build-time bug, not a runtime one.
    }
  }

  return [...origins].sort();
}
