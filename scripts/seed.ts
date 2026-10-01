import { Client } from 'pg';
import { Keypair } from '@stellar/stellar-sdk';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function horizonUrl(network: 'testnet' | 'mainnet'): string {
  if (network === 'mainnet') {
    return (
      process.env.STELLAR_HORIZON_MAINNET_URL || 'https://horizon.stellar.org'
    );
  }
  return (
    process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
  );
}

async function friendbotUrl(baseUrl: string): Promise<string> {
  const response = await fetch(baseUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Horizon root at ${baseUrl}: ${response.status}`,
    );
  }
  const root = (await response.json()) as { _links?: { friendbot?: { href?: string } } };
  const href = root._links?.friendbot?.href;
  if (!href) {
    throw new Error(`Horizon at ${baseUrl} does not advertise a friendbot URL`);
  }
  // Horizon returns a URI template like https://friendbot.stellar.org?addr={addr}
  return href.replace(/\{[^}]+\}/, '');
}

async function fundFromFriendbot(publicKey: string, baseUrl: string): Promise<void> {
  const fb = await friendbotUrl(baseUrl);
  const url = `${fb}${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Friendbot failed: ${await response.text()}`);
  }
}

async function upsertWorkspace(
  pgClient: Client,
  userId: string,
  tool: string,
  data: unknown,
): Promise<void> {
  const res = await pgClient.query(
    `SELECT id FROM workspaces WHERE user_id = $1 AND tool = $2`,
    [userId, tool],
  );
  if (res.rows.length > 0) {
    await pgClient.query(`UPDATE workspaces SET data = $1 WHERE id = $2`, [
      JSON.stringify(data),
      res.rows[0].id,
    ]);
  } else {
    await pgClient.query(
      `INSERT INTO workspaces (id, user_id, tool, data) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), userId, tool, JSON.stringify(data)],
    );
  }
}

// ---------------------------------------------------------------------------
// Wait for migrations
// ---------------------------------------------------------------------------

async function waitForMigrations(pgClient: Client): Promise<void> {
  const MAX_RETRIES = 15;
  const DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { rows } = await pgClient.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'network_samples'
      )
    `);
    if (rows[0].exists) return;
    console.log(
      `Waiting for migrations… attempt ${attempt}/${MAX_RETRIES}`,
    );
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  throw new Error(
    'network_samples table does not exist after waiting. ' +
      'Run migrations first: make migrate  or  cd apps/api && npm run migration:run',
  );
}

// ---------------------------------------------------------------------------
// Seed network_samples
// ---------------------------------------------------------------------------

async function seedNetworkSamples(pgClient: Client): Promise<void> {
  for (const network of ['testnet', 'mainnet'] as const) {
    const base = horizonUrl(network);

    // Idempotency: skip if we already have a sample within the last hour.
    const { rows } = await pgClient.query<{ count: string }>(
      `SELECT COUNT(*) AS count
         FROM network_samples
        WHERE network = $1
          AND sampled_at > NOW() - INTERVAL '1 hour'`,
      [network],
    );
    if (parseInt(rows[0].count, 10) > 0) {
      console.log(
        `network_samples already has recent rows for ${network} — skipping.`,
      );
      continue;
    }

    // Insert one sample per minute for the past hour (60 rows per network).
    for (let i = 0; i < 60; i++) {
      const sampledAt = new Date(Date.now() - (60 - i) * 60_000);
      const latencyMs = 100 + Math.floor(Math.random() * 50);
      await pgClient.query(
        `INSERT INTO network_samples
           (id, network, horizon_base_url, ok, latency_ms, error, sampled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), network, base, true, latencyMs, null, sampledAt],
      );
    }
    console.log(`Seeded 60 network_samples rows for ${network}.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  console.log('Seeding database…');

  const dbUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:password@postgres:5432/savitools';
  const pgClient = new Client({ connectionString: dbUrl });
  await pgClient.connect();

  try {
    await waitForMigrations(pgClient);

    // Seed network_samples (the store NetworkService actually reads).
    await seedNetworkSamples(pgClient);

    // Seed dev user.
    let res = await pgClient.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'dev@savitools.io'`,
    );
    let userId: string;
    if (res.rows.length > 0) {
      userId = res.rows[0].id;
    } else {
      userId = randomUUID();
      await pgClient.query(
        `INSERT INTO users (id, email) VALUES ($1, 'dev@savitools.io')`,
        [userId],
      );
    }

    // Seed sandbox wallets funded via Friendbot.
    const testnetBase = horizonUrl('testnet');
    console.log('Generating and funding 2 keypairs via Friendbot…');
    const keypairs = [Keypair.random(), Keypair.random()];
    const wallets: unknown[] = [];

    for (let i = 0; i < keypairs.length; i++) {
      const kp = keypairs[i];
      await fundFromFriendbot(kp.publicKey(), testnetBase);
      wallets.push({
        id: randomUUID(),
        label: `Seed Wallet ${i + 1}`,
        publicKey: kp.publicKey(),
        secretKey: kp.secret(),
        createdAt: Date.now(),
      });
    }

    await upsertWorkspace(pgClient, userId, 'sandbox', { wallets });

    // Seed webhook workspace.
    const webhookConfig = {
      endpoints: [
        {
          id: randomUUID(),
          url: 'http://localhost:3000/api/webhook',
          description: 'Local Webhook Tester',
          events: ['*'],
        },
      ],
    };
    await upsertWorkspace(pgClient, userId, 'webhooks', webhookConfig);

    console.log(
      'Seeded Postgres with dev user, sandbox wallets, and webhook config.',
    );
  } finally {
    await pgClient.end();
  }

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
