import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiSelector } from '@/components/playground/api-selector';
import { CopyCurlButton } from '@/components/playground/copy-curl-button';
import { EndpointBrowser } from '@/components/playground/endpoint-browser';
import { KeyManager } from '@/components/playground/key-manager';
import { PlaygroundTool } from '@/components/playground/playground-tool';
import { RequestBuilder } from '@/components/playground/request-builder';
import { RequestHistory } from '@/components/playground/request-history';
import { ResponsePanel } from '@/components/playground/response-panel';
import type { PlaygroundApiKey, PlaygroundProxyResult } from '@/lib/api';

const mockFetchPlaygroundSpec = jest.fn();
const mockProxyPlaygroundRequest = jest.fn();
const mockListKeys = jest.fn();
const mockSaveKey = jest.fn();
const mockDeleteKey = jest.fn();

jest.mock('@/lib/api', () => ({
  fetchPlaygroundSpec: (...args: unknown[]) => mockFetchPlaygroundSpec(...args),
  proxyPlaygroundRequest: (...args: unknown[]) => mockProxyPlaygroundRequest(...args),
  listPlaygroundApiKeys: (...args: unknown[]) => mockListKeys(...args),
  savePlaygroundApiKey: (...args: unknown[]) => mockSaveKey(...args),
  deletePlaygroundApiKey: (...args: unknown[]) => mockDeleteKey(...args),
}));

const clipboardWrite = jest.fn();

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
});

beforeEach(() => {
  mockFetchPlaygroundSpec.mockReset();
  mockProxyPlaygroundRequest.mockReset();
  mockListKeys.mockReset();
  mockSaveKey.mockReset();
  mockDeleteKey.mockReset();
  clipboardWrite.mockReset();
  clipboardWrite.mockResolvedValue(undefined);
  delete process.env.NEXT_PUBLIC_CROWDPAY_API_URL;
});

const SPEC = {
  paths: {
    '/payments': {
      get: { tags: ['Payments'], summary: 'List payments' },
      post: {
        tags: ['Payments'],
        summary: 'Create payment',
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
      },
    },
    '/accounts/{id}': {
      get: {
        tags: ['Accounts'],
        summary: 'Fetch one account',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Page cursor' },
        ],
      },
    },
  },
};

describe('ApiSelector', () => {
  it('renders both providers and marks the selected one', () => {
    render(<ApiSelector selected="crowdpay" onSelect={jest.fn()} />);

    const crowdpay = screen.getByRole('button', { name: /CrowdPay/ });
    expect(screen.getByRole('button', { name: /Fluxa/ })).toBeInTheDocument();
    expect(crowdpay).toBeInTheDocument();
    expect(crowdpay.className).toContain('border-primary');
    expect(screen.getByRole('button', { name: /Fluxa/ }).className).not.toContain('border-primary');
  });

  it('reports the selected provider', async () => {
    const onSelect = jest.fn();
    render(<ApiSelector selected="fluxa" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /CrowdPay/ }));

    expect(onSelect).toHaveBeenCalledWith('crowdpay');
  });

  it('labels CrowdPay with the configured host rather than the hard-coded default', () => {
    process.env.NEXT_PUBLIC_CROWDPAY_API_URL = 'https://crowdpay.example.org';

    render(<ApiSelector selected="fluxa" onSelect={jest.fn()} />);

    expect(screen.getByText(/crowdpay\.example\.org/)).toBeInTheDocument();
  });
});

