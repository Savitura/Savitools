'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface XdrPreviewProps {
  xdr: string | null;
  loading?: boolean;
}

export function XdrPreview({ xdr, loading }: XdrPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!xdr) return;
    await navigator.clipboard.writeText(xdr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-card/60 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full transition-colors ${xdr ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            XDR Envelope
          </span>
          {loading && (
            <span className="text-[10px] text-amber-400 animate-pulse">building…</span>
          )}
        </div>
        <button
          id="copy-xdr-btn"
          onClick={handleCopy}
          disabled={!xdr}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium border border-border/60 bg-card hover:bg-card/80 disabled:opacity-30 transition-all"
        >
          {copied ? (
            <><Check className="h-3 w-3 text-emerald-400" /> Copied</>
          ) : (
            <><Copy className="h-3 w-3" /> Copy XDR</>
          )}
        </button>
      </div>

      <div className="relative bg-black/20 min-h-[80px] max-h-[140px] overflow-auto p-4">
        {xdr ? (
          <pre className="text-[10px] font-mono text-emerald-300/80 whitespace-pre-wrap break-all leading-relaxed">
            {xdr}
          </pre>
        ) : (
          <p className="text-[10px] text-muted-foreground/40 font-mono italic">
            XDR will appear here as you build the transaction…
          </p>
        )}
      </div>
    </div>
  );
}
