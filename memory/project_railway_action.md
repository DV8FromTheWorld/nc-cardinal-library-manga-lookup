---
name: Railway deploy action details
description: Technical details of the slopshop-railway-deploy-action for continuing work on Railway deployment and slopshop template integration
type: project
originSessionId: bb54d657-333c-4ba1-93eb-f7fb712fa0df
---

**Repo**: `~/repos/slopshop-railway-deploy-action` → `github.com/Slopshop-Tools/slopshop-railway-deploy-action`

**What it does**: TypeScript GitHub Action that reads `railway-deploy.jsonc` from the consuming repo and idempotently converges Railway infrastructure via CLI. Creates projects, named databases, services, sets variables (supports `${{service.VAR}}` references), and deploys.

**Architecture**:

- `src/config.ts` — Zod schema with version validation, JSONC parsing via `jsonc-parser`
- `src/converge.ts` — Idempotent convergence (project → databases → services → variables → deploy)
- `src/railway.ts` — Typed wrapper around Railway CLI (`--json` output parsing)
- `src/index.ts` — Entrypoint (installs Railway CLI, loads config, runs converge)
- `scripts/generate-schema.ts` — Generates `dist/schema.json` from Zod at build time
- Build: `@vercel/ncc` bundles everything into `dist/index.js`
- CI: `.github/workflows/build.yml` auto-builds and commits `dist/` on source changes

**Config format** (`railway-deploy.jsonc` at repo root):

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/Slopshop-Tools/slopshop-railway-deploy-action/main/dist/schema.json",
  "version": 1,
  "project": { "name": "my-app" },
  "databases": [{ "name": "postgres", "type": "postgres" }],
  "services": [
    {
      "name": "api",
      "root": "apps/api",
      "variables": {
        "DATABASE_URL": "${{postgres.DATABASE_URL}}",
        "NODE_ENV": "production",
      },
    },
  ],
}
```

**Usage in workflows**:

```yaml
- uses: Slopshop-Tools/slopshop-railway-deploy-action@main
  with:
    token: ${{ secrets.RAILWAY_API_TOKEN }}
```

**Railway token**: Account-level token (not project-level) set as `RAILWAY_API_TOKEN` in GitHub org/repo secrets. Austin has this set up.

**Known unknowns**: The `--json` output shapes from Railway CLI are underdocumented. The jq/parsing in `railway.ts` may need adjustments when tested against real Railway infrastructure. The action has never been run against a real Railway account yet.

**Relationship to slopshop-template**: This action is the container-deployment counterpart to `wrangler deploy` for Workers. The slopshop-template needs to integrate it for projects that use Railway for their API backend.
