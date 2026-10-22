/**
 * Decide whether TypeORM `synchronize` may run (Savitura/Savitools#416).
 *
 * Synchronize alters the schema from entities and can drop columns/data.
 * It is only safe for local development and automated tests. Staging,
 * preview, and production must apply migrations instead (`RUN_MIGRATIONS`
 * or `npm run migration:run`).
 */
export function shouldSynchronizeSchema(nodeEnv: string | undefined): boolean {
  const env = (nodeEnv ?? '').toLowerCase();
  return env === 'development' || env === 'test';
}
