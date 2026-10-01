/**
 * Command palette dialog behaviour (Savitura/Savitools#245).
 *
 * These tests mount the real `CommandPaletteDialog` inside the same provider
 * stack `app/layout.tsx` uses and drive it with keyboard interaction, so the
 * combobox/listbox ARIA contract, the roving `aria-activedescendant`, Enter / Escape
 * handling and the focus restore on close are all asserted against the
 * component rather than against a copy of its logic.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useEffect } from 'react';

import { NetworkProvider } from '@/lib/network-context';
import {
  CommandPaletteDialog,
  CommandPaletteProvider,
  CommandPaletteTrigger,
  useCommandPalette,
} from '@/components/command-palette';
import type { ContextualActions } from '@/components/command-palette';

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

/** Publishes contextual actions the way tool pages do, via the palette context. */
function ContextualActionsRegistrar({ actions }: { actions: ContextualActions }) {
  const { registerContextActions } = useCommandPalette();

  useEffect(() => registerContextActions(actions), [actions, registerContextActions]);

  return null;
}

function renderPalette(actions?: ContextualActions) {
  const user = userEvent.setup();

  render(
    <NetworkProvider>
      <CommandPaletteProvider>
        <CommandPaletteTrigger />
        {actions ? <ContextualActionsRegistrar actions={actions} /> : null}
        <CommandPaletteDialog />
      </CommandPaletteProvider>
    </NetworkProvider>,
  );

  return { user, trigger: screen.getByRole('button', { name: /open command palette/i }) };
}

/** Opens the palette with Cmd+K in the way a user does, and waits for its input. */
async function openPalette(actions?: ContextualActions) {
  const { user, trigger } = renderPalette(actions);

  trigger.focus();
  await user.keyboard('{Meta>}k {/Meta}');

  const input = await screen.findByRole('combobox');
  await waitFor(() => expect(input).toHaveFocus());

  return { user, trigger, input };
}

function options() {
  return screen.getAllByRole('option');
}

beforeEach(() => {
  localStorage.clear();
  window.getSelection()?.removeAllRanges();
  mockPush.mockClear();
});

describe('CommandPaletteDialog', () => {
  it('renders nothing until the palette is opened', () => {
    renderPalette();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('wires the search input to the listbox as a combobox popup', async () => {
    await openPalette();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-haspopup', 'listbox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');

    // aria-controls must resolve to the rendered listbox, not to a dangling id.
    const listboxId = input.getAttribute('aria-controls');
    expect(listboxId).toBeTruthy();
    const listbox = screen.getByRole('listbox', { name: 'Commands and suggestions' });
    expect(listbox.id).toBe(listboxId);

    // The first option is active before any key is pressed.
    const allOptions = options();
    expect(allOptions.length).toBeGreaterThan(1);
    expect(input).toHaveAttribute('aria-activedescendant', allOptions[0].id);
    expect(allOptions[0]).toHaveAttribute('aria-selected', 'true');
    for (const option of allOptions.slice(1)) {
      expect(option).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('moves aria-activedescendant with ArrowDown and ArrowUp', async () => {
    const { user, input } = await openPalette();
    const allOptions = options();

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', allOptions[1].id);
    expect(allOptions[1]).toHaveAttribute('aria-selected', 'true');
    expect(allOptions[0]).toHaveAttribute('aria-selected', 'false');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', allOptions[2].id);
    expect(allOptions[2]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', allOptions[1].id);
    expect(allOptions[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('wraps around at both ends of the list', async () => {
    const { user, input } = await openPalette();
    const allOptions = options();
    const last = allOptions[allOptions.length - 1];

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', last.id);
    expect(last).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', allOptions[0].id);
  });

  it('jumps to the first and last option on Home and End', async () => {
    const { user, input } = await openPalette();
    const allOptions = options();
    const last = allOptions[allOptions.length - 1];

    await user.keyboard('{End}');
    expect(input).toHaveAttribute('aria-activedescendant', last.id);
    expect(last).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(input).toHaveAttribute('aria-activedescendant', allOptions[0].id);
    expect(allOptions[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('moves the active option on hover, keeping activedescendant in sync', async () => {
    const { user, input } = await openPalette();
    const allOptions = options();

    await user.hover(allOptions[2]);

    expect(input).toHaveAttribute('aria-activedescendant', allOptions[2].id);
    expect(allOptions[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('re-filters on query change and drops activedescendant when nothing matches', async () => {
    const { user, input } = await openPalette();
    const initialCount = options().length;

    await user.type(input, 'composer');

    const filtered = options();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(initialCount);
    // A new query resets the active option to the top of the new result set.
    expect(input).toHaveAttribute('aria-activedescendant', filtered[0].id);
    expect(filtered[0]).toHaveAttribute('aria-selected', 'true');

    await user.clear(input);
    await user.type(input, 'zzzz-no-such-command');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(
      within(screen.getByRole('listbox')).getByText(/no matching commands or tools/i),
    ).toBeInTheDocument();
  });

  it('runs the active command on Enter, navigates and closes the palette', async () => {
    const { user } = await openPalette();
    const allOptions = options();

    // The first quick action is "New Visual Transaction (Composer)" -> /composer.
    expect(within(allOptions[0]).getByText(/New Visual Transaction/i)).toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/composer');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs a contextual action instead of navigating when the active command has one', async () => {
    const copyTxHash = jest.fn(() => true);
    const actions: ContextualActions = {
      copyTxHash,
      txHash: '0xabc123',
    };

    const { user } = await openPalette(actions);
    const allOptions = options();
    expect(within(allOptions[0]).getByText(/Copy Active Transaction Hash/i)).toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(copyTxHash).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('selects a command on click', async () => {
    const { user } = await openPalette();

    await user.click(screen.getByRole('option', { name: /Network Status/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/network');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user, trigger } = await openPalette();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on Escape even when no command matches the query', async () => {
    const { user, input, trigger } = await openPalette();

    await user.type(input, 'zzzz-no-such-command');
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps focus inside the dialog on Tab', async () => {
    const { user, input } = await openPalette();

    await user.tab();

    expect(input).toHaveFocus();
  });

  it('exposes the StrKey codec laboratory from the command palette', async () => {
    const { user, input } = await openPalette();

    await user.type(input, 'str key');

    const filtered = options();
    expect(filtered.length).toBeGreaterThan(0);
    expect(
      within(filtered[0]).getByText(/StrKey Codec/i),
    ).toInTheDocument();

    await user.keyboard('{Enter}');

    expect(mockPush).toHaveBeenCalledWith('/tools/strkey');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