describe('CopyCurlButton', () => {
  it('copies a cURL command using the provider base URL and every header', async () => {
    render(
      <CopyCurlButton
        method="POST"
        path="/payments"
        queryParams={{ limit: '10' }}
        body='{"amount":"5"}'
        headers={{ 'X-Trace': 'abc' }}
        useAuth
        provider="fluxa"
      />,
    );

    // `userEvent.setup()` swaps in its own clipboard stub, so the copy is
    // triggered with a plain click to keep the harness out of the assertion.
    fireEvent.click(screen.getByRole('button', { name: /Copy as cURL/ }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    // The command is line-continued with `\` + newline; join it for assertions.
    const command = (clipboardWrite.mock.calls[0][0] as string)
      .replace(/\\\s*\n\s*/g, ' ')
      .replace(/\s+/g, ' ');

    expect(command).toContain('curl -s');
    expect(command).toContain('-X POST');
    expect(command).toContain('https://api.fluxa.io/payments?limit=10');
    expect(command).toContain("-H 'Authorization: Bearer $API_KEY'");
    expect(command).toContain("-H 'Accept: application/json'");
    expect(command).toContain("-H 'X-Trace: abc'");
    expect(command).toContain("-H 'Content-Type: application/json'");
    expect(command).toContain('-d \'{"amount":"5"}\'');
  });

  it('omits the Authorization header when the stored key is not used', async () => {
    render(<CopyCurlButton method="GET" path="/payments" useAuth={false} provider="crowdpay" />);

    // `userEvent.setup()` swaps in its own clipboard stub, so the copy is
    // triggered with a plain click to keep the harness out of the assertion.
    fireEvent.click(screen.getByRole('button', { name: /Copy as cURL/ }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalled());
    const command = clipboardWrite.mock.calls[0][0] as string;

    expect(command).not.toContain('Authorization');
    expect(command).toContain('https://crowdpay.up.railway.app/payments');
  });

  it('never sends a body on a GET request', async () => {
    render(
      <CopyCurlButton
        method="GET"
        path="/payments"
        body='{"a":1}'
        useAuth={false}
        provider="fluxa"
      />,
    );

    // `userEvent.setup()` swaps in its own clipboard stub, so the copy is
    // triggered with a plain click to keep the harness out of the assertion.
    fireEvent.click(screen.getByRole('button', { name: /Copy as cURL/ }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalled());
    expect(clipboardWrite.mock.calls[0][0]).not.toContain('-d ');
  });

  it('escapes single quotes inside the JSON body', async () => {
    render(
      <CopyCurlButton
        method="POST"
        path="/payments"
        body={`{ "memo": "it's fine" }`}
        useAuth={false}
        provider="fluxa"
      />,
    );

    // `userEvent.setup()` swaps in its own clipboard stub, so the copy is
    // triggered with a plain click to keep the harness out of the assertion.
    fireEvent.click(screen.getByRole('button', { name: /Copy as cURL/ }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalled());
    expect(clipboardWrite.mock.calls[0][0]).toContain("it'\\''s fine");
  });
});

describe('RequestHistory', () => {
  it('renders nothing before any request has been sent', () => {
    const { container } = render(<RequestHistory history={[]} onSelect={jest.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the method, path, status and latency of each request', () => {
    render(
      <RequestHistory
        history={[
          {
            method: 'GET',
            path: '/payments',
            status: 200,
            latencyMs: 42,
            timestamp: 1_700_000_000_000,
          },
          {
            method: 'POST',
            path: '/payments',
            status: null,
            latencyMs: 0,
            timestamp: 1_700_000_001_000,
          },
        ]}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('Recent Requests')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
    expect(screen.getByText('ERR')).toBeInTheDocument();
    expect(screen.getAllByText('/payments')).toHaveLength(2);
  });

  it('replays an entry when it is selected', async () => {
    const onSelect = jest.fn();
    const entry = { method: 'GET', path: '/accounts', status: 200, latencyMs: 7, timestamp: 5 };

    render(<RequestHistory history={[entry]} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /accounts/ }));

    expect(onSelect).toHaveBeenCalledWith(entry);
  });
});

describe('ResponsePanel', () => {
  it('prompts for a request when nothing has been sent', () => {
    render(<ResponsePanel response={null} error={null} />);

    expect(screen.getByText('Send a request to see the response')).toBeInTheDocument();
  });

  it('renders a transport failure instead of a status code', () => {
    render(<ResponsePanel response={null} error="Network unreachable" />);

    expect(screen.getByText('Request Failed')).toBeInTheDocument();
    expect(screen.getByText('Network unreachable')).toBeInTheDocument();
  });

  it('renders the status, latency and formatted JSON body', () => {
    const response: PlaygroundProxyResult = {
      status: 200,
      latencyMs: 18,
      body: { ok: true },
      headers: { 'content-type': 'application/json' },
    } as unknown as PlaygroundProxyResult;

    render(<ResponsePanel response={response} error={null} />);

    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('18ms')).toBeInTheDocument();
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it('switches to the raw response headers', async () => {
    const response = {
      status: 404,
      latencyMs: 3,
      body: 'not found',
      headers: { 'x-request-id': 'req-1' },
    } as unknown as PlaygroundProxyResult;

    render(<ResponsePanel response={response} error={null} />);

    await userEvent.click(screen.getByRole('button', { name: 'Headers' }));

    expect(screen.getByText('x-request-id:')).toBeInTheDocument();
    expect(screen.getByText('req-1')).toBeInTheDocument();
  });
});

describe('EndpointBrowser', () => {
  it('groups endpoints by their first tag and counts them', () => {
    render(<EndpointBrowser spec={SPEC} selectedEndpoint={null} onSelect={jest.fn()} />);

    const payments = screen.getByRole('button', { name: /Payments/ });
    expect(payments).toBeInTheDocument();
    // Two endpoints share the tag, so the count badge reads 2.
    expect(within(payments).getByText('2')).toBeInTheDocument();
  });

  it('auto-expands the only tag left after a search', () => {
    render(<EndpointBrowser spec={SPEC} selectedEndpoint={null} onSelect={jest.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Filter endpoints…'), {
      target: { value: 'accounts' },
    });

    expect(screen.getByText('/accounts/{id}')).toBeInTheDocument();
    expect(screen.queryByText('/payments')).not.toBeInTheDocument();
  });

  it('reports when the filter matches nothing', () => {
    render(<EndpointBrowser spec={SPEC} selectedEndpoint={null} onSelect={jest.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Filter endpoints…'), {
      target: { value: 'zzzz' },
    });

    expect(screen.getByText('No endpoints found')).toBeInTheDocument();
  });

  it('selects an endpoint and marks the active one', async () => {
    const onSelect = jest.fn();
    render(
      <EndpointBrowser
        spec={SPEC}
        selectedEndpoint={{ method: 'GET', path: '/accounts/{id}' }}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Accounts/ }));
    await userEvent.click(screen.getByRole('button', { name: /GET\s+\/accounts\/\{id\}/ }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/accounts/{id}' }),
    );
  });

  it('survives a spec with no paths', () => {
    render(<EndpointBrowser spec={{}} selectedEndpoint={null} onSelect={jest.fn()} />);

    expect(screen.getByText('No endpoints found')).toBeInTheDocument();
  });
});

describe('KeyManager', () => {
  const key = {
    id: 'key-1',
    label: 'Test Key',
    provider: 'fluxa',
    maskedKey: 'sk_live_…1234',
  } as unknown as PlaygroundApiKey;

  it('loads keys for the active provider only once the panel is open', async () => {
    mockListKeys.mockResolvedValue([key, { ...key, id: 'key-2', provider: 'crowdpay' }]);

    render(<KeyManager provider="fluxa" />);
    expect(mockListKeys).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Add API key/ }));

    expect(await screen.findByText('Test Key')).toBeInTheDocument();
    expect(screen.getByText('Fluxa API Keys')).toBeInTheDocument();
    expect(screen.queryByText('key-2')).not.toBeInTheDocument();
  });

  it('reveals a masked key on demand', async () => {
    mockListKeys.mockResolvedValue([key]);

    render(<KeyManager provider="fluxa" />);
    await userEvent.click(screen.getByRole('button', { name: /Add API key/ }));

    expect(await screen.findByText('••••••••••••')).toBeInTheDocument();

    const reveal = within(screen.getByText('Test Key').closest('div')!.parentElement!).getAllByRole(
      'button',
    )[0];
    await userEvent.click(reveal);

    expect(screen.getByText('sk_live_…1234')).toBeInTheDocument();
  });

  it('keeps Save disabled until both the label and the key are filled', async () => {
    mockListKeys.mockResolvedValue([]);

    render(<KeyManager provider="crowdpay" />);
    await userEvent.click(screen.getByRole('button', { name: /Add API key/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Add new key/ }));

    const save = screen.getByRole('button', { name: 'Save Key' });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/Key label/), 'Prod');
    expect(save).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText(/Paste your CrowdPay API key/),
      'secret-value',
    );
    expect(save).toBeEnabled();
  });

  it('saves the trimmed key and refreshes the list', async () => {
    mockListKeys.mockResolvedValue([]);
    mockSaveKey.mockResolvedValue({ id: 'key-3' });

    render(<KeyManager provider="fluxa" />);
    await userEvent.click(screen.getByRole('button', { name: /Add API key/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Add new key/ }));

    await userEvent.type(screen.getByPlaceholderText(/Key label/), '  Prod  ');
    await userEvent.type(screen.getByPlaceholderText(/Paste your Fluxa API key/), '  abc123  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save Key' }));

    await waitFor(() => expect(mockSaveKey).toHaveBeenCalledWith('fluxa', 'Prod', 'abc123'));
    await waitFor(() => expect(mockListKeys).toHaveBeenCalledTimes(2));
  });

  it('deletes a stored key', async () => {
    mockListKeys.mockResolvedValue([key]);
    mockDeleteKey.mockResolvedValue(undefined);

    render(<KeyManager provider="fluxa" />);
    await userEvent.click(screen.getByRole('button', { name: /Add API key/ }));
    await screen.findByText('Test Key');

    const row = screen.getByText('Test Key').closest('div')!.parentElement!;
    await userEvent.click(within(row).getAllByRole('button')[1]);

    await waitFor(() => expect(mockDeleteKey).toHaveBeenCalledWith('key-1'));
    await waitFor(() => expect(mockListKeys).toHaveBeenCalledTimes(2));
  });
});

