import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { NetworkProvider, useNetwork, NetworkProfile } from './network-context';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NetworkProvider>{children}</NetworkProvider>
);

describe('NetworkContext', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('provides default testnet state when storage is empty', () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });

    expect(result.current.network).toBe('testnet');
    expect(result.current.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(result.current.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(result.current.activeProfile).toBeNull();
  });

  it('handles profile switching correctly', () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });

    act(() => {
      result.current.setNetwork('mainnet');
    });

    expect(result.current.network).toBe('mainnet');
    expect(result.current.horizonUrl).toBe('https://horizon.stellar.org');
    expect(result.current.networkPassphrase).toBe('Public Global Stellar Network ; September 2015');
  });

  it('supports custom profile persistence and CRUD operations', () => {
    const { result } = renderHook(() => useNetwork(), { wrapper });

    let createdProfile: NetworkProfile;
    act(() => {
      createdProfile = result.current.addProfile({
        name: 'My Custom Network',
        horizonUrl: 'https://custom-horizon.example.com',
        networkPassphrase: 'Custom Passphrase',
        friendbotUrl: 'https://custom-friendbot.example.com',
      });
    });

    expect(createdProfile!.name).toBe('My Custom Network');
    expect(result.current.profiles).toHaveLength(1);
    expect(result.current.profiles[0].id).toBe(createdProfile!.id);

    // Switch active profile to the custom one
    act(() => {
      result.current.setActiveProfile(createdProfile!.id);
    });

    expect(result.current.activeProfile?.id).toBe(createdProfile!.id);
    expect(result.current.horizonUrl).toBe('https://custom-horizon.example.com');
    expect(result.current.networkPassphrase).toBe('Custom Passphrase');

    // Update profile
    act(() => {
      result.current.updateProfile(createdProfile!.id, { name: 'Updated Custom Network' });
    });

    expect(result.current.profiles[0].name).toBe('Updated Custom Network');

    // Delete profile
    act(() => {
      result.current.deleteProfile(createdProfile!.id);
    });

    expect(result.current.profiles).toHaveLength(0);
    expect(result.current.activeProfile).toBeNull();
  });

  it('recovers gracefully from invalid stored profile data', () => {
    // Seed localStorage with malformed/invalid JSON or invalid schema store
    localStorage.setItem('savitools:profiles', 'not-valid-json');
    localStorage.setItem('savitools:activeProfile', 'non-existent-id');
    localStorage.setItem('savitools:network', 'invalid-network-name');

    const { result } = renderHook(() => useNetwork(), { wrapper });

    expect(result.current.profiles).toEqual([]);
    expect(result.current.activeProfile).toBeNull();
    expect(result.current.network).toBe('testnet');
  });
});
