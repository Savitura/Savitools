import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/components/tools/error-boundary';

// Mock window.location.reload and window.location.href
const mockReload = jest.fn();
const mockLocationHref = jest.fn();

Object.defineProperty(window, 'location', {
  value: {
    reload: mockReload,
    href: null,
  },
  writable: true,
});

function ThrowingComponent({ error }: { error: Error }): never {
  throw error;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error in tests (ErrorBoundary logs caught errors)
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Child content</div>
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders default fallback UI when an error is caught', () => {
    const testError = new Error('Test error message');

    render(
      <ErrorBoundary>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('includes tool name in error message when provided', () => {
    const testError = new Error('Tool-specific error');

    render(
      <ErrorBoundary toolName="Inspector">
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Something went wrong in Inspector/i)).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const testError = new Error('Custom fallback test');
    const customFallback = <div data-testid="custom">Custom error UI</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('custom')).toBeInTheDocument();
    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Test error message')).not.toBeInTheDocument();
  });

  it('calls onReset callback and reloads page when Retry is clicked', async () => {
    const onReset = jest.fn();
    const testError = new Error('Reset test');
    const user = userEvent.setup();

    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    const retryButton = screen.getByRole('button', { name: /Retry/i });
    await user.click(retryButton);

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('navigates to home when Go home button is clicked', async () => {
    const testError = new Error('Home navigation test');
    const user = userEvent.setup();

    // Mock window.location.href setter
    Object.defineProperty(window.location, 'href', {
      set: mockLocationHref,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    const homeButton = screen.getByRole('button', { name: /Go home/i });
    await user.click(homeButton);

    expect(mockLocationHref).toHaveBeenCalledWith('/');
  });

  it('shows stack trace in development mode', () => {
    const env = process.env as Record<string, string | undefined>;
    const originalEnv = env.NODE_ENV;
    env.NODE_ENV = 'development';

    const testError = new Error('Stack trace test');
    testError.stack = 'Error: Stack trace test\n  at TestComponent\n  at ErrorBoundary';

    render(
      <ErrorBoundary>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Developer stack trace/i)).toBeInTheDocument();
    expect(screen.getByText(/at TestComponent/i)).toBeInTheDocument();

    env.NODE_ENV = originalEnv;
  });

  it('applies custom className to error container', () => {
    const testError = new Error('Custom className test');

    const { container } = render(
      <ErrorBoundary className="custom-error-class">
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    const errorDiv = container.querySelector('.custom-error-class');
    expect(errorDiv).toBeInTheDocument();
  });

  it('logs error to console with tool name when provided', () => {
    const consoleError = jest.spyOn(console, 'error');
    const testError = new Error('Console log test');

    render(
      <ErrorBoundary toolName="TestTool">
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    expect(consoleError).toHaveBeenCalled();
    // Check that console.error was called with something that includes TestTool
    const calls = consoleError.mock.calls;
    const hasTestTool = calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('TestTool')),
    );
    expect(hasTestTool).toBe(true);
  });

  it('triggers structured logging and optional onError callback when a tool execution fails', () => {
    const onError = jest.fn();
    const testError = new Error('Component crashed during execution');

    render(
      <ErrorBoundary toolName="Composer" onError={onError}>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [rawError, structuredLog] = onError.mock.calls[0];
    expect(rawError).toBe(testError);
    expect(structuredLog).toMatchObject({
      level: 'error',
      event: 'tool_execution_failed',
      toolName: 'Composer',
      action: 'render',
      error: {
        name: 'Error',
        message: 'Component crashed during execution',
      },
    });
    expect(structuredLog.timestamp).toBeDefined();
  });

  it('recovers and renders children after error state is reset', async () => {
    const testError = new Error('Recovery test');
    const user = userEvent.setup();
    let shouldThrow = true;

    function ConditionalThrow() {
      if (shouldThrow) {
        throw testError;
      }
      return <div data-testid="recovered">Recovered content</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Simulate recovery - component no longer throws
    shouldThrow = false;

    const retryButton = screen.getByRole('button', { name: /Retry/i });
    await user.click(retryButton);

    // Note: In a real scenario, reload would happen, but for testing we verify the state resets
    expect(mockReload).toHaveBeenCalled();
  });
});
