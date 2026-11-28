export type ClientErrorSeverity = 'error' | 'warn';

export interface ClientErrorOptions {
  area: string;
  action?: string;
  userMessage?: string;
  details?: Record<string, unknown>;
}

export interface ClientErrorReport {
  id: string;
  severity: ClientErrorSeverity;
  area: string;
  action?: string;
  message: string;
  userMessage?: string;
  details?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  timestamp: string;
}

export const CLIENT_ERROR_EVENT = 'savitools:client-error';

let reportSequence = 0;

function describeError(error: unknown): ClientErrorReport['error'] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }

  if (error && typeof error === 'object') {
    const value = error as { name?: unknown; message?: unknown };
    return {
      name: typeof value.name === 'string' ? value.name : 'Error',
      message:
        typeof value.message === 'string' ? value.message : 'An unexpected client error occurred.',
    };
  }

  return { name: 'Error', message: 'An unexpected client error occurred.' };
}

function publish(report: ClientErrorReport): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLIENT_ERROR_EVENT, { detail: report }));
}

function makeReport(
  severity: ClientErrorSeverity,
  error: unknown,
  options: ClientErrorOptions,
): ClientErrorReport {
  const described = describeError(error);
  reportSequence += 1;

  return {
    id: `${Date.now()}-${reportSequence}`,
    severity,
    area: options.area,
    ...(options.action ? { action: options.action } : {}),
    message: described?.message ?? 'An unexpected client error occurred.',
    ...(options.userMessage ? { userMessage: options.userMessage } : {}),
    ...(options.details ? { details: options.details } : {}),
    ...(described ? { error: described } : {}),
    timestamp: new Date().toISOString(),
  };
}

function log(severity: ClientErrorSeverity, report: ClientErrorReport): void {
  const label = `[client-${report.severity}:${report.area}${
    report.action ? `:${report.action}` : ''
  }]`;
  if (severity === 'warn') {
    console.warn(label, report);
  } else {
    console.error(label, report);
  }
}

export function reportClientError(error: unknown, options: ClientErrorOptions): ClientErrorReport {
  const report = makeReport('error', error, options);
  log('error', report);
  publish(report);
  return report;
}

export function reportClientWarning(
  message: string,
  options: ClientErrorOptions,
): ClientErrorReport {
  const report = makeReport('warn', message, options);
  log('warn', report);
  publish(report);
  return report;
}

export function subscribeToClientErrors(listener: (report: ClientErrorReport) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CLIENT_ERROR_EVENT, handleClientError as EventListener);

  function handleClientError(event: Event) {
    const report = (event as CustomEvent<ClientErrorReport>).detail;
    if (report) listener(report);
  }

  return () => {
    window.removeEventListener(CLIENT_ERROR_EVENT, handleClientError as EventListener);
  };
}
