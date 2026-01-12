# Project Context Snapshot: nc-cardinal-manga

## What Was Built

A **Turborepo monorepo** with pnpm workspaces containing:

```
nc-cardinal-manga/
├── apps/
│   ├── app/          # React + React Native shared code (rspack for web)
│   ├── native/       # React Native entry point
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
| **File extensions** | `.tsx` for all TypeScript | Consistency, allows adding JSX without rename |
| **Module pattern** | Vertical slices | Code sharing between web and native |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo 2.x + pnpm 9.x |
| Frontend | React 18 + rspack + react-router-dom |
| Native | React Native + @react-navigation |
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
pnpm dev --filter=@repo/app
pnpm dev --filter=@repo/api
```

---

## API Details

- Runs on port **3001**
- Has Zod validation with automatic error responses
- Main routes in `apps/api/src/routes/manga.ts`
- Uses `@repo/shared` for Zod schemas

**Endpoints:**
- `GET /health` - Health check
- `GET /manga/search?q={query}` - Search manga
- `GET /manga/series/:slug` - Get series details
- `GET /manga/books/:isbn` - Get book details

---

## Web App Details

- Runs on port **3000**
- Uses `HtmlRspackPlugin` (not deprecated `builtins.html`)
- `DefinePlugin` configured for `process.env.PUBLIC_API_URL`
- Uses react-router-dom for routing

---

## Frontend Architecture

The frontend (`apps/app/`) uses a modules-based architecture:

```
apps/app/src/
├── entrypoints/           # Platform entry points
│   ├── web/App.tsx
│   └── native/App.tsx
├── modules/               # Feature slices
│   ├── routing/           # Shared routes + platform routers
│   ├── search/            # Search feature
│   ├── series/            # Series detail
│   ├── book/              # Book detail
│   ├── settings/          # User settings
│   ├── storage/           # Platform storage abstraction
│   └── debug/             # Debug tools
└── design/                # Reusable UI components (web/native)
```

Each module contains:
- Shared logic at root (hooks, types, services)
- Platform-specific UI in `web/` and `native/` subfolders

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

## Code Conventions

- All TypeScript files use `.tsx` extension
- No barrel files (`index.ts`) - use direct imports
- `exactOptionalPropertyTypes: true` in tsconfig
- Optional properties: `field?: T | undefined`
