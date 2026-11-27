#!/usr/bin/env node
/**
 * Single container healthcheck for the api service (Savitura/Savitools#671).
 *
 * Used by both:
 *   - apps/api/Dockerfile (HEALTHCHECK, HTTP mode): the production image is
 *     only healthy once `GET /<API_PREFIX>/v1/health` answers 2xx.
 *   - docker-compose.dev.yml (`--tcp`): the *web* container's
 *     `condition: service_healthy` only needs to know the API is listening,
 *     so a TCP connect is enough there (Savitura/Savitools#250).
 *
 * Parameters (flags win over environment variables):
 *   --tcp | --http            HEALTHCHECK_MODE   (default: http)
 *   --timeout=<ms>            HEALTHCHECK_TIMEOUT_MS (default: 3000 http, 2000 tcp)
 *                             API_PORT / PORT    (default: 3001)
 *                             API_PREFIX         (default: api)
 *
 * Exit code is what Docker reads: 0 = healthy, 1 = unhealthy.
 */
import http from 'node:http';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

const HOST = '127.0.0.1';

export function resolveOptions(argv = [], env = process.env) {
  let mode = (env.HEALTHCHECK_MODE ?? 'http').toLowerCase();
  let timeoutMs = env.HEALTHCHECK_TIMEOUT_MS ? Number(env.HEALTHCHECK_TIMEOUT_MS) : undefined;

  for (const arg of argv) {
    if (arg === '--tcp') mode = 'tcp';
    else if (arg === '--http') mode = 'http';
    else if (arg.startsWith('--timeout=')) timeoutMs = Number(arg.slice('--timeout='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (mode !== 'http' && mode !== 'tcp') {
    throw new Error(`Unsupported HEALTHCHECK_MODE: ${mode}`);
  }
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    timeoutMs = mode === 'tcp' ? 2000 : 3000;
  }

  const port = Number(env.API_PORT ?? env.PORT ?? 3001);
  const prefix = (env.API_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '');
  const path = `/${prefix ? `${prefix}/` : ''}v1/health`;

  return { mode, timeoutMs, host: HOST, port, path };
}

function checkHttp({ host, port, path, timeoutMs }) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path, timeout: timeoutMs }, (res) => {
      res.resume();
      const status = res.statusCode ?? 0;
      resolve(status >= 200 && status < 300 ? 0 : 1);
    });
    req.once('timeout', () => {
      req.destroy();
      resolve(1);
    });
    req.once('error', () => resolve(1));
  });
}

function checkTcp({ host, port, timeoutMs }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.end();
      resolve(0);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(1);
    });
    socket.once('error', () => resolve(1));
  });
}

/** Resolves to the process exit code: 0 when healthy, 1 otherwise. */
export function checkHealth(options) {
  return options.mode === 'tcp' ? checkTcp(options) : checkHttp(options);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  let options;
  try {
    options = resolveOptions(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  checkHealth(options).then((code) => process.exit(code));
}
