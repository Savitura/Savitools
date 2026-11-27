// CLI flag validation smoke tests for scripts/seed.ts and
// scripts/generate-sdk-specs.mjs (Savitura/Savitools#670).
// Run with: npm run test:scripts
//
// Every case here exits before touching Postgres, Friendbot or the network.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TS_NODE = require.resolve('ts-node/dist/bin.js');

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

const seed = (args, env) => run([TS_NODE, '--transpile-only', 'scripts/seed.ts', ...args], env);
const specs = (args) => run(['scripts/generate-sdk-specs.mjs', ...args]);

// ts-node start-up can be slow on cold CI runners.
const SLOW = { timeout: 120_000 };

describe('scripts/seed.ts', () => {
  test('--help prints usage and exits 0', SLOW, async () => {
    const { code, stdout } = await seed(['--help']);
    assert.equal(code, 0);
    assert.match(stdout, /Usage: npx ts-node scripts\/seed\.ts/);
    assert.match(stdout, /--dry-run/);
  });

  test('-h is an alias for --help', SLOW, async () => {
    const { code, stdout } = await seed(['-h']);
    assert.equal(code, 0);
    assert.match(stdout, /Usage:/);
  });

  test('--dry-run validates configuration without connecting', SLOW, async () => {
    const { code, stdout } = await seed(['--dry-run'], {
      DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/never',
    });
    assert.equal(code, 0);
    assert.match(stdout, /Dry run: configuration is valid/);
  });

  test('--dry-run rejects a non-Postgres DATABASE_URL', SLOW, async () => {
    const { code, stderr } = await seed(['--dry-run'], { DATABASE_URL: 'mysql://localhost/db' });
    assert.equal(code, 1);
    assert.match(stderr, /DATABASE_URL must use one of/);
  });

  test('rejects unknown flags', SLOW, async () => {
    const { code, stderr } = await seed(['--bogus']);
    assert.equal(code, 1);
    assert.match(stderr, /Unknown option: --bogus/);
  });
});

describe('scripts/generate-sdk-specs.mjs', () => {
  test('--help prints usage and exits 0', async () => {
    const { code, stdout } = await specs(['--help']);
    assert.equal(code, 0);
    assert.match(stdout, /Usage: node scripts\/generate-sdk-specs\.mjs/);
    assert.match(stdout, /--check/);
    assert.match(stdout, /--dry-run/);
  });

  test('rejects unknown flags with exit code 2', async () => {
    const { code, stderr } = await specs(['--bogus']);
    assert.equal(code, 2);
    assert.match(stderr, /Unknown option: --bogus/);
  });

  test('rejects --fluxa-source without a value', async () => {
    const { code, stderr } = await specs(['--fluxa-source']);
    assert.equal(code, 2);
    assert.match(stderr, /Unknown option: --fluxa-source/);
  });
});
