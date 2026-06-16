'use client';

import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const { user, connectFluxaAccount } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFluxaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!apiKey.trim()) {
      setError('Fluxa API key is required.');
      return;
    }

    setSubmitting(true);

    try {
      await connectFluxaAccount(apiKey.trim());
      setApiKey('');
      setMessage('Fluxa account connected successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Fluxa account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-xl font-semibold mb-2">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Manage your SaviTools account and Savitura ecosystem connections.
      </p>

      <section className="border border-border rounded-lg p-5 space-y-4">
        <div>
          <h2 className="text-sm font-medium">Account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {user ? user.email : 'You are browsing as a guest.'}
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <h2 className="text-sm font-medium mb-1">Connect Fluxa account</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Link your Fluxa builder account to use your API keys inside SaviTools tools.
          </p>

          {user?.fluxaTenantId ? (
            <p className="text-sm text-muted-foreground mb-4">
              Connected tenant: <span className="font-mono">{user.fluxaTenantId}</span>
            </p>
          ) : null}

          <form onSubmit={handleFluxaSubmit} className="space-y-3">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Fluxa API key"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

            <button
              type="submit"
              disabled={submitting || !user}
              className="rounded-md border border-border px-3 py-2 text-sm hover:border-foreground/30 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Connecting…' : 'Connect Fluxa account'}
            </button>

            {!user ? (
              <p className="text-xs text-muted-foreground">
                Log in or register before connecting a Fluxa account.
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}
