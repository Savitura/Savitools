import Link from 'next/link';

export function SiteHeader() {
  return (
    <div className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-mono text-sm font-semibold tracking-tight hover:opacity-80">
            SaviTools
          </Link>
          <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
            Stellar Developer Workstation
          </span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <Link href="/api" className="hover:text-foreground transition-colors">
            API
          </Link>
        </nav>
      </div>
    </div>
  );
}
