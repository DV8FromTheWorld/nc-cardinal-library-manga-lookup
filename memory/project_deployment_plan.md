---
name: Deployment and storage migration plan
description: Decision to deploy frontend to Cloudflare Workers (slopshop), API to Railway with Postgres, using Drizzle ORM with SQLite locally
type: project
originSessionId: bb54d657-333c-4ba1-93eb-f7fb712fa0df
---

**Frontend**: Deploy to Cloudflare Workers via slopshop template (`<name>.slopshop.tools`).

**API**: Deploy to Railway (container + Postgres).

**Storage migration**: DONE — all three storage layers migrated to Drizzle/SQLite:

- Cache: 8 consumers moved from `.cache/*` files to `cache_entries` table
- Entity store: series/volumes/editions moved from `.data/entities.json` to relational tables
- Sessions: moved from in-memory `Map` to `sessions` table
- End-to-end validated: search works, data survives restarts, cached search runs in ~87ms

**Local dev**: SQLite via Drizzle at `.data/manga.db`. Postgres in production on Railway via `db/index.railway.ts`.

**Railway deployment**: Built `slopshop-railway-deploy-action` (TypeScript GitHub Action) at `Slopshop-Tools/slopshop-railway-deploy-action`. Reads `railway-deploy.jsonc`, idempotently converges Railway infrastructure via CLI. 25 tests. Published and live.

**Next steps**: Integrate container support into slopshop-template, then migrate this project to follow the template's conventions. Chicken-and-egg — build template support using this project as the reference implementation.

**How to apply:** All storage-related changes should use Drizzle and avoid Postgres-specific features to maintain SQLite compatibility in dev.
