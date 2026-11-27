import { render, screen } from '@testing-library/react';
import { ToolPageShell } from '@/components/tools/tool-page-shell';

// Mock Next.js Link component
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('ToolPageShell', () => {
  const defaultProps = {
    title: 'Test Tool',
    description: 'This is a test tool for demonstration',
    children: <div data-testid="child-content">Tool content goes here</div>,
  };

  it('renders title and description', () => {
    render(<ToolPageShell {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Test Tool' })).toBeInTheDocument();
    expect(screen.getByText('This is a test tool for demonstration')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<ToolPageShell {...defaultProps} />);

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Tool content goes here')).toBeInTheDocument();
  });

  it('renders share tool link button', () => {
    render(<ToolPageShell {...defaultProps} />);

    expect(
      screen.getByRole('button', { name: /Copy a link to this tool state/i }),
    ).toBeInTheDocument();
  });

  it('renders docs link when docsHref is provided', () => {
    render(<ToolPageShell {...defaultProps} docsHref="/docs/test-tool" />);

    const docsLink = screen.getByRole('link', { name: /Usage docs/i });
    expect(docsLink).toBeInTheDocument();
    expect(docsLink).toHaveAttribute('href', '/docs/test-tool');
  });

  it('does not render docs link when docsHref is not provided', () => {
    render(<ToolPageShell {...defaultProps} />);

    expect(screen.queryByRole('link', { name: /Usage docs/i })).not.toBeInTheDocument();
  });

  it('applies custom className to main element', () => {
    const { container } = render(<ToolPageShell {...defaultProps} className="custom-shell" />);

    const mainElement = container.querySelector('main');
    expect(mainElement).toHaveClass('custom-shell');
  });

  it('renders with correct semantic HTML structure', () => {
    const { container } = render(<ToolPageShell {...defaultProps} />);

    // Should have main element
    const mainElement = container.querySelector('main');
    expect(mainElement).toBeInTheDocument();

    // Should have h1 heading
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
  });

  it('renders BookOpen icon for docs link', () => {
    const { container } = render(<ToolPageShell {...defaultProps} docsHref="/docs/test" />);

    const docsLink = screen.getByRole('link', { name: /Usage docs/i });

    // Check that an SVG icon is present (lucide icons render as SVG)
    const icon = docsLink.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('applies correct styling classes to container', () => {
    const { container } = render(<ToolPageShell {...defaultProps} />);

    const mainElement = container.querySelector('main');
    expect(mainElement).toHaveClass('min-h-screen');
    expect(mainElement).toHaveClass('bg-background');
  });

  it('renders multiple children correctly', () => {
    render(
      <ToolPageShell {...defaultProps}>
        <div data-testid="child-1">First child</div>
        <div data-testid="child-2">Second child</div>
        <div data-testid="child-3">Third child</div>
      </ToolPageShell>,
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
    expect(screen.getByTestId('child-3')).toBeInTheDocument();
  });

  it('handles long title and description gracefully', () => {
    const longTitle = 'Very Long Tool Title That Might Wrap To Multiple Lines In Some Cases';
    const longDescription =
      'This is an extremely long description that provides detailed information about the tool and its capabilities. It should wrap correctly and not break the layout.';

    render(<ToolPageShell {...defaultProps} title={longTitle} description={longDescription} />);

    expect(screen.getByText(longTitle)).toBeInTheDocument();
    expect(screen.getByText(longDescription)).toBeInTheDocument();
  });

  it('maintains responsive layout with flex-wrap', () => {
    const { container } = render(<ToolPageShell {...defaultProps} docsHref="/docs/test" />);

    const headerContainer = container.querySelector('.flex-wrap');
    expect(headerContainer).toBeInTheDocument();
  });

  it('renders with correct max-width constraint', () => {
    const { container } = render(<ToolPageShell {...defaultProps} />);

    const contentContainer = container.querySelector('.max-w-6xl');
    expect(contentContainer).toBeInTheDocument();
  });
});
