'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type AsyncStatusTone = 'loading' | 'success' | 'error';

export interface AsyncStatusAnnouncement {
  /** Spoken urgency: loading/success are polite, errors are assertive. */
  tone: AsyncStatusTone;
  message: string;
  /**
   * Stable identity for the event being announced. Polling that produces the
   * same key is ignored even if other state on the page changed. Defaults to
   * `tone:message`, which also suppresses repeated identical updates.
   */
  key?: string;
}

export interface AsyncStatusRegions {
  politeMessage: string;
  assertiveMessage: string;
}

/**
 * Track one asynchronous status and expose two live-region strings.
 *
 * A status is announced at most once per unique `key`. That matters for tools
 * that poll: every response can re-render the component, but a stable key means
 * the screen reader hears the loading/success/failure state only once.
 */
export function useAsyncAnnouncement(
  status: AsyncStatusAnnouncement | null | undefined,
): AsyncStatusRegions {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const lastAnnouncement = useRef<string | null>(null);

  const tone = status?.tone;
  const message = status?.message;
  const key = status?.key;

  useEffect(() => {
    if (!tone || !message) return;

    const identity = key ?? `${tone}:${message}`;
    if (lastAnnouncement.current === identity) return;
    lastAnnouncement.current = identity;

    if (tone === 'error') {
      // Move the message out of the polite region so it cannot be read twice.
      setPoliteMessage('');
      setAssertiveMessage(message);
    } else {
      setAssertiveMessage('');
      setPoliteMessage(message);
    }
  }, [key, message, tone]);

  return { politeMessage, assertiveMessage };
}

/**
 * Renders the shared accessible status pattern:
 * - `role="status"` + `aria-live="polite"` for loading and success;
 * - `role="alert"` + `aria-live="assertive"` for failures.
 *
 * The regions stay mounted (empty) so assistive technology observes the text
 * change instead of a newly inserted node.
 */
export function AsyncStatusAnnouncer({
  status,
  className,
}: {
  status?: AsyncStatusAnnouncement | null;
  className?: string;
}) {
  const { politeMessage, assertiveMessage } = useAsyncAnnouncement(status);

  return (
    <div className={cn('sr-only', className)}>
      <div role="status" aria-live="polite" aria-atomic="true" data-testid="async-status-polite">
        {politeMessage}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="async-status-assertive"
      >
        {assertiveMessage}
      </div>
    </div>
  );
}
