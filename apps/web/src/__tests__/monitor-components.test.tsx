import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrKey } from '@stellar/stellar-sdk';

import { AlertPanel } from '@/components/monitor/alert-dialog';
import { LiveFeed } from '@/components/monitor/live-feed';
import { MonitorDashboard } from '@/components/monitor/monitor-dashboard';
import { WatchForm } from '@/components/monitor/watch-form';
import type { AlertEvent, Watch, WatchEvent } from '@/components/monitor/monitor-types';

const mockApiFetch = jest.fn();
const mockDownloadCsv = jest.fn();
const mockAddRecentItem = jest.fn();

jest.mock('@/lib/api', () => ({
  API_ORIGIN: 'http://localhost:3001',
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
  apiErrorMessage: (reason: unknown, fallback: string) =>
    reason instanceof Error && reason.message ? reason.message : fallback,
}));

jest.mock('@/lib/recent-items', () => ({
  addRecentItem: (...args: unknown[]) => mockAddRecentItem(...args),
}));

jest.mock('socket.io-client', () => {
  const handlers: Record<string, (payload: never) => void> = {};
  const socket = {
    on: (event: string, handler: (payload: never) => void) => {
      handlers[event] = handler;
      return socket;
    },
    disconnect: jest.fn(),
  };

  return {
    io: jest.fn(() => socket),
    __emit: (event: string, payload: unknown) => handlers[event]?.(payload as never),
  };
});

/** jsdom leaves these browser APIs out; the components use all three. */
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollTo', {
    configurable: true,
    value: jest.fn(),
  });

  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { ...globalThis.crypto, randomUUID: () => `rule-${++counter}` },
  });
});

/**
 * Default transport for the suites below: an empty, well-formed response per
 * endpoint so no component ever receives `undefined` and a mock ordering quirk
 * cannot masquerade as a component bug. Individual tests override this.
 */
function respondWithDefaults(path: string, init?: RequestInit): Promise<unknown> {
  if (init?.method === 'POST' || init?.method === 'DELETE') return Promise.resolve(undefined);
  if (path.includes('/alerts')) return Promise.resolve({ items: [], page: 1, limit: 50, total: 0 });
  if (path.includes('/events') || path.includes('/monitor/search')) {
    return Promise.resolve({ items: [], page: 1, limit: 100, total: 0 });
  }
  if (path === '/monitor/watches') return Promise.resolve([]);
  return Promise.resolve(undefined);
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockDownloadCsv.mockReset();
  mockAddRecentItem.mockReset();
  mockApiFetch.mockImplementation(respondWithDefaults);
});

const ACCOUNT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 3));

function makeWatch(overrides: Partial<Watch> = {}): Watch {
  return {
    id: 'watch-1',
    publicKey: ACCOUNT,
    type: 'account',
    label: 'Treasury account',
    network: 'testnet',
    eventTypes: ['transaction', 'payment'],
    alertRules: [],
    cursorLedger: null,
    streamMode: 'sse',
    status: 'streaming',
    lastEventAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<WatchEvent> = {}): WatchEvent {
  return {
    id: 'event-1',
    watchId: 'watch-1',
    pagingToken: '1',
    source: 'payment',
    eventType: 'payment',
    payload: {
      amount: '12.5',
      asset_type: 'native',
      from: 'GFROM',
      to: ACCOUNT,
      transaction_hash: 'abc123',
    },
    occurredAt: '2024-05-01T10:00:00.000Z',
    createdAt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: 'alert-1',
    watchId: 'watch-1',
    ruleId: 'rule-1',
    payload: { amount: '99' },
    deliveryStatus: 'delivered',
    deliveryAttempts: [],
    deliveredAt: '2024-05-01T10:00:01.000Z',
    createdAt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('WatchForm', () => {
  it('renders nothing while the drawer is closed', () => {
    const { container } = render(<WatchForm open={false} onClose={jest.fn()} onAdd={jest.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('rejects a public key that is neither an account, a contract, nor a federation address', async () => {
    const onAdd = jest.fn();
    const { container } = render(<WatchForm open onClose={jest.fn()} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: 'definitely-not-a-key' },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(
      await screen.findByText('Enter a valid Stellar account, contract ID, or federation address'),
    ).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('submits a valid account watch with the selected event types', async () => {
    const onAdd = jest.fn();
    const watch = makeWatch();
    mockApiFetch.mockResolvedValue(watch);
    const { container } = render(<WatchForm open onClose={jest.fn()} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: ACCOUNT },
    });
    fireEvent.change(screen.getByPlaceholderText('Treasury account'), {
      target: { value: 'Ops wallet' },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    const [path, init] = mockApiFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/monitor/watches');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      publicKey: ACCOUNT,
      label: 'Ops wallet',
      network: 'testnet',
      eventTypes: ['transaction', 'payment'],
      alertRules: [],
    });
    expect(onAdd).toHaveBeenCalledWith(watch);
    expect(mockAddRecentItem).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'monitor', href: '/monitor' }),
    );
  });

  it('surfaces the API error and keeps the form open when the watch cannot be created', async () => {
    const onAdd = jest.fn();
    mockApiFetch.mockRejectedValue(new Error('Watch limit reached'));
    const { container } = render(<WatchForm open onClose={jest.fn()} onAdd={onAdd} />);

    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: ACCOUNT },
    });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(await screen.findByText('Watch limit reached')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('forces contract watches onto the contract event type', () => {
    render(<WatchForm open onClose={jest.fn()} onAdd={jest.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: CONTRACT },
    });

    const contractCheckbox = screen.getByRole('checkbox', { name: /contract/i });
    expect(contractCheckbox).toBeChecked();
    expect(contractCheckbox).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: /payment/i })).not.toBeInTheDocument();
  });

  it('only offers a federation lookup once the input looks like an address', () => {
    render(<WatchForm open onClose={jest.fn()} onAdd={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: 'ana*example.com' },
    });

    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });
});

