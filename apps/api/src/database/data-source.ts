import "reflect-metadata";
import { DataSource } from "typeorm";
import { ALL_ENTITIES, ALL_MIGRATIONS } from "./database.registry";

/**
 * CLI data source used by `migration:run` / `migration:revert`.
 *
 * Entity and migration lists come from the canonical registry that the NestJS
 * runtime also uses, so the two entry points can no longer drift apart: the
 * lists are imported rather than re-declared here.
 */
export default new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: ALL_ENTITIES,
  migrations: ALL_MIGRATIONS,
  synchronize: false,
});
