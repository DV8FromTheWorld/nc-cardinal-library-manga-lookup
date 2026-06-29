---
name: Next steps for slopshop template integration
description: Current state of slopshop-template work and remaining items before migrating manga-lookup
type: project
originSessionId: 22fcb362-c8a9-4fe9-b9c5-427c536e8c65
---

**Template work complete as of 2026-04-21.** Both API variants (worker + container), deploy pipelines, frontend patterns, and conventions are built and passing.

**Remaining before migrating manga-lookup:**

1. Test-deploy a container project from the template (validates /setup command, Railway deploy, service_url wiring, gateway proxy — all untested against real infra)
2. Migrate manga-lookup onto template conventions (apps/ → packages/, Fastify → Hono, @api aliases, deploy workflow)

**Optional/deferred:**

- Consolidate api-worker/api-container into a single api/ folder with layering (Austin wanted to defer until after seeing both side-by-side)

**What was built (summary):**

- api-container: Hono + Drizzle dual-driver + tsx production + railway.toml
- api-worker: D1 database + same module pattern
- Gateway: service binding (worker) vs external proxy (container) variants
- Deploy: pre-baked worker/container workflows, Railway action outputs service_url
- Frontend: ApiResult<T> (no-throw), structured ApiError to components, counter/items/home module split, store guidance, static assets
- Conventions: @api/@shared aliases, no .js extensions, no-parent-imports eslint rule, import sort groups
