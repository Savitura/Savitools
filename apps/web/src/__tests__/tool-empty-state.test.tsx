import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolEmptyState } from '@/components/tools/tool-empty-state';

describe('ToolEmptyState', () => {
  const defaultProps = {
    message: 'No data available yet',
    exampleLabel: 'Try an example',
    onExample: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders message text', () => {
    render(<ToolEmptyState {...defaultProps} />);

    expect(screen.getByText('No data available yet')).toBeInTheDocument();
  });

  it('renders example button with correct label', () => {
    render(<ToolEmptyState {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'Try an example' });
    expect(button).toBeInTheDocument();
  });

  it('calls onExample when button is clicked', async () => {
    const onExample = jest.fn();
    const user = userEvent.setup();

    render(<ToolEmptyState {...defaultProps} onExample={onExample} />);

    const button = screen.getByRole('button', { name: 'Try an example' });
    await user.click(button);

    expect(onExample).toHaveBeenCalledTimes(1);
  });

  it('renders with custom className', () => {
    const { container } = render(
      <ToolEmptyState {...defaultProps} className="custom-class" />,
    );

    const emptyState = container.firstChild as HTMLElement;
    expect(emptyState).toHaveClass('custom-class');
  });

  it('displays Sparkles icon', () => {
    const { container } = render(<ToolEmptyState {...defaultProps} />);

    // lucide-react icons render as SVG elements
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('applies correct styling classes for empty state container', () => {
    const { container } = render(<ToolEmptyState {...defaultProps} />);

    const emptyState = container.firstChild as HTMLElement;
    expect(emptyState).toHaveClass('border-dashed');
    expect(emptyState).toHaveClass('border-border');
    expect(emptyState).toHaveClass('rounded-lg');
  });

  it('supports multiple clicks without issues', async () => {
    const onExample = jest.fn();
    const user = userEvent.setup();

    render(<ToolEmptyState {...defaultProps} onExample={onExample} />);

    const button = screen.getByRole('button', { name: 'Try an example' });
    
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(onExample).toHaveBeenCalledTimes(3);
  });

  it('renders with long message text without breaking layout', () => {
    const longMessage =
      'This is a very long message that should still render correctly without breaking the layout. ' +
      'It contains multiple sentences and should wrap properly within the container.';

    render(<ToolEmptyState {...defaultProps} message={longMessage} />);

    expect(screen.getByText(longMessage)).toBeInTheDocument();
  });
});
