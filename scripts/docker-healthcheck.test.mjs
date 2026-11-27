// Unit tests for scripts/docker-healthcheck.mjs (Savitura/Savitools#672).
// Run with: npm run test:scripts
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { checkHealth, resolveOptions } from './docker-healthcheck.mjs';

const SCRIPT = fileURLToPath(new URL('./docker-healthcheck.mjs', import.meta.url));

const servers = [];

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    servers.push(server);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

/** A port that nothing listens on: bind, read the port, close. */
function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function runScript(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    child.once('exit', (code) => resolve(code));
  });
}

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('resolveOptions', () => {
  test('defaults to HTTP against /api/v1/health on port 3001', () => {
    assert.deepEqual(resolveOptions([], {}), {
      mode: 'http',
      timeoutMs: 3000,
      host: '127.0.0.1',
      port: 3001,
      path: '/api/v1/health',
    });
  });

  test('honours API_PORT, PORT and a normalised API_PREFIX', () => {
    assert.equal(resolveOptions([], { PORT: '4000' }).port, 4000);
    assert.equal(resolveOptions([], { API_PORT: '5000', PORT: '4000' }).port, 5000);
    assert.equal(resolveOptions([], { API_PREFIX: '/custom/' }).path, '/custom/v1/health');
    assert.equal(resolveOptions([], { API_PREFIX: '' }).path, '/v1/health');
  });

  test('selects TCP mode from the flag or HEALTHCHECK_MODE', () => {
    assert.equal(resolveOptions(['--tcp'], {}).mode, 'tcp');
    assert.equal(resolveOptions(['--tcp'], {}).timeoutMs, 2000);
    assert.equal(resolveOptions([], { HEALTHCHECK_MODE: 'TCP' }).mode, 'tcp');
    assert.equal(resolveOptions(['--http'], { HEALTHCHECK_MODE: 'tcp' }).mode, 'http');
  });

  test('accepts a timeout override and rejects invalid input', () => {
    assert.equal(resolveOptions(['--timeout=250'], {}).timeoutMs, 250);
    assert.equal(resolveOptions([], { HEALTHCHECK_TIMEOUT_MS: '900' }).timeoutMs, 900);
    assert.equal(resolveOptions(['--timeout=nope'], {}).timeoutMs, 3000);
    assert.throws(() => resolveOptions(['--verbose'], {}), /Unknown argument/);
    assert.throws(() => resolveOptions([], { HEALTHCHECK_MODE: 'udp' }), /Unsupported/);
  });
});

describe('checkHealth (http)', () => {
  test('returns 0 on HTTP 200 from the health route', async () => {
    let requested;
    const port = await listen((req, res) => {
      requested = req.url;
      res.writeHead(200).end('{"status":"ok"}');
    });
    const code = await checkHealth(resolveOptions([], { API_PORT: String(port) }));
    assert.equal(code, 0);
    assert.equal(requested, '/api/v1/health');
  });

  test('returns 1 on HTTP 503', async () => {
    const port = await listen((_req, res) => res.writeHead(503).end());
    assert.equal(await checkHealth(resolveOptions([], { API_PORT: String(port) })), 1);
  });

  test('returns 1 on HTTP 404 (wrong prefix)', async () => {
    const port = await listen((_req, res) => res.writeHead(404).end());
    assert.equal(await checkHealth(resolveOptions([], { API_PORT: String(port) })), 1);
  });

  test('returns 1 when the connection is refused', async () => {
    const port = await freePort();
    assert.equal(await checkHealth(resolveOptions([], { API_PORT: String(port) })), 1);
  });

  test('returns 1 when the server never answers before the timeout', async () => {
    const port = await listen(() => {
      /* hang */
    });
    const options = resolveOptions(['--timeout=100'], { API_PORT: String(port) });
    assert.equal(await checkHealth(options), 1);
  });
});

describe('checkHealth (tcp)', () => {
  test('returns 0 when the port accepts connections', async () => {
    const port = await listen((_req, res) => res.writeHead(500).end());
    assert.equal(await checkHealth(resolveOptions(['--tcp'], { API_PORT: String(port) })), 0);
  });

  test('returns 1 when the connection is refused', async () => {
    const port = await freePort();
    assert.equal(await checkHealth(resolveOptions(['--tcp'], { API_PORT: String(port) })), 1);
  });
});

describe('process exit codes', () => {
  test('exits 0 for a healthy API', async () => {
    const port = await listen((_req, res) => res.writeHead(200).end());
    assert.equal(await runScript([], { API_PORT: String(port) }), 0);
  });

  test('exits 1 for HTTP 503', async () => {
    const port = await listen((_req, res) => res.writeHead(503).end());
    assert.equal(await runScript([], { API_PORT: String(port) }), 1);
  });

  test('exits 1 for a refused connection', async () => {
    const port = await freePort();
    assert.equal(await runScript(['--tcp'], { API_PORT: String(port) }), 1);
  });

  test('exits 1 on a timeout', async () => {
    const port = await listen(() => {
      /* hang */
    });
    assert.equal(await runScript(['--timeout=100'], { API_PORT: String(port) }), 1);
  });

  test('exits 1 for an unknown flag', async () => {
    assert.equal(await runScript(['--bogus'], {}), 1);
  });
});
