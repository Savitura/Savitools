'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  parseNetworkProfile,
  parseNetworkProfileStore,
  serializeNetworkProfile,
  serializeNetworkProfileStore,
} from './network-profile-format';
import {
  verifyNetworkProfile as verifyNetworkProfileRequest,
  type NetworkDetectionOptions,
} from './network-detection';

export {
  NETWORK_PROFILE_SCHEMA_VERSION,
  NETWORK_PROFILE_FORMAT_VERSION,
  MIN_SUPPORTED_NETWORK_PROFILE_VERSION,
  NetworkProfileFormatError,
  migrateNetworkProfile,
  parseNetworkProfile,
  serializeNetworkProfile,
  parseNetworkProfileStore,
  serializeNetworkProfileStore,
} from './network-profile-format';
export type {
  NetworkProfileFile,
  NetworkProfileFileInput,
  NetworkProfileStore,
} from './network-profile-format';
export {
  NETWORK_DETECTION_TIMEOUT_MS,
  NetworkDetectionError,
  fetchNetworkPassphrase,
  verifyNetworkProfile,
} from './network-detection';
export type {
  NetworkDetectionErrorCode,
  NetworkDetectionOptions,
  NetworkProfileVerification,
} from './network-detection';

export type Network = 'testnet' | 'mainnet' | 'quickstart' | 'custom';

export interface NetworkProfile {
  id: string;
  name: string;
  horizonUrl: string;
  networkPassphrase: string;
  friendbotUrl?: string;
  isDefault: boolean;
}

export interface ProfileVerificationResult {
  valid: boolean;
  actualPassphrase?: string;
  mismatch?: boolean;
  /** Recoverable failure reason when detection could not complete. */
  error?: string;
}

interface NetworkContextValue {
  network: Network;
  setNetwork: (n: Network) => void;
  horizonUrl: string;
  networkPassphrase: string;
  friendbotUrl: string;
  profiles: NetworkProfile[];
  activeProfile: NetworkProfile | null;
  setActiveProfile: (id: string | null) => void;
  addProfile: (profile: Omit<NetworkProfile, 'id' | 'isDefault'>) => NetworkProfile;
  updateProfile: (id: string, updates: Partial<NetworkProfile>) => void;
  deleteProfile: (id: string) => void;
  setDefaultProfile: (id: string) => void;
  exportProfile: (id: string) => string;
  importProfile: (json: string) => void;
  verifyProfile: (
    profile: Pick<NetworkProfile, 'horizonUrl' | 'networkPassphrase'>,
    options?: NetworkDetectionOptions,
  ) => Promise<ProfileVerificationResult>;
}

const TESTNET_HORIZON = 'https://horizon-testnet.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const TESTNET_FRIENDBOT = 'https://friendbot.stellar.org';

const MAINNET_HORIZON = 'https://horizon.stellar.org';
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const MAINNET_FRIENDBOT = '';

const QUICKSTART_HORIZON = 'http://localhost:8000';
const QUICKSTART_PASSPHRASE = 'Standalone Network ; February 2017';
const QUICKSTART_FRIENDBOT = 'http://localhost:8000/friendbot';

const STORAGE_KEYS = {
  profiles: 'savitools:profiles',
  activeProfileId: 'savitools:activeProfile',
  network: 'savitools:network',
} as const;

const NetworkContext = createContext<NetworkContextValue>({
  network: 'testnet',
  setNetwork: () => {},
  horizonUrl: TESTNET_HORIZON,
  networkPassphrase: TESTNET_PASSPHRASE,
  friendbotUrl: TESTNET_FRIENDBOT,
  profiles: [],
  activeProfile: null,
  setActiveProfile: () => {},
  addProfile: () => ({}) as NetworkProfile,
  updateProfile: () => {},
  deleteProfile: () => {},
  setDefaultProfile: () => {},
  exportProfile: () => '',
  importProfile: () => {},
  verifyProfile: async () => ({ valid: true }) as ProfileVerificationResult,
});

