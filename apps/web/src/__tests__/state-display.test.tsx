import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  LoadingState,
  ErrorState,
  EmptyState,
  InspectorEmptyState,
} from '@/components/tools/state-display';

describe('LoadingState', () => {
  it('renders with default loading message', () => {
    render(<LoadingState />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<LoadingState label="Fetching data..." />);

    expect(screen.getByText('Fetching data...')).toBeInTheDocument();
  });

  it('renders with description', () => {
    render(<LoadingState label="Processing" description="This may take a moment" />);

    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('This may take a moment')).toBeInTheDocument();
  });

  it('applies different size classes', () => {
    const { container: smContainer } = render(<LoadingState size="sm" />);
    const { container: mdContainer } = render(<LoadingState size="md" />);
    const { container: lgContainer } = render(<LoadingState size="lg" />);

    // Check that different sizes render (icons have different classes)
    expect(smContainer.querySelector('.h-4')).toBeInTheDocument();
    expect(mdContainer.querySelector('.h-5')).toBeInTheDocument();
    expect(lgContainer.querySelector('.h-8')).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    const CustomIcon = () => <div data-testid="custom-icon">Custom</div>;
    render(<LoadingState icon={<CustomIcon />} />);

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<LoadingState className="custom-loading" />);

    expect(container.querySelector('.custom-loading')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  const mockRetry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with error message', () => {
    render(<ErrorState message="Something went wrong" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Use getAllByText since the message appears in both title and message
    const elements = screen.getAllByText('Something went wrong');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('renders with custom title', () => {
    render(<ErrorState title="Custom Error" message="Error details" />);

    expect(screen.getByText('Custom Error')).toBeInTheDocument();
    expect(screen.getByText('Error details')).toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    render(<ErrorState message="Error occurred" onRetry={mockRetry} />);

    const retryButton = screen.getByRole('button', { name: /Try again/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup();
    render(<ErrorState message="Error occurred" onRetry={mockRetry} />);

    const retryButton = screen.getByRole('button', { name: /Try again/i });
    await user.click(retryButton);

    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('renders custom retry label', () => {
    render(<ErrorState message="Error" onRetry={mockRetry} retryLabel="Reload" />);

    expect(screen.getByRole('button', { name: /Reload/i })).toBeInTheDocument();
  });

  it('renders secondary action button when provided', async () => {
    const secondaryAction = {
      label: 'Go back',
      onClick: jest.fn(),
    };
    const user = userEvent.setup();

    render(<ErrorState message="Error" secondaryAction={secondaryAction} />);

    const secondaryButton = screen.getByRole('button', { name: /Go back/i });
    expect(secondaryButton).toBeInTheDocument();

    await user.click(secondaryButton);
    expect(secondaryAction.onClick).toHaveBeenCalledTimes(1);
  });

  it('renders error details when provided', () => {
    render(<ErrorState message="Error" details="Stack trace details here" />);

    expect(screen.getByText(/View error details/i)).toBeInTheDocument();
    expect(screen.getByText('Stack trace details here')).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    const CustomIcon = () => <div data-testid="custom-error-icon">!</div>;
    render(<ErrorState message="Error" icon={<CustomIcon />} />);

    expect(screen.getByTestId('custom-error-icon')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<ErrorState message="Error" className="custom-error" />);

    expect(container.querySelector('.custom-error')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  const mockAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with message', () => {
    render(<EmptyState message="No data available" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('renders with title and message', () => {
    render(<EmptyState title="Empty" message="Nothing here" />);

    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const action = {
      label: 'Create new',
      onClick: mockAction,
    };

    render(<EmptyState message="Empty" action={action} />);

    expect(screen.getByRole('button', { name: /Create new/i })).toBeInTheDocument();
  });

  it('calls action onClick when button is clicked', async () => {
    const action = {
      label: 'Add item',
      onClick: mockAction,
    };
    const user = userEvent.setup();

    render(<EmptyState message="Empty" action={action} />);

    const button = screen.getByRole('button', { name: /Add item/i });
    await user.click(button);

    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('renders secondary action button', async () => {
    const secondaryAction = {
      label: 'Learn more',
      onClick: jest.fn(),
    };
    const user = userEvent.setup();

    render(<EmptyState message="Empty" secondaryAction={secondaryAction} />);

    const button = screen.getByRole('button', { name: /Learn more/i });
    await user.click(button);

    expect(secondaryAction.onClick).toHaveBeenCalledTimes(1);
  });

  it('renders tips list when provided', () => {
    const tips = ['Tip 1: Do this', 'Tip 2: Try that', 'Tip 3: Check this'];

    render(<EmptyState message="Empty" tips={tips} />);

    expect(screen.getByText('Tip 1: Do this')).toBeInTheDocument();
    expect(screen.getByText('Tip 2: Try that')).toBeInTheDocument();
    expect(screen.getByText('Tip 3: Check this')).toBeInTheDocument();
  });

  it('renders custom icon', () => {
    const CustomIcon = () => <div data-testid="custom-empty-icon">📦</div>;

    render(<EmptyState message="Empty" icon={<CustomIcon />} />);

    expect(screen.getByTestId('custom-empty-icon')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<EmptyState message="Empty" className="custom-empty" />);

    expect(container.querySelector('.custom-empty')).toBeInTheDocument();
  });
});

describe('InspectorEmptyState', () => {
  it('renders with guidance message', () => {
    render(<InspectorEmptyState onExample={jest.fn()} />);

    expect(screen.getByText('Nothing to inspect yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Paste a transaction hash, Stellar address, or raw XDR/i),
    ).toBeInTheDocument();
  });

  it('renders example button and calls onExample when clicked', async () => {
    const onExample = jest.fn();
    const user = userEvent.setup();

    render(<InspectorEmptyState onExample={onExample} />);

    const button = screen.getByRole('button', { name: /Try example transaction/i });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onExample).toHaveBeenCalledTimes(1);
  });

  it('renders helpful tips', () => {
    render(<InspectorEmptyState onExample={jest.fn()} />);

    expect(screen.getByText(/Transaction hash: 64-character hex string/i)).toBeInTheDocument();
    expect(screen.getByText(/Stellar address: Public key starting with G/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw XDR: Base64-encoded transaction envelope/i)).toBeInTheDocument();
  });
});
