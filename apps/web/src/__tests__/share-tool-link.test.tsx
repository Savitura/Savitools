import { render, screen, fireEvent, act } from '@testing-library/react';
import { ShareToolLink } from '@/components/tools/share-tool-link';

describe('ShareToolLink', () => {
  let writeTextMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();

    // Mock navigator.clipboard
    writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://savitools.example.com',
        pathname: '/inspector',
        search: '?hash=abc123',
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders copy link button with initial state', () => {
    render(<ShareToolLink />);

    const button = screen.getByRole('button', { name: /Copy a link to this tool state/i });
    expect(button).toBeInTheDocument();
    expect(screen.getByText('Copy link')).toBeInTheDocument();
  });

  it('copies the current URL to clipboard when clicked', async () => {
    render(<ShareToolLink />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeTextMock).toHaveBeenCalledWith(
      'https://savitools.example.com/inspector?hash=abc123',
    );
  });

  it('shows "Copied" state after successful copy', async () => {
    render(<ShareToolLink />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(screen.queryByText('Copy link')).not.toBeInTheDocument();
  });

  it('reverts to initial state after timeout', async () => {
    jest.useFakeTimers();

    render(<ShareToolLink />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();

    // Fast-forward past the 1600ms timeout
    act(() => {
      jest.advanceTimersByTime(1700);
    });

    expect(screen.getByText('Copy link')).toBeInTheDocument();
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();

    jest.useRealTimers();
  });

  it('handles clipboard write failure gracefully', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('Clipboard error'));

    render(<ShareToolLink />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });

    // Should not crash and should stay in initial state
    expect(screen.getByText('Copy link')).toBeInTheDocument();
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('constructs URL with pathname and search parameters', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://example.com',
        pathname: '/composer',
        search: '?op=payment&amount=100',
      },
      writable: true,
      configurable: true,
    });

    render(<ShareToolLink />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeTextMock).toHaveBeenCalledWith(
      'https://example.com/composer?op=payment&amount=100',
    );
  });

  it('constructs URL without search parameters when none exist', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'https://example.com',
        pathname: '/sandbox',
        search: '',
      },
      writable: true,
      configurable: true,
    });

    render(<ShareToolLink />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeTextMock).toHaveBeenCalledWith('https://example.com/sandbox');
  });

  it('updates aria-label based on copied state', async () => {
    render(<ShareToolLink />);

    const button = screen.getByRole('button', { name: /Copy a link to this tool state/i });
    expect(button).toHaveAttribute('aria-label', 'Copy a link to this tool state');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(button).toHaveAttribute('aria-label', 'Link copied');
  });

  it('renders Check icon when copied', async () => {
    const { container } = render(<ShareToolLink />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();

    // Check that Check icon SVG is rendered (lucide icons render as SVG)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('applies correct CSS classes for styling', () => {
    const { container } = render(<ShareToolLink />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('border');
    expect(button).toHaveClass('border-border');
    expect(button).toHaveClass('text-muted-foreground');
  });
});