function generateId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getBuiltInProfile(network: Network): NetworkProfile {
  if (network === 'mainnet') {
    return {
      id: 'mainnet',
      name: 'Mainnet',
      horizonUrl: MAINNET_HORIZON,
      networkPassphrase: MAINNET_PASSPHRASE,
      friendbotUrl: MAINNET_FRIENDBOT,
      isDefault: false,
    };
  }
  if (network === 'quickstart') {
    return {
      id: 'quickstart',
      name: 'Quickstart (Local)',
      horizonUrl: QUICKSTART_HORIZON,
      networkPassphrase: QUICKSTART_PASSPHRASE,
      friendbotUrl: QUICKSTART_FRIENDBOT,
      isDefault: false,
    };
  }
  return {
    id: 'testnet',
    name: 'Testnet',
    horizonUrl: TESTNET_HORIZON,
    networkPassphrase: TESTNET_PASSPHRASE,
    friendbotUrl: TESTNET_FRIENDBOT,
    isDefault: false,
  };
}

function readStorage(Key: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(Key);
}

function writeStorage(Key: string, value: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(Key, value);
  }
}

function fetchNetworkPassphrase(horizonUrl: string): Promise<string> {
  const baseUrl = sanitizeUrl(horizonUrl);
  return fetch(`${baseUrl}/`).then((r) => {
    if (!r.ok) throw new Error(`Did not receive 200 from Horizon at ${horizonUrl}`);
    return r.json();
  }).then((data: any) => {
    const passphrase = data?.network_passphrase;
    if (!passphrase || typeof passphrase !== 'string') {
      throw new Error('No network passphrase found in Horizon response');
    }
    return passphrase;
  });
}