describe('RequestBuilder', () => {
  function renderBuilder(overrides: Partial<React.ComponentProps<typeof RequestBuilder>> = {}) {
    const props = {
      method: 'GET',
      path: '/accounts/{id}',
      parameters: SPEC.paths['/accounts/{id}'].get.parameters,
      hasBody: false,
      useAuth: true,
      onUseAuthChange: jest.fn(),
      onSend: jest.fn(),
      loading: false,
      ...overrides,
    };
    render(<RequestBuilder {...props} />);
    return props;
  }

  it('renders the resolved path as path parameters are typed', async () => {
    renderBuilder();

    expect(screen.getByText('/accounts/{id}')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('string'), 'GABC');

    expect(screen.getByText('/accounts/GABC')).toBeInTheDocument();
  });

  it('sends path, query and header values', async () => {
    const props = renderBuilder();

    await userEvent.type(screen.getAllByPlaceholderText('string')[0], 'GABC');
    await userEvent.type(screen.getByPlaceholderText('Page cursor'), 'next');
    await userEvent.click(screen.getByRole('button', { name: /Add parameter/ }));
    await userEvent.type(screen.getByPlaceholderText('key'), 'limit');
    await userEvent.type(screen.getByPlaceholderText('value'), '10');
    await userEvent.click(screen.getByRole('button', { name: /Add header/ }));
    await userEvent.type(screen.getByPlaceholderText('Header-Name'), 'X-Trace');
    await userEvent.type(screen.getAllByPlaceholderText('value')[1], 'abc');
    await userEvent.click(screen.getByRole('button', { name: /Send/ }));

    expect(props.onSend).toHaveBeenCalledWith({
      pathParams: { id: 'GABC' },
      queryParams: { cursor: 'next', limit: '10' },
      body: '',
      headers: { 'X-Trace': 'abc' },
    });
  });

  it('shows the body editor only for endpoints that accept one', () => {
    renderBuilder({ hasBody: false });
    expect(screen.queryByPlaceholderText('{ "key": "value" }')).not.toBeInTheDocument();
  });

  it('reports the auth toggle', async () => {
    const props = renderBuilder();

    await userEvent.click(screen.getByRole('checkbox', { name: /Use stored API key/ }));

    expect(props.onUseAuthChange).toHaveBeenCalledWith(false);
  });

  it('disables Send while a request is in flight', () => {
    renderBuilder({ loading: true });

    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled();
  });
});

