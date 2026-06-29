---
name: Database architecture details
description: Technical details of the Drizzle ORM setup, module structure, and dual-driver architecture for continuing DB work
type: project
originSessionId: bb54d657-333c-4ba1-93eb-f7fb712fa0df
---

**Drizzle setup**: SQLite locally (`better-sqlite3`), Postgres in prod (`node-postgres`). Driver selected dynamically in `db/index.ts` based on `NODE_ENV`.

**DB files**:

- `apps/api/src/db/index.ts` — Dynamic import of local or railway driver
- `apps/api/src/db/index.local.ts` — SQLite driver, auto-migrates on startup
- `apps/api/src/db/index.railway.ts` — Postgres driver via `DATABASE_URL`
- `apps/api/src/db/schema.ts` — Re-exports all module schemas
- `apps/api/src/db/types.ts` — Re-exports all module types
- `apps/api/drizzle.config.ts` — Dual dialect config (sqlite local, postgresql prod)

**Module structure** (each module owns its DB schema + types + tests):

```
modules/
├── cache/       → cache_entries (namespace/key/version PK, TTL)
├── series/      → series, series_external_ids, series_relations, title_index
├── volumes/     → volumes (FK to series)
├── editions/    → editions, edition_volumes join table (FK to volumes)
├── auth/        → sessions
├── account/     → no DB (live data from NC Cardinal)
├── search/      → no DB
├── libraries/   → no DB
```

**Cache service** (`modules/cache/service.ts`): 11 functions for get/set/clear with TTL and versioning. Namespace constants in `modules/cache/constants.ts` (`CACHE_NS.*`, typed as `CacheNamespace`).

**Entity store** (`entities/store.ts`): Rewritten to use Drizzle queries. Reconstructs API-layer types (with `volumeIds[]`, `editionIds[]` arrays) from normalized DB tables + join tables on read. Decomposes them on write.

**Session store** (`scripts/patron-client.ts`): `storeSession`/`getSession`/`deleteSession` now query the `sessions` table directly.

**Tests**: 106 total across 12 files. Test DB helper at `tests/db.ts` creates in-memory SQLite via `createTestDb()`. Tests mock `db/index.js` to inject the test DB.

**Migration files**: `apps/api/drizzle/` contains generated SQL migrations. Auto-applied on startup for local dev. For Railway prod, migrations run via `drizzle-kit migrate` in the pre-deploy command.

**Data file**: `.data/manga.db` (gitignored). Created on first API start.
