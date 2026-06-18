export const tools = [
  {
    href: '/inspector',
    label: 'Inspector',
    description: 'Decode any transaction hash, address, or XDR into a readable breakdown.',
    status: 'MVP' as const,
  },
  {
    href: '/composer',
    label: 'Composer',
    description: 'Build multi-operation transactions visually — no SDK required.',
    status: 'MVP' as const,
  },
  {
    href: '/sandbox',
    label: 'Sandbox',
    description: 'Generate testnet keypairs and fund wallets with one click.',
    status: 'MVP' as const,
  },
  {
    href: '/simulator',
    label: 'Simulator',
    description: 'Find path payment routes and preview fees before you send.',
    status: 'MVP' as const,
  },
  {
    href: '/webhooks',
    label: 'Webhooks',
    description: 'Test CrowdPay and Fluxa webhook payloads against your endpoint.',
    status: 'MVP' as const,
  },
  {
    href: '/contracts',
    label: 'Contracts',
    description: 'Deploy Soroban smart contracts to testnet from your browser.',
    status: 'MVP' as const,
  },
  {
    href: '/monitor',
    label: 'Monitor',
    description: 'Watch addresses and contracts for live ledger activity.',
    status: 'Planned' as const,
  },
] as const;
