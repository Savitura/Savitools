export function resolveStellarHorizonUrl(
  config: Record<string, string | undefined>,
  network: string = 'testnet',
): string {
  const isPublic = network === 'public' || network === 'mainnet';
  if (isPublic) {
    return (
      config.STELLAR_HORIZON_PUBLIC_URL ||
      config.STELLAR_HORIZON_MAINNET_URL ||
      'https://horizon.stellar.org'
    );
  }
  return config.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
}

export function resolveStellarRpcUrl(
  config: Record<string, string | undefined>,
  network: string = 'testnet',
): string {
  const isPublic = network === 'public' || network === 'mainnet';
  if (isPublic) {
    return (
      config.STELLAR_RPC_PUBLIC_URL ||
      config.STELLAR_RPC_MAINNET_URL ||
      'https://soroban-rpc.stellar.org'
    );
  }
  return config.STELLAR_RPC_URL || 'https://soroban-rpc-testnet.stellar.org';
}