describe('watch alert rules', () => {
  it('adds a rule, reveals the type-specific field, and maps the window to a number', async () => {
    mockApiFetch.mockResolvedValue(makeWatch());
    const { container } = render(<WatchForm open onClose={jest.fn()} onAdd={jest.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: ACCOUNT },
    });

    expect(screen.getByText('Events will be recorded without firing alerts.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Add rule/ }));

    // The form's Network select comes first; the rule editor's is appended.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const ruleType = selects[selects.length - 1];
    expect(ruleType).toHaveValue('any_activity');
    // Threshold fields stay hidden until the rule type needs them.
    expect(screen.queryByPlaceholderText('Threshold amount')).not.toBeInTheDocument();

    await userEvent.selectOptions(ruleType, 'transaction_count');

    fireEvent.change(screen.getByPlaceholderText('Transaction count'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByPlaceholderText('Window in minutes (default 60)'), {
      target: { value: '30' },
    });

    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (mockApiFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.alertRules).toEqual([
      {
        type: 'transaction_count',
        asset: '',
        threshold: '5',
        channels: ['in_app'],
        windowMinutes: 30,
      },
    ]);
  });

  it('keeps the last remaining notification channel checked', async () => {
    render(<WatchForm open onClose={jest.fn()} onAdd={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Add rule/ }));

    const inApp = screen.getByRole('checkbox', { name: /in app/i });
    const email = screen.getByRole('checkbox', { name: /email/i });
    expect(inApp).toBeChecked();
    expect(email).not.toBeChecked();

    await userEvent.click(inApp);
    expect(inApp).toBeChecked();

    await userEvent.click(email);
    expect(email).toBeChecked();
    // With two channels selected the in-app one can be turned back off.
    await userEvent.click(inApp);
    expect(inApp).not.toBeChecked();
  });

  it('disables submission when an account watch has no event types left', async () => {
    render(<WatchForm open onClose={jest.fn()} onAdd={jest.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: ACCOUNT },
    });

    const submit = screen.getByRole('button', { name: 'Start watching' });
    expect(submit).toBeEnabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /transaction/i }));
    expect(submit).toBeEnabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /payment/i }));
    expect(submit).toBeDisabled();
  });
});