describe('PlaygroundTool', () => {
  it('shows a loading message while the spec is fetched', () => {
    mockFetchPlaygroundSpec.mockReturnValue(new Promise(() => {}));

    render(<PlaygroundTool />);

    expect(screen.getByText('Loading API specification…')).toBeInTheDocument();
  });

  it('offers a retry when the spec cannot be loaded', async () => {
    mockFetchPlaygroundSpec.mockRejectedValueOnce(new Error('502 Bad Gateway'));

    render(<PlaygroundTool />);

    expect(
      await screen.findByText(/Failed to load the Fluxa API specification/),
    ).toBeInTheDocument();
    expect(screen.getByText(/502 Bad Gateway/)).toBeInTheDocument();
  });

  it('renders the endpoint browser and the empty selection prompt', async () => {
    mockFetchPlaygroundSpec.mockResolvedValue({ spec: SPEC });

    render(<PlaygroundTool />);

    expect(await screen.findByText('Payments')).toBeInTheDocument();
    expect(
      screen.getByText('Select an endpoint from the sidebar to get started'),
    ).toBeInTheDocument();
  });

  it('sends a selected endpoint through the proxy and records it in history', async () => {
    mockFetchPlaygroundSpec.mockResolvedValue({ spec: SPEC });
    mockProxyPlaygroundRequest.mockResolvedValue({
      status: 200,
      latencyMs: 12,
      body: { items: [] },
      headers: {},
    });

    render(<PlaygroundTool />);

    await userEvent.click(await screen.findByRole('button', { name: /Payments/ }));
    await userEvent.click(screen.getByRole('button', { name: /GET\s+\/payments/ }));
    await userEvent.click(screen.getByRole('button', { name: /Send/ }));

    await waitFor(() =>
      expect(mockProxyPlaygroundRequest).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'fluxa', method: 'GET', path: '/payments' }),
      ),
    );
    expect(await screen.findByText('Recent Requests')).toBeInTheDocument();
    // The status shows in the response panel and again in the history row.
    expect(screen.getAllByText('200').length).toBeGreaterThan(0);
  });

  it('rejects an invalid JSON body without calling the proxy', async () => {
    mockFetchPlaygroundSpec.mockResolvedValue({ spec: SPEC });

    render(<PlaygroundTool />);

    await userEvent.click(await screen.findByRole('button', { name: /Payments/ }));
    await userEvent.click(screen.getByRole('button', { name: /POS\s+\/payments/ }));

    fireEvent.change(screen.getByPlaceholderText('{ "key": "value" }'), {
      target: { value: '{ not json' },
    });
    await userEvent.click(screen.getByRole('button', { name: /Send/ }));

    expect(await screen.findByText('Invalid JSON in request body')).toBeInTheDocument();
    expect(mockProxyPlaygroundRequest).not.toHaveBeenCalled();
  });

  it('records a failed request in history with an error status', async () => {
    mockFetchPlaygroundSpec.mockResolvedValue({ spec: SPEC });
    mockProxyPlaygroundRequest.mockRejectedValue(new Error('Proxy timeout'));

    render(<PlaygroundTool />);

    await userEvent.click(await screen.findByRole('button', { name: /Payments/ }));
    await userEvent.click(screen.getByRole('button', { name: /GET\s+\/payments/ }));
    await userEvent.click(screen.getByRole('button', { name: /Send/ }));

    expect(await screen.findByText('Request Failed')).toBeInTheDocument();
    expect(screen.getByText('Proxy timeout')).toBeInTheDocument();
    expect(screen.getByText('ERR')).toBeInTheDocument();
  });
});
