/**
 * Keyboard navigation and focus-trap tests for web tool dialogs and command palette (Savitura/Savitools#355).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { NetworkProvider } from '@/lib/network-context';
import {
  CommandPaletteDialog,
  CommandPaletteProvider,
  CommandPaletteTrigger,
} from '@/components/command-palette';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
}));

function TestDialogHarness() {
  return (
    <NetworkProvider>
      <CommandPaletteProvider>
        <div className="p-4">
          <button type="button" data-testid="outside-trigger">
            Outside Trigger
          </button>
          <CommandPaletteTrigger />
          <CommandPaletteDialog />
        </div>
      </CommandPaletteProvider>
    </NetworkProvider>
  );
}

describe('Web Tool Dialogs and Command Palette Keyboard Navigation & Focus Trap', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPush.mockClear();
  });

  it('supports Escape-key dismissal and restores focus to the triggering element', async () => {
    const user = userEvent.setup();
    render(<TestDialogHarness />);

    const trigger = screen.getByRole('button', { name: /open command palette/i });
    trigger.focus();
    expect(trigger).toHaveFocus();

    // Open palette via keyboard or click
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const input = screen.getByRole('combobox');
    await waitFor(() => expect(input).toHaveFocus());

    // Dismiss with Escape key
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Verify focus restoration
    expect(trigger).toHaveFocus();
  });

  it('ensures ARIA roles and proper combobox/listbox attributes are maintained during keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<TestDialogHarness />);

    const trigger = screen.getByRole('button', { name: /open command palette/i });
    await user.click(trigger);

    const input = await screen.findByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-haspopup', 'listbox');

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    // Navigate down
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);

    // Close with Escape
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
