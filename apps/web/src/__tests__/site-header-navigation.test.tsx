/**
 * Component behaviour for the shared site header (Savitura/Savitools#693).
 *
 * The header wraps every route, so its navigation, auth states and theme
 * control are part of the app shell. Auth and theme are mocked at their
 * context boundary — the real providers need the API and `matchMedia`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SiteHeader } from '@/components/site-header';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

jest.mock('@/lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/theme-context', () => ({
  useTheme: jest.fn(),
}));

// The palette trigger owns its own dialog/provider tree; the header only needs
// to prove it renders the trigger.
jest.mock('@/components/command-palette', () => ({
  CommandPaletteTrigger: () => <button type="button">Command palette</button>,
}));

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseTheme = jest.mocked(useTheme);

const logout = jest.fn().mockResolvedValue(undefined);
const setMode = jest.fn();

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  mockedUseAuth.mockReturnValue({
    user: null,
    loading: false,
    login: jest.fn(),
    loginWithPasskey: jest.fn(),
    register: jest.fn(),
    logout,
    connectFluxaAccount: jest.fn(),
    verifyEmail: jest.fn(),
    refreshUser: jest.fn(),
    ...overrides,
  });
}

function mockTheme(mode: 'light' | 'dark' | 'system' = 'system') {
  mockedUseTheme.mockReturnValue({ mode, setMode });
}

describe('SiteHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
    mockTheme();
  });

  it('links the brand home and exposes the primary navigation destinations', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'SaviTools' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    expect(screen.getByRole('link', { name: 'API' })).toHaveAttribute('href', '/api');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByText('Stellar Developer Workstation')).toBeInTheDocument();
  });

  it('keeps the desktop navigation hidden on narrow viewports', () => {
    render(<SiteHeader />);

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('hidden', 'md:flex');
    // Links stay in the accessibility tree even while the nav is collapsed;
    // there is no separate mobile menu to toggle in this header.
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
  });

  it('renders the palette trigger and the theme control', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('button', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Color theme' })).toBeInTheDocument();
  });

  it('shows a loading hint while the session is being restored', () => {
    mockAuth({ loading: true });
    render(<SiteHeader />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
  });

  it('offers log in and register links to signed-out visitors', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('shows the signed-in email and logs the user out on request', async () => {
    const user = userEvent.setup();
    mockAuth({ user: { id: 'u1', email: 'dev@example.com', emailVerified: true } as never });
    render(<SiteHeader />);

    expect(screen.getByText('dev@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('reflects the current theme and forwards a new selection', () => {
    mockTheme('dark');
    render(<SiteHeader />);

    const select = screen.getByRole('combobox', { name: 'Color theme' }) as HTMLSelectElement;
    expect(select.value).toBe('dark');

    fireEvent.change(select, { target: { value: 'light' } });
    expect(setMode).toHaveBeenCalledWith('light');
  });
});
