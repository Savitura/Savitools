/**
 * The webhook HTTP methods this UI can send.
 *
 * The API validates the same set, but saved history is just JSON and may carry
 * an older or hand-edited value. Keep the union in one place so state, the
 * select control and the request wrapper cannot drift apart.
 */
export const WEBHOOK_METHODS = ['POST', 'PUT', 'PATCH', 'GET'] as const;

export type WebhookMethod = (typeof WEBHOOK_METHODS)[number];

export const DEFAULT_WEBHOOK_METHOD: WebhookMethod = 'POST';

const SUPPORTED = new Set<string>(WEBHOOK_METHODS);

export function isWebhookMethod(value: unknown): value is WebhookMethod {
  return typeof value === 'string' && SUPPORTED.has(value.toUpperCase());
}

export function parseWebhookMethod(value: unknown): WebhookMethod {
  return isWebhookMethod(value) ? (value.toUpperCase() as WebhookMethod) : DEFAULT_WEBHOOK_METHOD;
}

export interface RestoredWebhookMethod {
  method: WebhookMethod;
  /** User-facing notice when a saved value had to be replaced. */
  warning: string | null;
}

/**
 * Restore a method from saved history without trusting it. Missing values are
 * normal (older entries did not record one); any other unsupported value falls
 * back to POST and tells the user why.
 */
export function restoreWebhookMethod(value: unknown): RestoredWebhookMethod {
  if (value === undefined || value === null || value === '') {
    return { method: DEFAULT_WEBHOOK_METHOD, warning: null };
  }

  if (isWebhookMethod(value)) {
    return { method: value.toUpperCase() as WebhookMethod, warning: null };
  }

  return {
    method: DEFAULT_WEBHOOK_METHOD,
    warning: `Saved webhook method "${String(
      value,
    )}" is not supported. Using ${DEFAULT_WEBHOOK_METHOD} instead.`,
  };
}
