import { createClient } from 'redis';
import { Client } from 'pg';
import { Keypair } from '@stellar/stellar-sdk';
import { randomUUID } from 'crypto';

async function fundFromFriendbot(publicKey: string) {
  const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Friendbot failed: ${await response.text()}`);
  }
}

async function upsertWorkspace(pgClient: Client, userId: string, tool: string, data: any) {
  const res = await pgClient.query(`SELECT id FROM workspaces WHERE user_id = $1 AND tool = $2`, [userId, tool]);
  if (res.rows.length > 0) {
    await pgClient.query(`UPDATE workspaces SET data = $1 WHERE id = $2`, [JSON.stringify(data), res.rows[0].id]);
  } else {
    await pgClient.query(`INSERT INTO workspaces (id, user_id, tool, data) VALUES ($1, $2, $3, $4)`, [
      randomUUID(),
      userId,
      tool,
      JSON.stringify(data)
    ]);
  }
}

async function seed() {
  console.log('Seeding database...');
  
  // 1. Seed Redis
  const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
  const redisClient = createClient({ url: redisUrl });
  await redisClient.connect();

  for (const network of ['testnet', 'mainnet']) {
    const key = `network_history:${network}`;
    await redisClient.del(key);
    for (let i = 0; i < 60; i++) {
      const entry = {
        timestamp: Date.now() - (60 - i) * 60000,
        network,
        passphrase: network === 'testnet' ? 'Test SDF Network ; September 2015' : 'Public Global Stellar Network ; September 2015',
        ledger: {
          sequence: 100000 + i,
          closeTime: new Date(Date.now() - (60 - i) * 60000).toISOString(),
          secondsSinceClose: 5,
          avgCloseTime: 5.5,
        },
        fees: {
          baseFee: { min: 100, mode: 100, max: 120 },
          percentiles: { p10: 100, p50: 100, p90: 110, p99: 120 }
        },
        latency: 100 + Math.random() * 50
      };
      await redisClient.lPush(key, JSON.stringify(entry));
    }
  }
  console.log('Seeded 60 network entries in Redis for testnet and mainnet.');

  // 2. Seed Postgres
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@postgres:5432/savitools';
  const pgClient = new Client({ connectionString: dbUrl });
  await pgClient.connect();

  let retries = 15;
  while (retries > 0) {
    const checkTable = await pgClient.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      );
    `);
    if (checkTable.rows[0].exists) break;
    console.log('Waiting for users table to be created by TypeORM...');
    await new Promise(r => setTimeout(r, 2000));
    retries--;
  }

  if (retries === 0) {
    throw new Error('Database tables do not exist. Wait for API to start and TypeORM to sync.');
  }

  // Insert dev user
  let res = await pgClient.query(`SELECT id FROM users WHERE email = 'dev@savitools.io'`);
  let userId: string;
  if (res.rows.length > 0) {
    userId = res.rows[0].id;
  } else {
    userId = randomUUID();
    await pgClient.query(`INSERT INTO users (id, email) VALUES ($1, 'dev@savitools.io')`, [userId]);
  }
  
  // 3. Generate keypairs
  console.log('Generating and funding 2 keypairs via Friendbot...');
  const keypairs = [Keypair.random(), Keypair.random()];
  const wallets = [];
  
  for (let i = 0; i < keypairs.length; i++) {
    const kp = keypairs[i];
    await fundFromFriendbot(kp.publicKey());
    wallets.push({
      id: randomUUID(),
      label: `Seed Wallet ${i + 1}`,
      publicKey: kp.publicKey(),
      secretKey: kp.secret(),
      createdAt: Date.now()
    });
  }
  
  await upsertWorkspace(pgClient, userId, 'sandbox', { wallets });

  // Insert Webhook workspace
  const webhookConfig = {
    endpoints: [
      {
        id: randomUUID(),
        url: 'http://localhost:3000/api/webhook',
        description: 'Local Webhook Tester',
        events: ['*']
      }
    ]
  };
  
  await upsertWorkspace(pgClient, userId, 'webhooks', webhookConfig);

  console.log('Seeded Postgres with dev user, sandbox wallets, and webhook config.');
  
  await pgClient.end();
  await redisClient.quit();
  console.log('Seed complete.');
}

seed().catch(err => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