export function NetworkProvider( { children }: { children: React.ReactNode }) {
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<Network>('testnet');
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // The first persist pass happens after hydration and must not rewrite a
  // profile store we just read (or a malformed one we deliberately left alone).
  const persistReadyRef = useRef(false);

  // Load state from localStorage on mount, migrating the legacy bare array.
  useEffect(() => {
    let cancelled = false;
    let loadedProfiles: NetworkProfile[] = [];

    const storedProfiles = readStorage(STORAGE_KEYS.profiles);
    if (storedProfiles) {
      try {
        const parsed = parseNetworkProfileStore(storedProfiles).map((profile) => {
          const { schemaVersion: _schemaVersion, ...rest } = profile;
          return {
            ...rest,
            id: profile.id ?? generateId(),
            isDefault: profile.isDefault ?? false,
          } as NetworkProfile;
        });
        loadedProfiles = parsed;
        if (!cancelled) setProfiles(parsed);
        // Upgrade a legacy unversioned store in place now that it parsed.
        writeStorage(STORAGE_KEYS.profiles, serializeNetworkProfileStore(parsed));
      } catch (error) {
        // Leave invalid/unknown-version data untouched so the user can inspect
        // or re-import it instead of losing it to an empty rewrite.
        console.warn('Invalid profiles in localStorage', error);
      }
    }

    const storedActiveId = readStorage(STORAGE_KEYS.activeProfileId);
    if (storedActiveId && loadedProfiles.some((profile) => profile.id === storedActiveId)) {
      setActiveProfileIdState(storedActiveId);
    } else {
      const defaultProfile = loadedProfiles.find((profile) => profile.isDefault);
      if (defaultProfile) {
        setActiveProfileIdState(defaultProfile.id);
      }
    }

    const storedNetwork = readStorage(STORAGE_KEYS.network);
    if (
      storedNetwork === 'mainnet' ||
      storedNetwork === 'testnet' ||
      storedNetwork === 'quickstart'
    ) {
      setNetworkState(storedNetwork);
    }

    if (!cancelled) setHydrated(true);

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist profiles whenever they change, once the initial read has settled.
  useEffect(() => {
    if (!hydrated) return;
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    writeStorage(STORAGE_KEYS.profiles, serializeNetworkProfileStore(profiles));
  }, [profiles, hydrated]);

  useEffect(() => {
    if (activeProfileId) {
      writeStorage(STORAGE_KEYS.activeProfileId, activeProfileId);
    } else {
      window?.localStorage && window.localStorage.removeItem(STORAGE_KEYS.activeProfileId);
    }
  }, [activeProfileId]);

  const setNetwork = useCallback((n: Network) => {
    setNetworkState(n);
    writeStorage(STORAGE_KEYS.network, n);
    setActiveProfileIdState(null);
  }, []);

  const activeProfile = activeProfileId
    ? profiles.find((p) => p.id === activeProfileId) || null
    : null;

  const horizonUrl =
    activeProfile?.horizonUrl ||
    (network === 'mainnet'
      ? MAINNET_HORIZON
      : network === 'quickstart'
        ? QUICKSTART_HORIZON
        : TESTNET_HORIZON);
  const networkPassphrase =
    activeProfile?.networkPassphrase ||
    (network === 'mainnet'
      ? MAINNET_PASSPHRASE
      : network === 'quickstart'
        ? QUICKSTART_PASSPHRASE
        : TESTNET_PASSPHRASE);
  const friendbotUrl =
    activeProfile?.friendbotUrl ||
    (network === 'mainnet'
      ? MAINNET_FRIENDBOT
      : network === 'quickstart'
        ? QUICKSTART_FRIENDBOT
        : TESTNET_FRIENDBOT);

  const setActiveProfile = useCallback(
    (id: string | null) => {
      if (id === null) {
        setActiveProfileIdState(null);
        return;
      }
      const profile = profiles.find((p) => p.id === id);
      if (profile) {
        setActiveProfileIdState(id);
        // Also update the network type for compatibility
        const isTest = profile.networkPassphrase === TESTNET_PASSPHRASE;
        const isMain = profile.networkPassphrase === MAINNET_PASSPHRASE;
        setNetworkState(isTest ? 'testnet' : isMain ? 'mainnet' : 'custom');
      } else {
        console.warn(`Profile ${id} not found`);
      }
    },
    [profiles],
  );

  const addProfile = useCallback(
    (profile: Omit<NetworkProfile, 'id' | 'isDefault'>) => {
      const newProfile: NetworkProfile = {
        ...profile,
        id: generateId(),
        isDefault: profiles.length === 0,
      };
      setProfiles((prev) => [...prev, newProfile]);
      return newProfile;
    },
    [profiles.length],
  );

  const updateProfile = useCallback(
    (id: string, updates: Partial<NetworkProfile>) => {
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
      // If the active profile is updated, refresh the derived values
      if (activeProfileId === id) {
        const updatedProfile = profiles.find((p) => p.id === id);
        if (updatedProfile) {
          const isTest = updatedProfile.networkPassphrase === TESTNET_PASSPHRASE;
          const isMain = updatedProfile.networkPassphrase === MAINNET_PASSPHRASE;
          setNetworkState(isTest ? 'testnet' : isMain ? 'mainnet' : 'custom');
        }
      }
    },
    [activeProfileId, profiles],
  );

  const deleteProfile = useCallback(
    (id: string) => {
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (activeProfileId === id) {
        setActiveProfileIdState(null);
      }
      // If deleted profile was default, unset default
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, isDefault: false } : p)));
    },
    [activeProfileId],
  );

  const setDefaultProfile = useCallback((id: string) => {
    setProfiles((prev) =>
      prev.map((p) => ({
        ...p,
        isDefault: p.id === id,
      })),
    );
  }, []);

  const exportProfile = useCallback(
    (id: string) => {
      const profile = profiles.find((p) => p.id === id);
      if (!profile) throw new Error('Profile not found');
      return serializeNetworkProfile(profile);
    },
    [profiles],
  );

  const importProfile = useCallback((json: string) => {
    // Parse and validate the whole profile before touching state. A malformed
    // or unknown-version file therefore cannot overwrite stored profiles.
    const parsed = parseNetworkProfile(json);
    const newProfile: NetworkProfile = {
      id: generateId(),
      name: parsed.name,
      horizonUrl: parsed.horizonUrl,
      networkPassphrase: parsed.networkPassphrase,
      friendbotUrl: parsed.friendbotUrl,
      isDefault: false,
    };
    setProfiles((prev) => [...prev, newProfile]);
    return newProfile;
  }, []);

  const verifyProfile = useCallback(
    async (
      profile: Pick<NetworkProfile, 'horizonUrl' | 'networkPassphrase'>,
      options?: NetworkDetectionOptions,
    ) => {
      return verifyNetworkProfileRequest(profile, options);
    },
    [],
  );

  const value = {
    network,
    setNetwork,
    horizonUrl,
    networkPassphrase,
    friendbotUrl,
    profiles,
    activeProfile,
    setActiveProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    setDefaultProfile,
    exportProfile,
    importProfile,
    verifyProfile,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
