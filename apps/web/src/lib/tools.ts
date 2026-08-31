export const tools = [
  {
    href: "/inspector",
    label: "Inspector",
    description:
      "Decode any transaction hash, address, or XDR into a readable breakdown.",
    status: "MVP" as const,
  },
  {
    href: "/composer",
    label: "Composer",
    description:
      "Build multi-operation transactions visually — no SDK required.",
    status: "MVP" as const,
  },
  {
    href: "/sandbox",
    label: "Sandbox",
    description: "Generate testnet keypairs and fund wallets with one click.",
    status: "MVP" as const,
  },
  {
    href: "/simulator",
    label: "Simulator",
    description: "Find path payment routes and preview fees before you send.",
    status: "MVP" as const,
  },
  {
    href: "/playground",
    label: "Playground",
    description: "Explore and test the Fluxa and CrowdPay APIs interactively.",
    status: "MVP" as const,
  },
  {
    href: "/webhooks",
    label: "Webhooks",
    description:
      "Test CrowdPay and Fluxa webhook payloads against your endpoint.",
    status: "MVP" as const,
  },
  {
    href: "/contracts",
    label: "Contracts",
    description: "Deploy Soroban smart contracts to testnet from your browser.",
    status: "MVP" as const,
  },
  {
    href: "/monitor",
    label: "Monitor",
    description: "Watch addresses and contracts for live ledger activity.",
    status: "Planned" as const,
  },
  {
    href: "/inspector/federation",
    label: "Federation & TOML",
    description:
      "Resolve Stellar federation addresses, inspect stellar.toml files, and check SEP compliance.",
    status: "MVP" as const,
  },
  {
    href: "/simulator/orderbook",
    label: "Order Book",
    description:
      "Live DEX order book, spread analytics, and liquidity depth chart for any asset pair.",
    status: "MVP" as const,
  },
  {
    href: "/inspector/graph",
    label: "Account Graph",
    description:
      "Visualize signer networks, offers, and payment relationships with an interactive force-directed graph.",
    status: "MVP" as const,
  },
  {
    href: "/contracts/events",
    label: "Contract Events",
    description:
      "Decode, filter, and replay Soroban contract events from raw ScVal XDR.",
    status: "MVP" as const,
  },
] as const;
