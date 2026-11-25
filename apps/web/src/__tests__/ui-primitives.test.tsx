/**
 * Shared UI primitives — tabs, select, live region and button
 * (Savitura/Savitools#695).
 *
 * These tests pin the accessibility contract the rest of the app relies on:
 * ARIA roles/state, keyboard navigation, and the documented behaviour of each
 * wrapper around its primitive.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '@/components/ui/button';
import { AsyncStatusAnnouncer, type AsyncStatusAnnouncement } from '@/components/ui/live-region';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

describe('Tabs', () => {
  function renderTabs() {
    return render(
      <Tabs defaultValue="one">
        <TabsList aria-label="Sections">
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
          <TabsTrigger value="three" disabled>
            Three
          </TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
        <TabsContent value="three">Third panel</TabsContent>
      </Tabs>,
    );
  }

  it('exposes tablist/tab/tabpanel roles with the initial selection', () => {
    renderTabs();

    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('First panel');
    expect(screen.queryByText('Second panel')).not.toBeInTheDocument();
  });

  it('switches panels on click and updates aria-selected', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'Two' }));

    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second panel');
  });

  it('supports arrow-key navigation between enabled tabs', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole('tab', { name: 'One' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');

    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
  });

  it('marks disabled triggers and does not activate them', async () => {
    const user = userEvent.setup();
    renderTabs();

    const disabled = screen.getByRole('tab', { name: 'Three' });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute('data-disabled', '');

    await user.click(disabled);
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Select', () => {
  function renderSelect(value: string | undefined, onValueChange = jest.fn()) {
    return render(
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label="Network">
          <SelectValue placeholder="Choose a network" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mainnet">Mainnet</SelectItem>
          <SelectItem value="testnet">Testnet</SelectItem>
        </SelectContent>
      </Select>,
    );
  }

  it('renders the selected value, or the placeholder when empty', () => {
    const { unmount } = renderSelect('mainnet');
    // SelectValue echoes the value it is given; labels live on the items.
    expect(screen.getByRole('button', { name: 'Network' })).toHaveTextContent('mainnet');
    unmount();

    renderSelect(undefined);
    expect(screen.getByRole('button', { name: 'Network' })).toHaveTextContent('Choose a network');
  });

  it('keeps the listbox closed until the trigger is pressed', async () => {
    const user = userEvent.setup();
    renderSelect('mainnet');

    expect(screen.queryByText('Testnet')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Network' }));

    expect(screen.getByText('Testnet')).toBeInTheDocument();
  });

  it('reports the chosen item and closes the listbox', async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    renderSelect('mainnet', onValueChange);

    await user.click(screen.getByRole('button', { name: 'Network' }));
    await user.click(screen.getByText('Testnet'));

    expect(onValueChange).toHaveBeenCalledWith('testnet');
    expect(screen.queryByText('Testnet')).not.toBeInTheDocument();
  });

  it('closes when a mousedown lands outside the select', async () => {
    const user = userEvent.setup();
    renderSelect('mainnet');

    await user.click(screen.getByRole('button', { name: 'Network' }));
    expect(screen.getByText('Testnet')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Testnet')).not.toBeInTheDocument();
  });
});

describe('AsyncStatusAnnouncer', () => {
  it('keeps polite and assertive live regions mounted and correctly labelled', () => {
    render(<AsyncStatusAnnouncer />);

    const polite = screen.getByTestId('async-status-polite');
    const assertive = screen.getByTestId('async-status-assertive');

    expect(polite).toHaveAttribute('role', 'status');
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(polite).toHaveAttribute('aria-atomic', 'true');
    expect(assertive).toHaveAttribute('role', 'alert');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');
    expect(assertive).toHaveAttribute('aria-atomic', 'true');
    expect(polite).toBeEmptyDOMElement();
    expect(assertive).toBeEmptyDOMElement();
  });

  it('routes success to the polite region and errors to the assertive one', () => {
    const success: AsyncStatusAnnouncement = { tone: 'success', message: 'Saved.', key: 'save' };
    const { rerender } = render(<AsyncStatusAnnouncer status={success} />);

    expect(screen.getByTestId('async-status-polite')).toHaveTextContent('Saved.');
    expect(screen.getByTestId('async-status-assertive')).toBeEmptyDOMElement();

    rerender(
      <AsyncStatusAnnouncer status={{ tone: 'error', message: 'Save failed.', key: 'save-error' }} />,
    );

    expect(screen.getByTestId('async-status-assertive')).toHaveTextContent('Save failed.');
    expect(screen.getByTestId('async-status-polite')).toBeEmptyDOMElement();
  });

  it('falls back to a tone+message identity when no key is supplied', () => {
    const { rerender } = render(
      <AsyncStatusAnnouncer status={{ tone: 'loading', message: 'Loading…' }} />,
    );
    const polite = screen.getByTestId('async-status-polite');
    expect(polite).toHaveTextContent('Loading…');

    rerender(<AsyncStatusAnnouncer status={{ tone: 'loading', message: 'Still loading…' }} />);

    expect(screen.getByTestId('async-status-polite')).toHaveTextContent('Still loading…');
  });

  it('does not re-announce an identical key on re-render', async () => {
    const status: AsyncStatusAnnouncement = {
      tone: 'loading',
      message: 'Refreshing…',
      key: 'refresh',
    };
    const { rerender } = render(<AsyncStatusAnnouncer status={status} />);
    const polite = screen.getByTestId('async-status-polite');

    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(polite, { childList: true, characterData: true, subtree: true });

    rerender(<AsyncStatusAnnouncer status={{ ...status }} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mutations).toHaveLength(0);
    observer.disconnect();
  });
});

describe('Button', () => {
  it('renders a native button with the default variant and size', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveClass('bg-primary', 'h-9', 'px-4');
  });

  it.each([
    ['destructive', 'bg-destructive'],
    ['outline', 'border'],
    ['secondary', 'bg-secondary'],
    ['ghost', 'hover:bg-accent'],
    ['link', 'underline-offset-4'],
  ] as const)('applies the %s variant class', (variant, expectedClass) => {
    render(<Button variant={variant}>{variant}</Button>);

    expect(screen.getByRole('button')).toHaveClass(expectedClass);
  });

  it.each([
    ['sm', 'h-8'],
    ['lg', 'h-10'],
    ['icon', 'h-9', 'w-9'],
  ] as const)('applies the %s size class', (size, ...classNames) => {
    render(<Button size={size}>Sized</Button>);

    expect(screen.getByRole('button')).toHaveClass(...classNames);
  });

  it('fires onClick and respects the disabled state', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>Run</Button>);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Run
      </Button>,
    );

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('forwards props and merges custom classes', () => {
    render(
      <Button type="submit" className="custom-class" aria-describedby="hint">
        Submit
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('aria-describedby', 'hint');
    expect(button).toHaveClass('custom-class', 'bg-primary');
  });

  it('renders its child element when asChild is set', () => {
    render(
      <Button asChild variant="outline">
        <a href="https://savitools.example/docs">Documentation</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Documentation' });
    expect(link).toHaveAttribute('href', 'https://savitools.example/docs');
    expect(link).toHaveClass('border');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
