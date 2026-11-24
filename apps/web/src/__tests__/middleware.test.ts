/**
 * Locale middleware behaviour (Savitura/Savitools#698).
 *
 * `src/middleware.ts` delegates to next-intl with `localePrefix: 'as-needed'`
 * and `defaultLocale: 'en'`. The tests exercise the real next-intl middleware
 * through `NextRequest`s so detection order (prefix → cookie → Accept-Language
 * → default) and the route exclusions stay pinned.
 */
import { NextRequest, NextResponse } from 'next/server';

import middleware, { config } from '@/middleware';

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, 'https://savitools.example'), { headers });
}

function run(path: string, headers: Record<string, string> = {}): NextResponse {
  return middleware(request(path, headers)) as NextResponse;
}

describe('locale middleware', () => {
  it('serves the default locale from the unprefixed root without redirecting', () => {
    const response = run('/');

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://savitools.example/en',
    );
    expect(response.headers.get('set-cookie')).toContain('NEXT_LOCALE=en');
  });

  it('detects Spanish from the Accept-Language header', () => {
    const response = run('/', { 'accept-language': 'es-ES,es;q=0.9,en;q=0.8' });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://savitools.example/es');
  });

  it('detects Spanish from the NEXT_LOCALE cookie', () => {
    const response = run('/', { cookie: 'NEXT_LOCALE=es' });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://savitools.example/es');
  });

  it('prefers the cookie over the Accept-Language header', () => {
    const response = run('/', { cookie: 'NEXT_LOCALE=en', 'accept-language': 'es' });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://savitools.example/en',
    );
  });

  it('ignores an unsupported cookie value and falls back to the header', () => {
    const response = run('/', { cookie: 'NEXT_LOCALE=fr', 'accept-language': 'es' });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://savitools.example/es');
  });

  it('falls back to English when nothing matches', () => {
    const response = run('/settings', { 'accept-language': 'de-DE,de;q=0.9' });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://savitools.example/en/settings',
    );
  });

  it('keeps a Spanish prefix and preserves the path and query', () => {
    const response = run('/es/tools/composer?op=payment', { 'accept-language': 'en' });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toContain('NEXT_LOCALE=es');
  });

  it('strips the default locale prefix because it is as-needed', () => {
    const response = run('/en/docs');

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://savitools.example/docs');
  });

  it('redirects an unprefixed path to Spanish when the header asks for it', () => {
    const response = run('/docs/getting-started?from=nav', { 'accept-language': 'es-MX' });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://savitools.example/es/docs/getting-started?from=nav',
    );
  });

  it('returns locale-independent paths untouched when they are already canonical', () => {
    const response = run('/es');

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('middleware matcher', () => {
  // Next applies `config.matcher` before invoking the middleware. Reproduce
  // the catch-all pattern as a RegExp to prove which paths it covers. Next
  // matches it against the pathname without its leading slash.
  const catchAll = config.matcher[2];
  const catchAllPattern = new RegExp(`^${catchAll.slice(1)}$`);
  const matches = (path: string) => catchAllPattern.test(path.replace(/^\//, ''));

  it('matches localized and unprefixed application routes', () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(['/', '/(es|en)/:path*']),
    );
    expect(matches('/tools/composer')).toBe(true);
    expect(matches('/es/docs')).toBe(true);
    expect(matches('/settings')).toBe(true);
  });

  it.each([
    '/api/health',
    '/api/v1/tools',
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/_vercel/insights/view',
    '/favicon.ico',
    '/logo.svg',
    '/docs/file.json',
  ])('excludes %s from locale handling', (path) => {
    expect(matches(path)).toBe(false);
  });
});
