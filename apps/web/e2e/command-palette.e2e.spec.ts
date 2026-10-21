import { test, expect } from '@playwright/test';

/**
 * End-to-end keyboard navigation and focus management tests for the Command Palette.
 *
 * Verifies accessibility contracts in a real browser environment against the rendered
 * web application on public routes without requiring an authenticated user session:
 * - Shortcut opening (Cmd+K / Ctrl+K) and auto-focusing the combobox
 * - ArrowDown / ArrowUp item navigation and active descendant synchronization
 * - List wrap-around navigation between first and last options
 * - Enter activation executing navigation with observable route changes
 * - Escape key dismissal
 * - Focus restoration to the invoking trigger element (via shortcut and via click)
 * - Tab / Shift+Tab focus containment within the open dialog
 */

test.describe('Command Palette - Keyboard Navigation & Focus', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to public home route where SiteHeader and CommandPalette are mounted
    await page.goto('/');

    // Ensure the page has loaded and the trigger button is attached and visible
    const trigger = page.getByRole('button', { name: /open command palette/i });
    await expect(
      trigger,
      'Expected header trigger button to be visible on public home route',
    ).toBeVisible();
  });

  test('should open command palette using keyboard shortcut (Cmd+K / Ctrl+K) and focus search input', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    const input = page.getByRole('combobox');

    // Dialog must not be visible before shortcut
    await expect(
      dialog,
      'Command palette dialog must not be visible before triggering shortcut',
    ).not.toBeVisible();

    // Trigger keyboard shortcut
    await page.keyboard.press('ControlOrMeta+k');

    // Dialog must open as modal
    await expect(
      dialog,
      'Command palette dialog must be visible after pressing Cmd+K / Ctrl+K',
    ).toBeVisible();
    await expect(
      dialog,
      'Command palette dialog must have aria-modal="true"',
    ).toHaveAttribute('aria-modal', 'true');

    // Search input must be automatically focused
    await expect(
      input,
      'Combobox search input must receive focus immediately when palette opens',
    ).toBeFocused();
    await expect(
      input,
      'Combobox input must have aria-expanded="true"',
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      input,
      'Combobox input must have aria-haspopup="listbox"',
    ).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(
      input,
      'Combobox input must have aria-autocomplete="list"',
    ).toHaveAttribute('aria-autocomplete', 'list');
  });

  test('should navigate items with ArrowDown and ArrowUp updating selection and aria-activedescendant', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    const input = page.getByRole('combobox');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog, 'Dialog must be visible').toBeVisible();
    await expect(input, 'Input must be focused').toBeFocused();

    const options = dialog.getByRole('option');
    await expect(options.first(), 'First option should be rendered').toBeVisible();
    const count = await options.count();
    expect(count, 'Palette must contain at least 2 command options').toBeGreaterThan(1);

    const firstOption = options.nth(0);
    const secondOption = options.nth(1);
    const thirdOption = options.nth(2);

    const firstId = await firstOption.getAttribute('id');
    const secondId = await secondOption.getAttribute('id');
    const thirdId = await thirdOption.getAttribute('id');

    expect(firstId, 'First option must have an element id').toBeTruthy();
    expect(secondId, 'Second option must have an element id').toBeTruthy();
    expect(thirdId, 'Third option must have an element id').toBeTruthy();

    const expectedFirstId = firstId ?? '';
    const expectedSecondId = secondId ?? '';
    const expectedThirdId = thirdId ?? '';

    // Initial state: first option is selected
    await expect(
      input,
      'Combobox aria-activedescendant must initially point to first option',
    ).toHaveAttribute('aria-activedescendant', expectedFirstId);
    await expect(
      firstOption,
      'First option must be marked aria-selected="true" initially',
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      secondOption,
      'Second option must not be selected initially',
    ).toHaveAttribute('aria-selected', 'false');

    // Press ArrowDown to advance to second item
    await page.keyboard.press('ArrowDown');
    await expect(
      input,
      'Combobox aria-activedescendant must point to second option after ArrowDown',
    ).toHaveAttribute('aria-activedescendant', expectedSecondId);
    await expect(
      secondOption,
      'Second option must be selected after ArrowDown',
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      firstOption,
      'First option must be deselected after ArrowDown',
    ).toHaveAttribute('aria-selected', 'false');

    // Press ArrowDown to advance to third item
    await page.keyboard.press('ArrowDown');
    await expect(
      input,
      'Combobox aria-activedescendant must point to third option after second ArrowDown',
    ).toHaveAttribute('aria-activedescendant', expectedThirdId);
    await expect(
      thirdOption,
      'Third option must be selected after second ArrowDown',
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      secondOption,
      'Second option must be deselected after moving to third item',
    ).toHaveAttribute('aria-selected', 'false');

    // Press ArrowUp to return to second item
    await page.keyboard.press('ArrowUp');
    await expect(
      input,
      'Combobox aria-activedescendant must return to second option after ArrowUp',
    ).toHaveAttribute('aria-activedescendant', expectedSecondId);
    await expect(
      secondOption,
      'Second option must be selected after ArrowUp',
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      thirdOption,
      'Third option must be deselected after moving up',
    ).toHaveAttribute('aria-selected', 'false');

    // Press ArrowUp to return to first item
    await page.keyboard.press('ArrowUp');
    await expect(
      input,
      'Combobox aria-activedescendant must return to first option after second ArrowUp',
    ).toHaveAttribute('aria-activedescendant', expectedFirstId);
    await expect(
      firstOption,
      'First option must be selected after returning to top',
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('should wrap navigation around between the first and last options', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    const input = page.getByRole('combobox');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog, 'Dialog must be visible').toBeVisible();

    const options = dialog.getByRole('option');
    const count = await options.count();
    expect(count, 'Palette must contain at least 2 options for wrap test').toBeGreaterThan(1);

    const firstOption = options.nth(0);
    const lastOption = options.nth(count - 1);

    const firstId = await firstOption.getAttribute('id');
    const lastId = await lastOption.getAttribute('id');
    const expectedFirstId = firstId ?? '';
    const expectedLastId = lastId ?? '';

    // Initially at top item
    await expect(
      input,
      'Initial aria-activedescendant should be top option',
    ).toHaveAttribute('aria-activedescendant', expectedFirstId);

    // Press ArrowUp at the top to wrap to the last option
    await page.keyboard.press('ArrowUp');
    await expect(
      input,
      'ArrowUp from first option must wrap aria-activedescendant to last option',
    ).toHaveAttribute('aria-activedescendant', expectedLastId);
    await expect(
      lastOption,
      'Last option must be marked aria-selected="true" after wrap-around',
    ).toHaveAttribute('aria-selected', 'true');

    // Press ArrowDown at the bottom to wrap back to the first option
    await page.keyboard.press('ArrowDown');
    await expect(
      input,
      'ArrowDown from last option must wrap aria-activedescendant back to first option',
    ).toHaveAttribute('aria-activedescendant', expectedFirstId);
    await expect(
      firstOption,
      'First option must be marked aria-selected="true" after wrap-around',
    ).toHaveAttribute('aria-selected', 'true');
  });

  test('should activate selected item on Enter and navigate to the target route', async ({
    page,
  }) => {
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    const input = page.getByRole('combobox');

    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog, 'Dialog must open').toBeVisible();
    await expect(input, 'Input must be focused').toBeFocused();

    // Query for composer tool
    await input.fill('composer');

    const composerOption = dialog.getByRole('option', { name: /Visual Transaction/i });
    await expect(
      composerOption,
      'Filtered option for composer tool should be visible',
    ).toBeVisible();
    await expect(
      composerOption,
      'Filtered option should be selected by default',
    ).toHaveAttribute('aria-selected', 'true');

    // Press Enter to activate the selected item
    await page.keyboard.press('Enter');

    // Dialog must be closed
    await expect(
      dialog,
      'Command palette dialog must close after activating command on Enter',
    ).not.toBeVisible();

    // URL must change to reflect the destination route (/composer or /<locale>/composer)
    await expect(
      page,
      'Page must navigate to /composer route upon activating the composer command',
    ).toHaveURL(/.*\/composer.*/);
  });

  test('should dismiss command palette on Escape key', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });

    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog, 'Dialog must be visible before Escape').toBeVisible();

    // Dismiss with Escape
    await page.keyboard.press('Escape');

    // Dialog must be removed/hidden
    await expect(
      dialog,
      'Command palette dialog must be dismissed after pressing Escape',
    ).not.toBeVisible();
  });

  test('should restore focus to the trigger element after Escape dismissal when opened via shortcut', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: /open command palette/i });
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    const input = page.getByRole('combobox');

    // Focus the trigger element explicitly
    await trigger.focus();
    await expect(
      trigger,
      'Header trigger button must be focused before opening palette',
    ).toBeFocused();

    // Open palette via keyboard shortcut
    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog, 'Dialog must open').toBeVisible();
    await expect(input, 'Input must receive focus').toBeFocused();

    // Dismiss with Escape
    await page.keyboard.press('Escape');
    await expect(dialog, 'Dialog must close on Escape').not.toBeVisible();

    // Focus must be returned to the trigger button
    await expect(
      trigger,
      'Focus must return to the trigger element that was active prior to opening',
    ).toBeFocused();
  });

  test('should restore focus to the trigger element after Escape dismissal when opened via click', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: /open command palette/i });
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    const input = page.getByRole('combobox');

    // Open palette via trigger click
    await trigger.click();
    await expect(dialog, 'Dialog must open on trigger click').toBeVisible();
    await expect(input, 'Combobox search input must receive focus').toBeFocused();

    // Dismiss with Escape
    await page.keyboard.press('Escape');
    await expect(dialog, 'Dialog must close on Escape').not.toBeVisible();

    // Focus must be returned to the trigger button
    await expect(
      trigger,
      'Focus must return to the trigger button that was clicked to open the palette',
    ).toBeFocused();
  });

  test('should trap focus inside the dialog when Tab or Shift+Tab is pressed', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', { name: /open command palette/i });
    const dialog = page.getByRole('dialog', { name: 'Command Palette' });
    const input = page.getByRole('combobox');

    await trigger.focus();
    await page.keyboard.press('ControlOrMeta+k');
    await expect(dialog, 'Dialog must open').toBeVisible();
    await expect(input, 'Input must receive focus').toBeFocused();

    // Press Tab - focus trap must prevent focus from escaping to background elements
    await page.keyboard.press('Tab');
    await expect(
      input,
      'Pressing Tab inside the open dialog must keep focus trapped on the combobox',
    ).toBeFocused();
    await expect(
      dialog.locator(':focus'),
      'Focused element on Tab must remain inside the dialog container',
    ).toBeVisible();

    // Press Shift+Tab - focus trap must maintain focus inside dialog
    await page.keyboard.press('Shift+Tab');
    await expect(
      input,
      'Pressing Shift+Tab inside the open dialog must keep focus trapped on the combobox',
    ).toBeFocused();
    await expect(
      dialog.locator(':focus'),
      'Focused element on Shift+Tab must remain inside the dialog container',
    ).toBeVisible();

    // Background trigger must never receive focus while dialog is open
    await expect(
      trigger,
      'Background trigger must not receive focus while dialog is open',
    ).not.toBeFocused();
  });
});
