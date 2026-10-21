# Authoritative Source Tree and Legacy Root Modules

## Authoritative Source Tree

The **SaviTools** repository is a monorepo managed by Turborepo. The authoritative source code for the application lives exclusively under the pps/ directory:

- pps/web – a **Next.js 15** frontend application. It contains all UI components, pages, and client-side logic.
- pps/api – a **NestJS** backend application (Fastify adapter). It hosts the REST API, GraphQL schema, background workers, and all server-side business logic.

All build, test, and CI workflows target these two sub-projects. The root of the repository contains only configuration, tooling, documentation, and shared infrastructure files (e.g., 	urbo.json, Docker compose files, workspace scripts). There are **no source modules** at the repository root that are compiled or deployed.

## Retired Legacy Root Modules

Historically the project shipped a **stand-alone src/ debugger library** at the repository root. It provided SEP-10 / SEP-24 debugging utilities used by early versions of SaviTools. As of the **vX.Y.0** release (see CHANGELOG.md entry  Legacy src/ debugger library), this library and its associated test suite were **removed** and the functionality migrated into the proper NestJS modules under pps/api/src/modules.

The removal was performed to:

- Consolidate all server-side code under pps/api.
- Avoid duplicated code and configuration.
- Simplify the monorepo layout and CI pipelines.

No references to the old src/ directory remain in the current codebase, CI workflows, or package scripts. The repository root now contains only build-time tooling and documentation.

## Documentation References

- The monorepo layout is illustrated in the **README** under the *Architecture* section.
- For a concise view of the authoritative source tree, see this document.
- The legacy removal is documented in CHANGELOG.md (see entry for Legacy src/ debugger library).
