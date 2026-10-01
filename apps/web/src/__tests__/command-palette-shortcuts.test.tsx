/**
 * Command palette global keyboard shortcuts (Savitura/Savitools#245).
 *
 * `CommandPaletteProvider` owns the window-level Cmd/Ctrl shortcuts, including
 * the guard that must never hijack a native copy while the user has text
 * selected. These tests render the real provider and dispatch real keydown
 * events at `window`, so the production handler is what is under test.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useEffect } from 'react';

import { NetworkProvider } from '@/lib/network-context';
import { setUserPreferences } from '@/lib/preferences';
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

function renderPalette({
  actions,
  withDialog = false,
}: {
  actions?: ContextualActions;
  withDialog?: boolean;
} = {}) {
  const user = userEvent.setup();

  render(
    <NetworkProvider>
      <CommandPaletteProvider>
        <p>highlighted transaction hash</p>
        <CommandPaletteTrigger />
        {actions ? <ContextualActionsRegistrar actions={actions} /> : null}
        {withDialog ? <CommandPaletteDialog /> : null}
      </CommandPaletteProvider>
    </NetworkProvider>,
  );

  return { user, trigger: screen.getByRole('button', { name: /open command palette/i }) };
}

/**
 * Dispatches a cancelable keydown at window and hands back the event for
 * assertions. Routed through `fireEvent` so React flushes the state updates the
 * provider makes from a native (non-synthetic) listener.
 */
function pressGlobalShortcut(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  fireEvent(window, event);
  return event;
}

/** Selects the harness text the way a user dragging across the page would. */
function selectPageText(element: Element) {
  const selection = window.getSelection();
  if (!selection) throw new Error('window.getSelection() is unavailable');

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

beforeEach(() => {
  localStorage.clear();
  window.getSelection()?.removeAllRanges();
  mockPush.mockClear();
});

describe('Command palette global shortcuts', () => {
  it('copies the contextual transaction hash on Cmd+C when nothing is selected', () => {
    const copyTxHash = jest.fn(() => true);
    renderPalette({ actions: { copyTxHash, txHash: '0xabc123' } });

    const event = pressGlobalShortcut({ key: 'c', metaKey: true });

    expect(copyTxHash).toHaveBeenCalledTimes(1);
    // The action handled the copy, so the browser's own copy is suppressed.
    expect(event.defaultPrevented).toBe(true);
  });

  it('never hijacks native copy while the user has text selected', () => {
    const copyTxHash = jest.fn(() => true);
    renderPalette({ actions: { copyTxHash, txHash: '0xabc123' } });
    selectPageText(screen.getByText('highlighted transaction hash'));

    const event = pressGlobalShortcut({ key: 'c', metaKey: true });

    expect(window.getSelection()?.toString()).toBe('highlighted transaction hash');
    expect(copyTxHash).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the browser copy alone when the copy action reports it did not handle it', () => {
    const copyTxHash = jest.fn(() => false);
    renderPalette({ actions: { copyTxHash, txHash: '0xabc123' } });

    const event = pressGlobalShortcut({ key: 'c', metaKey: true });

    expect(copyTxHash).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('runs the contextual action on Cmd+Enter', () => {
    const runAction = jest.fn();
    renderPalette({ actions: { runAction, actionLabel: 'Inspect' } });

    const event = pressGlobalShortcut({ key: 'Enter', metaKey: true });

    expect(runAction).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores Cmd+Enter when the page registered no contextual action', () => {
    renderPalette({ withDialog: true });

    const event = pressGlobalShortcut({ key: 'Enter', metaKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('suppresses page shortcuts while the palette is open', async () => {
    const copyTxHash = jest.fn(() => true);
    const runAction = jest.fn();
    const { user, trigger } = renderPalette({
      actions: { copyTxHash, runAction },
      withDialog: true,
    });

    trigger.focus();
    await user.keyboard('{Meta>}k{/Meta}');
    await screen.findByRole('combobox');

    pressGlobalShortcut({ key: 'Enter', metaKey: true });
    pressGlobalShortcut({ key: 'c', metaKey: true });

    expect(runAction).not.toHaveBeenCalled();
    expect(copyTxHash).not.toHaveBeenCalled();
    // Still open, and the arrow keys belong to the palette rather than the page.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('toggles the palette open and closed with Cmd+K', async () => {
    const { user, trigger } = renderPalette({ withDialog: true });

    trigger.focus();
    await user.keyboard('{Meta>}k{/Meta}');
    await screen.findByRole('combobox');

    await user.keyboard('{Meta>}k{/Meta}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ignores shortcuts entirely when shortcuts are disabled in preferences', () => {
    setUserPreferences({ keyboardShortcutsEnabled: false, commandPaletteEnabled: true });
    const { trigger } = renderPalette({ withDialog: true });

    expect(trigger).toHaveAttribute('title', 'Command palette is disabled in Settings');

    pressGlobalShortcut({ key: 'k', metaKey: true });
    pressGlobalShortcut({ key: 'Enter', metaKey: true });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
