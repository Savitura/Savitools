/**
 * Language switcher behaviour (Savitura/Savitools#693).
 *
 * The switcher rewrites the locale segment of the current pathname, so the
 * tests drive `usePathname`/`useRouter` directly and assert on what the router
 * is asked to navigate to.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LanguageSwitcher } from '@/components/language-switcher';

let currentLocale = 'en';
let currentPathname = '/en/test';
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => currentPathname,
}));

jest.mock('next-intl', () => ({
  useLocale: () => currentLocale,
  useTranslations: () => (key: string) => (key === 'language' ? 'Language' : key),
}));

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentLocale = 'en';
    currentPathname = '/en/test';
  });

  it('shows the active locale and collapsed menu a11y state', () => {
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Language');
    expect(trigger).toHaveTextContent('en');
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });

  it('opens and closes the locale menu from the trigger', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole('button');
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Español')).toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('English')).not.toBeInTheDocument();
  });

  it('replaces an existing locale prefix when switching to Spanish', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button', { name: /Español/i }));

    expect(replace).toHaveBeenCalledWith('/es/test');
    expect(screen.queryByText('Español')).not.toBeInTheDocument();
  });

  it('inserts a locale prefix when the pathname has none', async () => {
    currentPathname = '/docs';
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button', { name: /Español/i }));

    expect(replace).toHaveBeenCalledWith('/es/docs');
  });

  it('switches from Spanish back to English', async () => {
    currentLocale = 'es';
    currentPathname = '/es/docs/abc';
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    expect(screen.getByRole('button')).toHaveTextContent('es');

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button', { name: /English/i }));

    expect(replace).toHaveBeenCalledWith('/en/docs/abc');
  });

  it('closes the menu when the outside overlay is clicked', () => {
    const { container } = render(<LanguageSwitcher />);

    fireEvent.click(screen.getByRole('button'));
    const overlay = container.querySelector('.fixed.inset-0');
    expect(overlay).not.toBeNull();

    fireEvent.click(overlay as Element);

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Español')).not.toBeInTheDocument();
  });
});
