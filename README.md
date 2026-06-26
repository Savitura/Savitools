# SaviTools

**A developer workstation for building on Stellar.**

SaviTools is a standalone product in the [Savitura](https://savitura.com) ecosystem. It gives developers the tools they need to build, test, and debug Stellar-based payment applications — without needing a terminal, Rust toolchain, or deep protocol knowledge.

> **Status**: Active development — testnet only.

---

## Tools

| Tool | What it does | Status |
|---|---|---|
| **Transaction Inspector** | Decode any tx hash, Stellar address, or raw XDR into a human-readable breakdown | In progress |
| **Wallet Sandbox** | Generate testnet keypairs, fund via Friendbot, send test payments | In progress |
| **Transaction Composer** | Visual builder for multi-operation Stellar transactions; sign and submit without code | In progress |
| **Payment Simulator** | Find path payment routes between assets; preview hops, rates, and fees | In progress |
| **Webhook Tester** | Fire sample CrowdPay / Fluxa webhook payloads at your endpoint; inspect the response | In progress |
| **Ledger Monitor** | Watch a Stellar address or contract for live activity; set threshold alerts | Planned |
| **API Playground** | Interactive request builder for Fluxa and CrowdPay APIs | Planned |
| **Contract Deploy Helper** | Upload and deploy Soroban WASM files to testnet from the browser | Planned |
| **SDK Generator** | Generate copy-paste client code (JS, Python, Go, cURL) from Fluxa/CrowdPay endpoints | Planned |
| **Network Status** | Live Stellar network health: ledger close time, fee tracker, Horizon latency | Planned |

---

## Architecture

```
Browser ──────────────────────────────────────────────────────────────────
  Next.js 15 (App Router) │ TypeScript │ Tailwind CSS │ shadcn/ui
──────────────────────────────────────────────────────────────────────────
                           │ HTTP
                           ▼
API ──────────────────────────────────────────────────────────────────────
  NestJS (Fastify adapter) │ TypeORM │ BullMQ │ Swagger at /api/docs
  ┌─────────────────────────────────────────────────────────────────┐
  │ modules: transaction · wallet · simulator · webhook             │
  │          monitor · playground · contracts · sdkgen · network    │
  └─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    PostgreSQL              Redis             Stellar Horizon
    (workspaces,        (BullMQ queues,       (testnet +
    watches, history)    rate cache)           mainnet)
```

**Monorepo layout (Turborepo)**

```
savitools/
├── apps/
│   ├── web/                      # Next.js 15 frontend
│   │   └── src/app/
│   │       ├── page.tsx          # Home / onboarding
│   │       ├── inspector/        # Transaction Inspector
│   │       ├── sandbox/          # Wallet Sandbox
│   │       ├── composer/         # Transaction Composer
│   │       ├── simulator/        # Payment Simulator (route finder)
│   │       ├── webhooks/         # Webhook Tester
│   │       ├── monitor/          # Ledger Monitor
│   │       ├── playground/       # API Playground
│   │       ├── contracts/        # Soroban Deploy Helper
│   │       ├── sdk/              # SDK Generator
│   │       └── network/          # Network Status
│   │
│   └── api/                      # NestJS backend
│       └── src/modules/
│           ├── transaction/       # Horizon lookups, XDR decode
│           ├── wallet/            # Keypair gen, Friendbot, balances
│           ├── simulator/         # Path payment route simulation
│           ├── webhook/           # Test endpoint registration + firing
│           ├── monitor/           # Horizon SSE streaming, alert rules
│           ├── playground/        # Spec proxy, API forwarding
│           ├── contracts/         # Soroban WASM upload + deploy
│           ├── sdkgen/            # Client code generation
│           ├── network/           # Fee stats, ledger health
│           └── auth/              # User accounts, JWT, Fluxa SSO
│
├── docker-compose.yml
├── turbo.json
└── .env.example
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)

### 1. Install dependencies

```bash
git clone https://github.com/Savitura/Savitools
cd Savitools
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `STELLAR_HORIZON_URL` | Horizon endpoint |
| `WEBHOOK_SIGNING_SECRET` | HMAC secret for test webhook payloads |
| `NEXT_PUBLIC_API_URL` | Frontend → API URL (dev: `http://localhost:3001/api`) |

### 3. Start infrastructure

```bash
docker compose up -d     # Postgres + Redis
```

### 4. Run development servers

```bash
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001/api |
| Swagger docs | http://localhost:3001/api/docs |

### 5. Run individual apps

```bash
cd apps/web && npm run dev    # frontend only
cd apps/api && npm run dev    # API only
```

---

## Development Commands

```bash
npm run dev        # start all apps in watch mode (Turborepo)
npm run build      # production build
npm run lint       # ESLint across all apps
npm run format     # Prettier
npm test           # run all tests
```

---

## How it connects to Savitura

SaviTools is a standalone product with its own users and branding, but it's purpose-built to serve the Savitura ecosystem:

- The **API Playground** is pre-wired to Fluxa and CrowdPay APIs
- The **Webhook Tester** ships sample payloads for every CrowdPay and Fluxa event
- The **Contract Deploy Helper** makes it easy to deploy the CrowdPay Soroban escrow contract
- Connect your Fluxa account in settings to use your real API keys inside SaviTools tools

**Other Savitura projects:**
- [Fluxa](https://github.com/Savitura/Fluxa) — payment infrastructure API
- [CrowdPay](https://github.com/Savitura/crowdpay) — crowdfunding platform

---

## Documentation

Complete guides and API reference for integrating with SaviTools:

| Resource | Purpose |
|----------|---------|
| **[API Reference](docs/api-reference.md)** | Complete endpoint catalog with examples, parameters, and error codes |
| **[Quickstart Guide](docs/quickstart.md)** | End-to-end walkthrough: generate keypair → fund → send payment in 5 minutes |
| **[Swagger UI](/api/docs)** | Interactive API explorer (available in dev/staging; disabled in production) |

### Quick Links

- **Getting an API Key**: See [Quickstart → Step 1-2](docs/quickstart.md)
- **Finding Payment Routes**: See [API Reference → Simulator](docs/api-reference.md#simulator-payment-paths--fees)
- **Building Multi-Op Transactions**: See [API Reference → Composer](docs/api-reference.md#composer-transaction-building)
- **Authentication & Security**: See [API Reference → Authentication](docs/api-reference.md#authentication)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
