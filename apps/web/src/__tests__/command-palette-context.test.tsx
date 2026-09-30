/**
 * First component test for @savitools/web (Savitura/Savitools#244).
 *
 * `CommandPaletteProvider` is the app's cross-cutting state machine: it owns the
 * palette's open/closed state, owns the global Cmd/Ctrl shortcut listener, and
 * hands contextual actions down to whichever tool is mounted. It has no DOM
 * dependencies beyond jsdom, which makes it the right component to prove the
 * React Testing Library setup end to end.
 *
 * This suite is the regression proof for the three defects in #244: it renders
 * React (jsdom, not node), it lives in a `.tsx` file (testMatch must collect it)
 * and it resolves `@/…` (moduleNameMapper).
 *
 * It also guards the StrKey laboratory's discoverability requirement: the tool
 * must be reachable from the command palette, so the palette's catalogue
 * integration is exercised here alongside the state machine.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';

import {
  CommandPaletteProvider,
  useCommandPalette,
} from '@/components/command-palette/command-palette-context';
import { USER_PREFERENCES_STORAGE_KEY } from '@/lib/preferences';
import { TOOLS } from '@/lib/tools';

/** Exposes the context state machine as observable DOM. */
function PaletteProbe() {
  const { isOpen, openPalette, closePalette, togglePalette, contextualActions } =
    useCommandPalette();

  return (
    <div>
      <output data-testid="is-open">{String(isOpen)}</output>
      <output data-testid="action-label">
        {contextualActions?.actionLabel ?? 'none'}
      </output>
      <button type="button" onClick={openPalette}>
        open
      </button>
      <button type="button" onClick={closePalette}>
        close
      </button>
      <button type="button" onClick={togglePalette}>
        toggle
      </button>
    </div>
  );
}

/** Registers contextual actions while mounted, exactly like a tool page does. */
function ContextualActionsHost({
  actions,
}: {
  actions: Parameters<ReturnType<typeof useCommandPalette>['registerContextActions']>[0];
}) {
  const { registerContextActions } = useCommandPalette();

  useEffect(() => registerContextActions(actions), [registerContextActions, actions]);

  return <PaletteProbe />;
}

function disableKeyboardShortcuts(): void {
  window.localStorage.setItem(
    USER_PREFERENCES_STORAGE_KEY,
    JSON.stringify({
      keyboardShortcutsEnabled: false,
      commandPaletteEnabled: true,
    }),
  );
}

const isOpen = (): string => screen.getByTestId('is-open').textContent ?? '';

describe('CommandPaletteProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts closed and opens, closes and toggles through the context controls', () => {
    render(
      <CommandPaletteProvider>
        <PaletteProbe />
      </CommandPaletteProvider>,
    );

    expect(isOpen()).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(isOpen()).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(isOpen()).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(isOpen()).toBe('true');
  });

  it('toggles on Cmd/Ctrl+K and closes on Escape', () => {
    render(
      <CommandPaletteProvider>
        <PaletteProbe />
      </CommandPaletteProvider>,
    );

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(isOpen()).toBe('true');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe('false');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(isOpen()).toBe('true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(isOpen()).toBe('false');
  });

  it('ignores the shortcuts while they are disabled in user preferences', () => {
    disableKeyboardShortcuts();

    render(
      <CommandPaletteProvider>
        <PaletteProbe />
      </CommandPaletteProvider>,
    );

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(isOpen()).toBe('false');

    // Even the explicit control is gated while shortcuts are off.
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(isOpen()).toBe('false');
  });

  it('publishes registered contextual actions and runs them on Cmd/Ctrl+Enter', () => {
    const runAction = jest.fn();

    render(
      <CommandPaletteProvider>
        <ContextualActionsHost actions={{ runAction, actionLabel: 'Inspect' }} />
      </CommandPaletteProvider>,
    );

    expect(screen.getByTestId('action-label').textContent).toBe('Inspect');

    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it('exposes the StrKey laboratory through the tools catalogue', () => {
    const strKeyTool = TOOLS.find((tool) => tool.slug === 'strkey');

    expect(strKeyTool).toBeDefined();
    expect(strKeyTool?.name).toMatch(/strkey/i);
    expect(strKeyTool?.href).toBe('/tools/strkey');
  });

  it('does not hijack the native copy shortcut while text is selected', () => {
    const copyTxHash = jest.fn().mockReturnValue(true);

    render(
      <CommandPaletteProvider>
        <ContextualActionsHost actions={{ copyTxHash }} />
      </CommandPaletteProvider>,
    );

    // A non-empty selection must be left to the browser: the handler returns
    // early, so neither the callback runs nor is the event cancelled.
    const selectionSpy = jest
      .spyOn(window, 'getSelection')
      .mockReturnValue({ toString: () => 'highlighted text' } as unknown as Selection);

    const withSelection = fireEvent.keyDown(window, { key: 'c', metaKey: true });
    expect(copyTxHash).not.toHaveBeenCalled();
    expect(withSelection).toBe(true);

    // With nothing selected the contextual copy takes over and swallows the event.
    selectionSpy.mockReturnValue({ toString: () => '' } as unknown as Selection);

    const withoutSelection = fireEvent.keyDown(window, { key: 'c', metaKey: true });
    expect(copyTxHash).toHaveBeenCalledTimes(1);
    expect(withoutSelection).toBe(false);

    selectionSpy.mockRestore();
  });
});
