import { randomUUID } from 'node:crypto';
import { fireEvent, render, screen } from '@testing-library/react';
import { WatchForm } from '@/components/monitor/watch-form';
import { LiveFeed } from '@/components/monitor/live-feed';
import type { Watch, WatchEvent } from '@/components/monitor/monitor-types';
import { apiFetch } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
  apiErrorMessage: (error: Error) => error.message,
}));

Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });

describe('Monitor watch form', () => {
  it('rejects an invalid Stellar address before submitting to the API', async () => {
    const onAdd = jest.fn();
    render(<WatchForm open onAdd={onAdd} onClose={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('G..., C..., or name*domain.com'), {
      target: { value: 'invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start watching' }));

    expect(await screen.findByText(/enter a valid stellar account/i)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('shows transaction-count fields and removes them with the alert rule', () => {
    render(<WatchForm open onAdd={jest.fn()} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    const typeOption = screen.getByRole('option', { name: 'Transaction count reaches' });
    fireEvent.change(typeOption.closest('select')!, { target: { value: 'transaction_count' } });

    expect(screen.getByPlaceholderText('Transaction count')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/window in minutes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove rule' }));
    expect(screen.queryByPlaceholderText('Transaction count')).not.toBeInTheDocument();
  });
});

it('renders a live payment alongside watch history', async () => {
  const watch: Watch = {
    id: 'watch-1',
    publicKey: 'GEXAMPLE',
    label: 'Treasury',
    type: 'account',
    network: 'testnet',
    eventTypes: ['payment'],
    alertRules: [],
    cursorLedger: null,
    streamMode: 'sse',
    status: 'streaming',
    lastEventAt: null,
    lastError: null,
  };
  const occurredAt = '2026-01-01T01:00:00Z';
  const event: WatchEvent = {
    id: 'event-1',
    watchId: watch.id,
    pagingToken: '1',
    source: 'payment',
    eventType: 'payment',
    payload: { amount: '12.5', asset_type: 'native' },
    occurredAt,
    createdAt: occurredAt,
  };
  jest.mocked(apiFetch).mockResolvedValueOnce({ items: [event], total: 1 });
  const scrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: jest.fn(),
  });
  try {
    render(<LiveFeed watch={watch} liveEvents={[event]} />);
    expect(await screen.findByText('12.5 XLM')).toBeInTheDocument();
    expect(screen.getAllByText('12.5 XLM')).toHaveLength(1);
  } finally {
    if (scrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', scrollTo);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  }
});
