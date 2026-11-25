/**
 * SDK Generator page — stale code prevention (Savitura/Savitools).
 *
 * Covers:
 *  - Primary path: generated code is rendered after a successful API call.
 *  - Failure path: on a failed generation the error UI is shown and no stale
 *    code from a previous successful call remains visible.
 *  - Retry path: clicking Retry re-fetches and shows fresh code when the
 *    subsequent call succeeds; it does not merely clear the error UI.
 *  - Race-condition / stale-response guard: a slow response belonging to a
 *    superseded selection (or retry) is discarded and never rendered.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SdkGeneratorPage from '@/app/sdk/page';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/api', () => ({
  apiFetch: jest.fn(),
}));

jest.mock('@/lib/network-context', () => ({
  useNetwork: () => ({ network: 'testnet' }),
}));

// Render ToolPageShell as a plain wrapper so the test does not depend on
// next/link or the global ShareToolLink component.
jest.mock('@/components/tools/tool-page-shell', () => ({
  ToolPageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// SdkCodeBlock imports Prism CSS which Jest cannot parse. Render a simple
// <pre> so assertions on generated code content still work.
jest.mock('@/components/SdkCodeBlock', () => ({
  SdkCodeBlock: ({ code, language }: { code: string; language: string }) => (
    <pre data-testid="sdk-code-block" data-language={language}>{code}</pre>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const apiFetchMock = apiFetch as jest.MockedFunction<typeof apiFetch>;

const TYPESCRIPT_CODE = `import axios from 'axios';\nconst response = await axios.get('https://api.example.com/items');`;
const PYTHON_CODE = `import requests\nresponse = requests.get('https://api.example.com/items')`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SdkGeneratorPage — stale code prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders generated code after a successful API call (primary path)', async () => {
    apiFetchMock.mockResolvedValueOnce({ code: TYPESCRIPT_CODE });

    render(<SdkGeneratorPage />);

    // The code block must appear once the fetch resolves.
    const codeBlock = await screen.findByTestId('sdk-code-block');
    expect(codeBlock).toHaveTextContent('import axios');

    // The error UI must not be shown for a successful call.
    expect(screen.queryByText('Failed to generate SDK code')).not.toBeInTheDocument();
  });

  it('shows the error UI and does not render stale code after a failed generation', async () => {
    // First call succeeds — puts code into state.
    apiFetchMock.mockResolvedValueOnce({ code: TYPESCRIPT_CODE });
    render(<SdkGeneratorPage />);
    await screen.findByTestId('sdk-code-block');

    // Second call (user switches to CrowdPay) fails — the previously rendered
    // code must not remain visible.
    apiFetchMock.mockRejectedValueOnce(new Error('Service unavailable'));

    const crowdPayButton = screen.getByRole('radio', { name: 'CrowdPay' });
    await userEvent.click(crowdPayButton);

    // Error heading must appear.
    expect(await screen.findByText('Failed to generate SDK code')).toBeInTheDocument();
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();

    // The code block must be gone — stale TypeScript snippet must not appear.
    expect(screen.queryByTestId('sdk-code-block')).not.toBeInTheDocument();
    expect(screen.queryByText('import axios')).not.toBeInTheDocument();
  });

  it('re-fetches fresh code when Retry is clicked after a failure', async () => {
    // Initial call fails.
    apiFetchMock.mockRejectedValueOnce(new Error('timeout'));
    render(<SdkGeneratorPage />);
    expect(await screen.findByText('Failed to generate SDK code')).toBeInTheDocument();

    // Second call (triggered by Retry) succeeds.
    apiFetchMock.mockResolvedValueOnce({ code: TYPESCRIPT_CODE });

    const retryButton = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryButton);

    // Fresh code must appear; error must be gone.
    const codeBlock = await screen.findByTestId('sdk-code-block');
    expect(codeBlock).toHaveTextContent('import axios');
    expect(screen.queryByText('Failed to generate SDK code')).not.toBeInTheDocument();

    // apiFetch must have been called twice: once on mount, once after Retry.
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('discards a stale response that arrives after a newer selection has been made', async () => {
    // The first fetch (Fluxa/TypeScript) is intentionally slow — it will only
    // resolve after the user has already switched to Python, whose fetch
    // resolves first with fresh code.
    let resolveFirstFetch!: (value: { code: string }) => void;
    const firstFetch = new Promise<{ code: string }>((resolve) => {
      resolveFirstFetch = resolve;
    });

    // On mount: slow stale fetch for TypeScript.
    apiFetchMock.mockReturnValueOnce(firstFetch as Promise<unknown>);
    // After tab switch: fast fresh fetch for Python.
    apiFetchMock.mockResolvedValueOnce({ code: PYTHON_CODE });

    render(<SdkGeneratorPage />);

    // Switch to Python before the first fetch resolves.
    const pythonTab = screen.getByRole('tab', { name: 'Python' });
    await userEvent.click(pythonTab);

    // Wait for the Python code to appear.
    const codeBlock = await screen.findByTestId('sdk-code-block');
    expect(codeBlock).toHaveTextContent('import requests');

    // Now the stale TypeScript response arrives — it must be discarded.
    resolveFirstFetch({ code: TYPESCRIPT_CODE });

    // Give React a tick to process any state updates.
    await waitFor(() => {
      // Python code must still be shown; TypeScript snippet must not appear.
      expect(screen.queryByText('import axios')).not.toBeInTheDocument();
      expect(screen.getByTestId('sdk-code-block')).toHaveTextContent('import requests');
    });
  });
});
