# API Package Conventions

## Module Structure

Features are organized into modules under `src/modules/`. Each module can contain:

```
src/modules/{feature}/
├── db/
│   ├── schema.ts    # Drizzle table definitions
│   └── types.ts     # Inferred row/insert types
├── tests/
│   └── routes.test.ts
├── routes.ts        # Fastify route handlers (future)
└── services/        # Business logic (future)
```

## Tests

**Tests belong in their module's `tests/` folder**, not in a top-level `src/tests/` directory.

- `src/modules/cache/tests/routes.test.ts` — not `src/tests/routes/cache.test.ts`
- `src/modules/patron/tests/routes.test.ts` — not `src/tests/routes/patron.test.ts`

The only exception is `src/tests/setup.ts` (shared test helper) and tests for code that isn't in a module yet (e.g., `src/tests/routes/health.test.ts` for the health check in `index.ts`).

## Database Schema

Each module owns its own Drizzle schema in `db/schema.ts`. The central `src/db/schema.ts` re-exports all module schemas — don't define tables there directly.

Drizzle config (`drizzle.config.ts`) uses a glob: `./src/modules/*/db/schema.ts`.

## Running Tests

```bash
pnpm test        # Watch mode
pnpm test:run    # Single run
```
