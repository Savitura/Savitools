import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import * as api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  refreshSession: jest.fn(),
  getCurrentUser: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  verifyEmail: jest.fn(),
  connectFluxa: jest.fn(),
  beginPasskeyLogin: jest.fn(),
  verifyPasskeyLogin: jest.fn(),
}));

function AuthProbe() {
  const { user, loading, login, logout, refreshUser } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="user">{user ? user.email : 'guest'}</div>
      <button
        type="button"
        onClick={() => void login('test@example.com', 'password')}
      >
        Login
      </button>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
      <button type="button" onClick={() => void refreshUser()}>
        Refresh
      </button>
    </div>
  );
}

describe('AuthProvider & useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles successful session refresh on mount', async () => {
    (api.refreshSession as jest.Mock).mockResolvedValue({
      user: {
        id: '1',
        email: 'refreshed@example.com',
        emailVerified: true,
        fluxaTenantId: null,
      },
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('true');

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe(
        'refreshed@example.com',
      );
    });
  });

  it('falls back to getCurrentUser and handles token refresh failure gracefully', async () => {
    (api.refreshSession as jest.Mock).mockRejectedValue(
      new Error('no session'),
    );
    (api.getCurrentUser as jest.Mock).mockResolvedValue({
      user: {
        id: '2',
        email: 'current@example.com',
        emailVerified: true,
        fluxaTenantId: null,
      },
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('current@example.com');
    });
  });

  it('handles complete authentication failure on mount resulting in guest user', async () => {
    (api.refreshSession as jest.Mock).mockRejectedValue(
      new Error('no session'),
    );
    (api.getCurrentUser as jest.Mock).mockRejectedValue(
      new Error('unauthorized'),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user').textContent).toBe('guest');
    });
  });

  it('handles login and logout state transitions correctly', async () => {
    (api.refreshSession as jest.Mock).mockRejectedValue(
      new Error('no session'),
    );
    (api.getCurrentUser as jest.Mock).mockRejectedValue(
      new Error('unauthorized'),
    );
    (api.login as jest.Mock).mockResolvedValue({
      user: {
        id: '3',
        email: 'login@example.com',
        emailVerified: true,
        fluxaTenantId: null,
      },
    });
    (api.logout as jest.Mock).mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('user').textContent).toBe('guest');

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('login@example.com');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('guest');
    });
  });

  it('throws an error when useAuth is used outside of AuthProvider', () => {
    const ConsoleError = console.error;
    console.error = jest.fn();

    expect(() => render(<AuthProbe />)).toThrow(
      'useAuth must be used within AuthProvider',
    );

    console.error = ConsoleError;
  });
});
