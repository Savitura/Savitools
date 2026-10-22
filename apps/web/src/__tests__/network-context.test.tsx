import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetworkProvider, useNetwork } from '@/lib/network-context';

const LEGACY_PROFILE = {
  id: 'legacy-1',
  name: 'Legacy local',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  isDefault: true,
};

function Probe() {
  const { profiles, exportProfile, importProfile } = useNetwork();
  return (
    <div>
      <span data-testid="count">{profiles.length}</span>
      <span data-testid="name">{profiles[0]?.name ?? 'none'}</span>
      <button
        type="button"
        onClick={() => {
          try {
            importProfile(
              JSON.stringify({
                schemaVersion: 99,
                name: 'from the future',
                horizonUrl: 'https://horizon.example.com',
                networkPassphrase: 'Future Network',
              }),
            );
          } catch {
            // The probe only needs to prove state stayed intact.
          }
        }}
      >
        import future
      </button>
      <button
        type="button"
        onClick={() => {
          document.body.dataset.exported = exportProfile(profiles[0].id);
        }}
      >
        export
      </button>
    </div>
  );
}

describe('NetworkProvider profile storage', () => {
  it('loads a legacy unversioned array and upgrades it to the versioned store', async () => {
    window.localStorage.setItem('savitools:profiles', JSON.stringify([LEGACY_PROFILE]));

    render(
      <NetworkProvider>
        <Probe />
      </NetworkProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    expect(screen.getByTestId('name')).toHaveTextContent('Legacy local');
    const stored = JSON.parse(window.localStorage.getItem('savitools:profiles') ?? '{}');
    expect(stored.schemaVersion).toBe(1);
    expect(stored.profiles).toHaveLength(1);
  });

  it('leaves stored profiles untouched when an unknown-version import fails', async () => {
    window.localStorage.setItem('savitools:profiles', JSON.stringify([LEGACY_PROFILE]));
    const user = userEvent.setup();

    render(
      <NetworkProvider>
        <Probe />
      </NetworkProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    await user.click(screen.getByRole('button', { name: 'import future' }));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('name')).toHaveTextContent('Legacy local');
    const stored = JSON.parse(window.localStorage.getItem('savitools:profiles') ?? '{}');
    expect(stored.profiles[0].name).toBe('Legacy local');
  });

  it('exports a profile with an explicit schema version', async () => {
    window.localStorage.setItem('savitools:profiles', JSON.stringify([LEGACY_PROFILE]));
    const user = userEvent.setup();

    render(
      <NetworkProvider>
        <Probe />
      </NetworkProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    await user.click(screen.getByRole('button', { name: 'export' }));

    expect(JSON.parse(document.body.dataset.exported ?? '{}').schemaVersion).toBe(1);
  });
});
