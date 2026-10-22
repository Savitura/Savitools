#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

/**
 * Read-only smoke check for the public API bases used by the web Playground.
 *
 * Usage:
 *   node scripts/check-playground-hosts.mjs --environment production
 *   node scripts/check-playground-hosts.mjs --environment testnet
 *   node scripts/check-playground-hosts.mjs --environment all
 *
 * The bases can be overridden per environment:
 *   PLAYGROUND_SMOKE_PRODUCTION_URL=https://api.example.com/api
 *   PLAYGROUND_SMOKE_TESTNET_URL=https://testnet-api.example.com/api
 *
 * Only GET /health (under the versioned API prefix) is called. No credentials
 * are read or sent, and URLs are printed with credentials/query/hash removed.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

const ENVIRONMENTS = {
  production: {
    env: 'PLAYGROUND_SMOKE_PRODUCTION_URL',
    defaultUrl: 'https://api.savitools.com/api',
  },
  testnet: {
    env: 'PLAYGROUND_SMOKE_TESTNET_URL',
    defaultUrl: 'https://testnet-api.savitools.com/api',
  },
};

function usage() {
  return [
    'Usage: node scripts/check-playground-hosts.mjs --environment <production|testnet|all>',
    '',
    'Options:',
    '  -e, --environment <name>  Environment to check (required unless PLAYGROUND_SMOKE_ENVIRONMENT is set)',
    '      --base-url <url>      Override the base URL for a single selected environment',
    '      --timeout-ms <ms>     Request deadline (default: 10000)',
    '  -h, --help                Show this help',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    environment: process.env.PLAYGROUND_SMOKE_ENVIRONMENT?.trim() || undefined,
    baseUrl: undefined,
    timeoutMs: Number(process.env.PLAYGROUND_SMOKE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--environment' || argument === '-e') {
      if (!value) throw new Error(`${argument} requires a value`);
      options.environment = value;
      index += 1;
    } else if (argument === '--base-url') {
      if (!value) throw new Error('--base-url requires a value');
      options.baseUrl = value;
      index += 1;
    } else if (argument === '--timeout-ms') {
      if (!value) throw new Error('--timeout-ms requires a value');
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--timeout-ms must be a positive integer');
      }
      options.timeoutMs = parsed;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.help) return options;
  if (!options.environment) {
    throw new Error('Choose an environment with --environment or PLAYGROUND_SMOKE_ENVIRONMENT');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('PLAYGROUND_SMOKE_TIMEOUT_MS must be a positive integer');
  }

  return options;
}

function selectedEnvironments(options) {
  const requested = options.environment.toLowerCase();
  if (requested === 'all') {
    if (options.baseUrl) {
      throw new Error('--base-url can only be used with one environment');
    }
    return Object.keys(ENVIRONMENTS);
  }

  if (!Object.hasOwn(ENVIRONMENTS, requested)) {
    throw new Error(
      `Unknown environment "${options.environment}". Expected production, testnet, or all.`,
    );
  }

  return [requested];
}

function configuredBase(environment, baseUrlOverride) {
  if (baseUrlOverride) return baseUrlOverride;

  const definition = ENVIRONMENTS[environment];
  const override = process.env[definition.env]?.trim();
  return override || definition.defaultUrl;
}

function healthEndpoint(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return /\/v1$/.test(trimmed) ? `${trimmed}/health` : `${trimmed}/v1/health`;
}

/** Never print credentials, query strings, or fragments from a configured URL. */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '<invalid URL>';
  }
}

function describeError(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function checkEnvironment(environment, options) {
  const base = configuredBase(environment, options.baseUrl);
  const endpoint = healthEndpoint(base);
  const displayEndpoint = safeUrl(endpoint);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        environment,
        endpoint: displayEndpoint,
        detail: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      };
    }

    if (!body || typeof body !== 'object' || body.status !== 'ok') {
      return {
        ok: false,
        environment,
        endpoint: displayEndpoint,
        detail: 'response did not report status "ok"',
      };
    }

    const version =
      typeof body.version === 'string'
        ? body.version
        : typeof body.service === 'string'
          ? body.service
          : undefined;

    return {
      ok: true,
      environment,
      endpoint: displayEndpoint,
      detail: version ? `status ok (${version})` : 'status ok',
    };
  } catch (error) {
    const detail =
      error instanceof Error && error.name === 'AbortError'
        ? `timed out after ${options.timeoutMs}ms`
        : describeError(error);
    return {
      ok: false,
      environment,
      endpoint: displayEndpoint,
      detail,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[playground-smoke] ${describeError(error)}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  let environments;
  try {
    environments = selectedEnvironments(options);
  } catch (error) {
    console.error(`[playground-smoke] ${describeError(error)}`);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const environment of environments) {
    results.push(await checkEnvironment(environment, options));
  }

  for (const result of results) {
    if (result.ok) {
      console.log(`[${result.environment}] ${result.endpoint} - ${result.detail}`);
    } else {
      console.error(`[${result.environment}] ${result.endpoint} - FAILED: ${result.detail}`);
    }
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
