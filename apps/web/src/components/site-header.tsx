'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export function SiteHeader() {
  const { user, loading, logout } = useAuth();

  return (
    <div className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
            SaviTools
          </Link>
          <span className="hidden sm:inline text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
            Stellar Developer Workstation
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            Settings
          </Link>
          {loading ? (
            <span className="text-muted-foreground text-xs">Loading…</span>
          ) : user ? (
            <>
              <span className="text-muted-foreground hidden sm:inline">{user.email}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                Log in
              </Link>
              <Link
                href="/register"
                className="border border-border rounded px-2.5 py-1 hover:border-foreground/30 transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
