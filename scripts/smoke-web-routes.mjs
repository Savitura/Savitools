#!/usr/bin/env node
/**
 * Standalone Next.js Route Smoke Test Runner
 *
 * Verifies HTTP 200 SSR rendering for all localized and non-localized tool pages
 * against a production Next.js server instance.
 *
 * Usage:
 *   node scripts/smoke-web-routes.mjs
 *   node scripts/smoke-web-routes.mjs --port 3456
 *   node scripts/smoke-web-routes.mjs --timeout-ms 20000
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT_DIR = resolve(__dirname, '..');
const WEB_DIR = resolve(ROOT_DIR, 'apps', 'web');
const NEXT_DIR = resolve(WEB_DIR, '.next');

const DEFAULT_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 250;

function parseArgs(argv) {
  const options = {
    port: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--port' || arg === '-p') {
      if (!next) throw new Error(`${arg} requires a port number`);
      options.port = Number(next);
      i++;
    } else if (arg === '--timeout-ms' || arg === '-t') {
      if (!next) throw new Error(`${arg} requires a timeout in ms`);
      options.timeoutMs = Number(next);
      i++;
    }
  }

  return options;
}

function printUsage() {
  console.log(`
Usage: node scripts/smoke-web-routes.mjs [options]

Options:
  -p, --port <number>        Port to bind Next.js server (default: find random free port)
  -t, --timeout-ms <number>  Total timeout for server startup and smoke test (default: ${DEFAULT_TIMEOUT_MS})
  -h, --help                 Display this help message
`);
}

async function getAvailablePort() {
  return new Promise((res, rej) => {
    const server = createServer();
    server.unref();
    server.on('error', rej);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => rej(new Error('Failed to acquire port')));
        return;
      }
      const port = address.port;
      server.close(() => res(port));
    });
  });
}

function loadToolRoutes() {
  const toolsFilePath = resolve(WEB_DIR, 'src', 'lib', 'tools.ts');
  const toolsSource = readFileSync(toolsFilePath, 'utf8');

  const toolHrefs = [];
  const hrefRegex = /href:\s*["']([^"']+)["']/g;
  let match;
  while ((match = hrefRegex.exec(toolsSource)) !== null) {
    toolHrefs.push(match[1]);
  }

  // Additional tool routes present in the codebase
  const additionalRoutes = [
    '/',
    '/docs',
    '/docs/inspector',
    '/docs/sandbox',
    '/docs/composer',
    '/soroban-expiration',
    '/liquidity-pools',
    '/sep10',
    '/sequence-planner',
    '/soroban-storage',
    '/stellar-toml',
  ];

  const allNonLocalized = Array.from(new Set([...toolHrefs, ...additionalRoutes]));

  const locales = ['es']; // 'en' rewrites with as-needed, so 'es' explicitly exercises localized prefixes
  const localized = [];
  for (const locale of locales) {
    for (const route of allNonLocalized) {
      if (route === '/') {
        localized.push(`/${locale}`);
      } else {
        localized.push(`/${locale}${route}`);
      }
    }
  }

  return { nonLocalized: allNonLocalized, localized };
}

async function waitForServerReady(baseUrl, maxWaitMs) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${baseUrl}/`, { redirect: 'follow' });
      if (res.status === 200) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Next.js server failed to respond within ${maxWaitMs}ms at ${baseUrl}`);
}

async function smokeRoute(baseUrl, route) {
  const targetUrl = `${baseUrl}${route}`;
  const start = Date.now();

  try {
    const res = await fetch(targetUrl, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const durationMs = Date.now() - start;
    const text = await res.text();
    const sizeBytes = Buffer.byteLength(text, 'utf8');

    if (res.status !== 200) {
      return {
        route,
        status: res.status,
        durationMs,
        sizeBytes,
        passed: false,
        error: `Expected HTTP 200 but received ${res.status}`,
      };
    }

    // SSR error signatures that Next.js might return with HTTP 200 or inside HTML
    const errorSignatures = [
      '__next_error__',
      'NEXT_HTTP_ERROR_FALLBACK',
      'Application error: a server-side exception has occurred',
      "digest: 'DYNAMIC_SERVER_USAGE'",
    ];

    for (const sig of errorSignatures) {
      if (text.includes(sig)) {
        return {
          route,
          status: res.status,
          durationMs,
          sizeBytes,
          passed: false,
          error: `Response contains error signature: "${sig}"`,
        };
      }
    }

    if (sizeBytes < 100) {
      return {
        route,
        status: res.status,
        durationMs,
        sizeBytes,
        passed: false,
        error: `Response body unexpectedly short (${sizeBytes} bytes)`,
      };
    }

    return {
      route,
      status: res.status,
      durationMs,
      sizeBytes,
      passed: true,
    };
  } catch (err) {
    return {
      route,
      status: 0,
      durationMs: Date.now() - start,
      sizeBytes: 0,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!existsSync(NEXT_DIR)) {
    console.error(
      `Error: apps/web build artifacts not found at ${NEXT_DIR}. Run "npm run build" first.`,
    );
    process.exit(1);
  }

  const port = args.port ?? (await getAvailablePort());
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Starting Next.js production server for route smoke tests on port ${port}...`);

  const serverProcess = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: WEB_DIR,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  serverProcess.stdout.on('data', (d) => {
    serverOutput += d.toString();
  });
  serverProcess.stderr.on('data', (d) => {
    serverOutput += d.toString();
  });

  const cleanup = () => {
    if (!serverProcess.killed) {
      try {
        serverProcess.kill('SIGTERM');
      } catch {}
      setTimeout(() => {
        try {
          serverProcess.kill('SIGKILL');
        } catch {}
      }, 500);
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  try {
    await waitForServerReady(baseUrl, 15_000);
    console.log(`✓ Next.js server ready at ${baseUrl}\n`);

    const { nonLocalized, localized } = loadToolRoutes();
    const allRoutes = [...nonLocalized, ...localized];

    console.log(
      `Smoke testing ${allRoutes.length} tool routes (${nonLocalized.length} non-localized + ${localized.length} localized)...\n`,
    );

    const results = [];
    const colRoute = 45;
    const colStatus = 12;
    const colDuration = 10;
    const colSize = 12;

    console.log(
      'Route'.padEnd(colRoute) +
        'Status'.padEnd(colStatus) +
        'Latency'.padEnd(colDuration) +
        'Size'.padEnd(colSize),
    );
    console.log('-'.repeat(colRoute + colStatus + colDuration + colSize));

    for (const route of allRoutes) {
      const result = await smokeRoute(baseUrl, route);
      results.push(result);

      const statusStr = result.passed ? `${result.status} OK` : `FAIL (${result.status})`;
      const latencyStr = `${result.durationMs}ms`;
      const sizeStr = `${(result.sizeBytes / 1024).toFixed(1)} KB`;

      console.log(
        route.padEnd(colRoute) +
          statusStr.padEnd(colStatus) +
          latencyStr.padEnd(colDuration) +
          sizeStr.padEnd(colSize) +
          (result.error ? ` [${result.error}]` : ''),
      );
    }

    console.log('-'.repeat(colRoute + colStatus + colDuration + colSize));

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.length - passedCount;

    console.log(
      `\nSmoke Test Summary: ${passedCount}/${results.length} passed, ${failedCount} failed`,
    );

    if (failedCount > 0) {
      console.error('\nFailed routes:');
      for (const r of results.filter((r) => !r.passed)) {
        console.error(`  - ${r.route}: ${r.error || `HTTP ${r.status}`}`);
      }
      process.exit(1);
    }

    console.log('✓ All tool routes verified with HTTP 200 SSR rendering!\n');
    process.exit(0);
  } catch (error) {
    console.error('Smoke test runner error:', error);
    if (serverOutput) {
      console.error('\nServer log output:\n', serverOutput);
    }
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
