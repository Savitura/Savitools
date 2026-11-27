import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CopyCurlButton } from '@/components/playground/copy-curl-button';
import { EndpointBrowser } from '@/components/playground/endpoint-browser';
import { KeyManager } from '@/components/playground/key-manager';
import { ResponsePanel } from '@/components/playground/response-panel';
import { deletePlaygroundApiKey, listPlaygroundApiKeys, savePlaygroundApiKey } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  deletePlaygroundApiKey: jest.fn(),
  listPlaygroundApiKeys: jest.fn(),
  savePlaygroundApiKey: jest.fn(),
}));

it('selects an endpoint from the provider specification', () => {
  const onSelect = jest.fn();
  render(
    <EndpointBrowser
      spec={{ paths: { '/accounts': { get: { summary: 'List accounts' } } } }}
      selectedEndpoint={null}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /get.*\/accounts/i }));
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'GET', path: '/accounts' }),
  );
});

it('copies encoded query parameters and uses a placeholder for authorization', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    render(
      <CopyCurlButton
        method="GET"
        path="/accounts"
        provider="fluxa"
        useAuth
        queryParams={{ q: 'one two' }}
        headers={{ authorization: 'private-test-value' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy as cURL' }));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    const command = writeText.mock.calls[0][0];
    expect(command).toContain('/accounts?q=one+two');
    expect(command).toContain('Authorization: Bearer $API_KEY');
    expect(command).not.toContain('private-test-value');
  } finally {
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});

it('creates and revokes a provider key', async () => {
  const key = {
    id: 'key-1',
    label: 'Sandbox',
    provider: 'fluxa' as const,
    maskedKey: '•••123',
    createdAt: '',
  };
  jest
    .mocked(listPlaygroundApiKeys)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([key])
    .mockResolvedValueOnce([]);
  render(<KeyManager provider="fluxa" />);
  fireEvent.click(screen.getByRole('button', { name: 'Add API key' }));
  await screen.findByText(/no keys stored/i);
  fireEvent.click(screen.getByRole('button', { name: 'Add new key' }));
  fireEvent.change(screen.getByPlaceholderText(/key label/i), { target: { value: ' Sandbox ' } });
  fireEvent.change(screen.getByPlaceholderText(/paste your fluxa/i), {
    target: { value: ' example-key ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke Sandbox' }));
  expect(savePlaygroundApiKey).toHaveBeenCalledWith('fluxa', 'Sandbox', 'example-key');
  expect(deletePlaygroundApiKey).toHaveBeenCalledWith('key-1');
  await waitFor(() => expect(screen.queryByText('Sandbox')).not.toBeInTheDocument());
});

it('shows the response body, headers, status and latency', () => {
  render(
    <ResponsePanel
      error={null}
      response={{
        status: 200,
        latencyMs: 42,
        body: { ok: true },
        headers: { 'x-request-id': 'abc' },
      }}
    />,
  );
  expect(screen.getByText('200')).toBeInTheDocument();
  expect(screen.getByText('42ms')).toBeInTheDocument();
  expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
  expect(screen.getByText(/x-request-id/)).toBeInTheDocument();
  expect(screen.getByText(/abc/)).toBeInTheDocument();
});
