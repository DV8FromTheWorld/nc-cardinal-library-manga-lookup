# Project Context Snapshot: nc-cardinal-manga

## What Was Built

A **Turborepo monorepo** with pnpm workspaces containing:

```
nc-cardinal-manga/
├── apps/
│   ├── web/          # React frontend (rspack)
│   └── api/          # Fastify API with Zod validation
├── packages/
│   └── shared/       # Shared Zod schemas & types
├── turbo.json        # Task orchestration config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .prettierrc
├── .env / .env.example
└── .gitignore
```

---

## Key Decisions Made

| Topic | Decision | Reasoning |
|-------|----------|-----------|
| **Monorepo tool** | Turborepo + pnpm | Automatic build order, caching, simpler than Nx |
| **Environment vars** | env-cmd (rejected direnv) | Self-contained in npm; no shell setup for new devs |
| **API framework** | Fastify (not Hono/Express) | Cleaner route code with Zod, first-class TypeScript |
| **Validation** | Zod + fastify-type-provider-zod | Typed request bodies after validation |
| **Bundler** | rspack | User's existing choice |
| **Formatting** | Prettier (root-level) | Single config for entire monorepo |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo 2.x + pnpm 9.x |
| Frontend | React 18 + rspack |
| Backend | Fastify 5 + fastify-type-provider-zod |
| Validation | Zod 3 |
| Shared | TypeScript package with Zod schemas |
| Formatting | Prettier 3 |

---

## Commands

```bash
pnpm dev              # Run all dev servers
pnpm build            # Build all packages (respects dependency order)
pnpm typecheck        # TypeScript check
pnpm format           # Prettier format
pnpm format:check     # Check formatting (CI)

# Filter to specific app
pnpm dev --filter=@repo/web
pnpm dev --filter=@repo/api
```

---

## API Details

- Runs on port **3001**
- Has Zod validation with automatic error responses
- Example routes in `apps/api/src/routes/users.ts`
- Uses `@repo/shared` for Zod schemas (e.g., `UserSchema`)

**Endpoints:**
- `GET /health` - Health check
- `GET /users` - List users
- `GET /users/:id` - Get by ID (validates UUID)
- `POST /users` - Create user (validates email + name)

---

## Web App Details

- Runs on port **3000**
- Uses `HtmlRspackPlugin` (not deprecated `builtins.html`)
- `DefinePlugin` configured for `process.env.PUBLIC_API_URL`

---

## Prettier Config

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## What's NOT Done Yet

- Actual app features/pages (unknown purpose - name suggests manga-related)
- Database integration
- Authentication
- Tests
- ESLint (only Prettier added)
- CI/CD