describe('LiveFeed', () => {
  it('asks the user to pick a watch when none is selected', () => {
    render(<LiveFeed liveEvents={[]} />);

    expect(screen.getByText('Select a watch')).toBeInTheDocument();
  });

  it('renders a streamed payment with its amount, asset, counterparties and explorer link', async () => {
    mockApiFetch.mockResolvedValue({ items: [], page: 1, limit: 100, total: 0 });

    render(<LiveFeed watch={makeWatch()} liveEvents={[makeEvent()]} />);

    // The card renders the event type in lower case; `uppercase` is styling only.
    expect(await screen.findByText('payment')).toBeInTheDocument();
    expect(screen.getByText('12.5 XLM')).toBeInTheDocument();
    expect(screen.getByText('From GFROM')).toBeInTheDocument();
    expect(screen.getByText(`To ${ACCOUNT}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stellar Expert/ })).toHaveAttribute(
      'href',
      'https://stellar.expert/explorer/testnet/tx/abc123',
    );
  });

  it('shows the saved history after the live stream is empty, deduplicated by id', async () => {
    const duplicate = makeEvent({ id: 'shared' });
    mockApiFetch.mockResolvedValue({
      items: [duplicate, makeEvent({ id: 'history-only', occurredAt: '2024-04-30T10:00:00.000Z' })],
      page: 1,
      limit: 100,
      total: 2,
    });

    render(<LiveFeed watch={makeWatch()} liveEvents={[duplicate]} />);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/monitor/watches/watch-1/events?limit=100'),
    );

    const cards = await screen.findAllByText('payment');
    expect(cards).toHaveLength(2);
  });

  it('reports a history load failure with a retry action', async () => {
    mockApiFetch.mockRejectedValue(new Error('Horizon unavailable'));

    render(<LiveFeed watch={makeWatch()} liveEvents={[]} />);

    expect(await screen.findByText('Failed to load event history')).toBeInTheDocument();
    // The message is rendered in the ErrorState body and again as its details.
    expect(screen.getAllByText('Horizon unavailable').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Reload history' }).length).toBeGreaterThan(0);
  });

  it('toggles scroll pausing', async () => {
    mockApiFetch.mockResolvedValue({ items: [], page: 1, limit: 100, total: 0 });

    render(<LiveFeed watch={makeWatch()} liveEvents={[]} />);

    const toggle = screen.getByRole('button', { name: /Pause scroll/ });
    await userEvent.click(toggle);

    expect(screen.getByRole('button', { name: /Resume scroll/ })).toBeInTheDocument();
  });
});

describe('AlertPanel', () => {
  it('renders nothing to alert on until a watch is selected', () => {
    const { container } = render(<AlertPanel liveAlerts={[]} />);

    expect(container.querySelector('section')).not.toBeInTheDocument();
  });

  it('lists fired alerts with their payload and delivery status', async () => {
    mockApiFetch.mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 });

    render(<AlertPanel watch={makeWatch()} liveAlerts={[makeAlert()]} />);

    expect(await screen.findByText('Fired alerts')).toBeInTheDocument();
    expect(screen.getByText('delivered')).toBeInTheDocument();
    expect(screen.getByText(/"amount": "99"/)).toBeInTheDocument();
  });

  it('falls back to the empty message when no alert has fired', async () => {
    mockApiFetch.mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 });

    render(<AlertPanel watch={makeWatch()} liveAlerts={[]} />);

    expect(
      await screen.findByText('No alert rules have fired for this watch.'),
    ).toBeInTheDocument();
  });

  it('re-sends an alert and replaces the stale row', async () => {
    const alert = makeAlert();
    mockApiFetch
      .mockResolvedValueOnce({ items: [alert], page: 1, limit: 50, total: 1 })
      .mockResolvedValueOnce({ ...alert, deliveryStatus: 'pending' });

    render(<AlertPanel watch={makeWatch()} liveAlerts={[]} />);

    await userEvent.click(await screen.findByRole('button', { name: /Re-send/ }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/monitor/watches/watch-1/alerts/alert-1/resend', {
        method: 'POST',
      }),
    );
    expect(await screen.findByText('pending')).toBeInTheDocument();
  });

  it('validates the webhook secret length before saving', async () => {
    mockApiFetch.mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 });

    render(<AlertPanel watch={makeWatch()} liveAlerts={[]} />);

    await userEvent.click(screen.getByRole('button', { name: /Webhook/ }));

    const secret = screen.getByPlaceholderText(/HMAC secret/);
    expect(secret).toHaveAttribute('minlength', '16');
  });
});

describe('MonitorDashboard', () => {
  const socketMock = jest.requireMock('socket.io-client') as {
    __emit: (event: string, payload: unknown) => void;
  };

  it('shows the watches returned by the API and the connected live stream', async () => {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) =>
      path === '/monitor/watches' && !init?.method
        ? Promise.resolve([makeWatch()])
        : respondWithDefaults(path, init),
    );

    render(<MonitorDashboard />);

    // The label appears in the sidebar and again as the feed heading.
    expect((await screen.findAllByText('Treasury account')).length).toBeGreaterThan(0);
    expect(screen.getByText('1 active')).toBeInTheDocument();

    act(() => socketMock.__emit('connect', undefined));
    expect(screen.getByText('Live stream connected')).toBeInTheDocument();
  });

  it('reports a failed watch load', async () => {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) =>
      path === '/monitor/watches' && !init?.method
        ? Promise.reject(new Error('API offline'))
        : respondWithDefaults(path, init),
    );

    render(<MonitorDashboard />);

    expect(await screen.findByText('Failed to load watches')).toBeInTheDocument();
    expect(screen.getByText('Load failed')).toBeInTheDocument();
  });

  it('deletes a watch through the API and drops it from the sidebar', async () => {
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) =>
      path === '/monitor/watches' && !init?.method
        ? Promise.resolve([makeWatch()])
        : respondWithDefaults(path, init),
    );

    render(<MonitorDashboard />);

    const deleteButton = await screen.findByRole('button', { name: /Delete Treasury account/ });
    await userEvent.click(deleteButton);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/monitor/watches/watch-1', { method: 'DELETE' }),
    );
    expect(
      within(screen.getByRole('complementary')).queryByText('Treasury account'),
    ).not.toBeInTheDocument();
  });
});
