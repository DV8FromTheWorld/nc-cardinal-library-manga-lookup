# NC Cardinal Manga

Manga series lookup app powered by NC Cardinal catalog and LibraryThing.

## Monorepo Structure

```
nc-cardinal-manga/
├── apps/
│   ├── web/        # React web app (rspack)
│   ├── native/     # React Native app (Expo)
│   └── api/        # Fastify API server
├── packages/
│   └── shared/     # Shared Zod schemas & types
├── turbo.json      # Turborepo config
└── pnpm-workspace.yaml
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Monorepo | Turborepo + pnpm |
| Web | React 18, rspack, CSS Modules |
| Native | React Native, Expo |
| API | Fastify 5, Zod validation |
| Shared | TypeScript, Zod schemas |

## Getting Started

```bash
# Install dependencies
pnpm install

# Run all dev servers
pnpm dev

# Run specific app
pnpm dev --filter=@repo/web
pnpm dev --filter=@repo/api
pnpm dev --filter=@repo/native
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | TypeScript check all packages |
| `pnpm format` | Format code with Prettier |
| `pnpm format:check` | Check formatting (CI) |

## Code Sharing

Web and Native apps share code through the modules pattern:

```
apps/web/src/modules/feature-name/
├── hooks/              # Shared business logic
├── services/           # Shared API calls
├── types.tsx           # Shared types
├── web/                # Web-specific UI
└── native/             # Native-specific UI (imported by apps/native)
```

Platform-specific files use extensions:
- `.web.tsx` - Web only (resolved by rspack)
- `.native.tsx` - Native only (resolved by Metro)
- `.tsx` - Shared (used by both)

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

See each app's README for required variables.
