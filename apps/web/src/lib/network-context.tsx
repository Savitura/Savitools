'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Network = 'testnet' | 'mainnet';

interface NetworkContextValue {
  network: Network;
  setNetwork: (n: Network) => void;
}

const NetworkContext = createContext<NetworkContextValue>({
  network: 'testnet',
  setNetwork: () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<Network>('testnet');

  useEffect(() => {
    const stored = localStorage.getItem('savitools:network') as Network | null;
    if (stored === 'mainnet' || stored === 'testnet') {
      setNetworkState(stored);
    }
  }, []);

  const setNetwork = (n: Network) => {
    setNetworkState(n);
    localStorage.setItem('savitools:network', n);
  };

  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
