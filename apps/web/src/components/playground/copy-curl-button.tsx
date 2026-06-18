'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyCurlButtonProps {
  method: string;
  path: string;
  queryParams?: Record<string, string>;
  body?: string;
  headers?: Record<string, string>;
  useAuth: boolean;
  provider: string;
  className?: string;
}

export function CopyCurlButton({
  method,
  path,
  queryParams,
  body,
  headers,
  useAuth,
  provider,
  className,
}: CopyCurlButtonProps) {
  const [copied, setCopied] = useState(false);

  const buildCurl = (): string => {
    const baseUrl =
      provider === 'fluxa'
        ? (process.env.NEXT_PUBLIC_FLUXA_API_URL ?? 'https://api.fluxa.io')
        : (process.env.NEXT_PUBLIC_CROWDPAY_API_URL ?? 'https://api.crowdpay.io');

    const url = new URL(path, baseUrl);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value);
      }
    }

    const parts: string[] = ['curl', '-s'];

    parts.push('-X', method);

    parts.push(`'${url.toString()}'`);

    if (useAuth) {
      parts.push("-H 'Authorization: Bearer $API_KEY'");
    }

    parts.push("-H 'Accept: application/json'");

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() !== 'authorization') {
          parts.push(`-H '${key}: ${value}'`);
        }
      }
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
      parts.push("-H 'Content-Type: application/json'");
      parts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
    }

    return parts.join(' \\\n  ');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildCurl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors',
        className,
      )}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied!' : 'Copy as cURL'}
    </button>
  );
}
