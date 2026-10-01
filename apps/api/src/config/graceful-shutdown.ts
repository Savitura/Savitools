import { INestApplication } from '@nestjs/common';

/**
 * Registers the process-level shutdown listeners that drive every
 * `OnModuleDestroy` / `OnApplicationShutdown` hook in the app.
 *
 * Nest only installs its SIGTERM/SIGINT handlers when
 * `INestApplication#enableShutdownHooks()` is called. Without the call the hooks
 * are simply never reached, so a container stop skips all cleanup: SSE streams
 * stay open, the monitor leader lease is held until it expires, the BullMQ
 * worker is never closed and in-flight jobs stay locked until their lock TTL.
 *
 * Kept in its own module so the behaviour is testable without booting the full
 * application from `main.ts`.
 *
 * @see apps/api/src/config/graceful-shutdown.spec.ts
 */
export function enableGracefulShutdown(app: INestApplication): void {
  app.enableShutdownHooks();
}
