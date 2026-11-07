/**
 * Horizon network detection with an explicit deadline and a caller-owned
 * cancellation path.
 *
 * The selector used to call `fetch()` directly, so a stalled Horizon root
 * request could leave profile verification pending forever. Every request now
 * aborts on its own timeout and on the caller's signal, and failures are typed
 * so the UI can show a recoverable message instead of a silent hang.
 */
export const NETWORK_DETECTION_TIMEOUT_MS = 8_000;

export type NetworkDetectionErrorCode =
  'TIMEOUT' | 'CANCELLED' | 'HTTP' | 'INVALID_RESPONSE' | 'NETWORK';

export class NetworkDetectionError extends Error {
  readonly code: NetworkDetectionErrorCode;
  readonly retryable: boolean;

  constructor(code: NetworkDetectionErrorCode, message: string) {
    super(message);
    this.name = 'NetworkDetectionError';
    this.code = code;
    this.retryable = code === 'TIMEOUT' || code === 'HTTP' || code === 'NETWORK';
  }
}

export interface NetworkDetectionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface NetworkProfileVerification {
  valid: boolean;
  actualPassphrase?: string;
  mismatch?: boolean;
  error?: string;
}

function sanitizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Read `network_passphrase` from a Horizon root endpoint.
 *
 * The controller belongs to this call: aborting `options.signal` cancels the
 * request, and a late response from a superseded selection is rejected rather
 * than delivered to the caller.
 */
export async function fetchNetworkPassphrase(
  horizonUrl: string,
  options: NetworkDetectionOptions = {},
): Promise<string> {
  const baseUrl = sanitizeUrl(horizonUrl);
  if (!baseUrl) {
    throw new NetworkDetectionError('NETWORK', 'Enter a Horizon URL before detecting the network.');
  }

  const timeoutMs = options.timeoutMs ?? NETWORK_DETECTION_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const externalSignal = options.signal;
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(`${baseUrl}/`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new NetworkDetectionError(
        'HTTP',
        `Horizon at ${baseUrl} returned HTTP ${response.status}. Check the URL and try again.`,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new NetworkDetectionError(
        'INVALID_RESPONSE',
        `Horizon at ${baseUrl} did not return valid JSON. Check the URL and try again.`,
      );
    }

    const passphrase =
      typeof data === 'object' && data !== null
        ? (data as { network_passphrase?: unknown }).network_passphrase
        : undefined;

    if (!passphrase || typeof passphrase !== 'string') {
      throw new NetworkDetectionError(
        'INVALID_RESPONSE',
        `Horizon at ${baseUrl} did not return a network passphrase. Check the URL and try again.`,
      );
    }

    return passphrase;
  } catch (error) {
    if (timedOut) {
      throw new NetworkDetectionError(
        'TIMEOUT',
        `Network detection timed out after ${timeoutMs}ms. Check the Horizon URL and try again.`,
      );
    }

    if (externalSignal?.aborted) {
      throw new NetworkDetectionError('CANCELLED', 'Network detection was cancelled.');
    }

    if (error instanceof NetworkDetectionError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new NetworkDetectionError('CANCELLED', 'Network detection was cancelled.');
    }

    throw new NetworkDetectionError(
      'NETWORK',
      `Could not reach Horizon at ${baseUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Compare a profile's declared passphrase with what Horizon reports. */
export async function verifyNetworkProfile(
  profile: { horizonUrl: string; networkPassphrase: string },
  options: NetworkDetectionOptions = {},
): Promise<NetworkProfileVerification> {
  try {
    const actualPassphrase = await fetchNetworkPassphrase(profile.horizonUrl, options);
    return {
      valid: true,
      actualPassphrase,
      mismatch: actualPassphrase !== profile.networkPassphrase,
    };
  } catch (error) {
    if (error instanceof NetworkDetectionError && error.code === 'CANCELLED') {
      throw error;
    }
    return {
      valid: false,
      mismatch: true,
      error:
        error instanceof NetworkDetectionError
          ? error.message
          : 'Could not verify the network passphrase for this Horizon URL.',
    };
  }
}
