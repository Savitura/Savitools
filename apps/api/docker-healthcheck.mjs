#!/usr/bin/env node

const port = Number(process.env.API_PORT ?? 3001);
const prefix = (process.env.API_PREFIX ?? 'api').replace(/^\/+|\/+$/g, '');
const path = `/${prefix ? `${prefix}/` : ''}v1/health`;

try {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
