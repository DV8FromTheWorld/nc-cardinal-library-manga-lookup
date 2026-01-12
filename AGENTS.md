# AGENTS.md - AI Agent Instructions

This file provides instructions for AI agents (GitHub Copilot, Cursor, Claude, etc.) working on this codebase.

## Project Summary

NC Cardinal Manga is a web/native app for searching manga series and checking availability across NC Cardinal (North Carolina's public library system). It uses Wikipedia for series metadata, NC Cardinal's Evergreen ILS for availability, and Google Books + Bookcover API for cover images.

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **API**: Fastify + Zod (port 3001) at `apps/api/`
- **App**: React + Rspack (port 3000) at `apps/app/` - shared code for web and native
- **Native**: React Native entry point at `apps/native/` - uses code from `apps/app/`
- **Shared**: Common types at `packages/shared/`

## Frontend Architecture (apps/app/)

The frontend uses a **modules-based architecture** for code sharing between web and React Native:

```
apps/app/src/
├── entrypoints/           # Platform bootstrapping
│   ├── web/App.tsx        # Web entry (react-router-dom)
│   └── native/App.tsx     # Native entry (@react-navigation)
├── modules/               # Feature slices (vertical slices)
│   ├── routing/           # Routes + platform-specific routers
│   │   ├── routes.tsx     # Shared route definitions
│   │   ├── types.tsx      # Route param types
│   │   ├── web/Router.tsx
│   │   └── native/Router.tsx
│   ├── search/            # Search feature
│   │   ├── types.tsx      # API types
│   │   ├── hooks/useSearch.tsx
│   │   ├── services/mangaApi.tsx
│   │   └── web/SearchPage.tsx
│   ├── series/            # Series detail feature
│   ├── book/              # Book detail feature
│   ├── settings/          # Settings (home library)
│   ├── storage/           # Platform-agnostic storage
│   │   ├── storage.tsx    # Interface + re-export
│   │   ├── storage.web.tsx
│   │   └── storage.native.tsx
│   └── debug/             # Debug panel
├── design/                # Reusable UI components (future)
│   ├── web/
│   └── native/
└── styles/                # Global CSS variables
```

### Module Pattern

Each module follows this structure:
- **Root level**: Shared logic (hooks, types, services)
- **web/ folder**: Web-specific React components
- **native/ folder**: React Native components

### Code Conventions

- **All TypeScript files use .tsx extension** (even without JSX)
- **No barrel files** (index.ts) - use direct imports
- **Direct imports**: `import { useSearch } from '../search/hooks/useSearch'`

## Key Files

| When working on... | Look at these files |
|-------------------|---------------------|
| API routes | `apps/api/src/routes/manga.ts` |
| Wikipedia parsing | `apps/api/src/scripts/wikipedia-client.ts` |
| Library availability | `apps/api/src/scripts/opensearch-client.ts` |
| Search orchestration | `apps/api/src/scripts/manga-search.ts` |
| Frontend search | `apps/app/src/modules/search/` |
| Frontend routing | `apps/app/src/modules/routing/` |
| Full context | `llm-context/PROJECT-CONTEXT.md` |

## TypeScript Conventions

- Project uses `exactOptionalPropertyTypes: true`
- Optional properties must be typed as `field?: T | undefined`
- All API responses validated with Zod schemas

## API Patterns

- Use Fastify with Zod type provider
- Return proper HTTP status codes (200, 404, 500)
- Include `notInCatalog: true` for books not in NC Cardinal (don't return 404)

## Cover Image Priority

1. **Bookcover API** - Returns clean 404 when no image (no placeholder GIFs)
2. **Google Books** - Fallback, may return placeholder images
3. **OpenLibrary** - Last resort

## Caching

- Wikipedia/Google Books/Bookcover: `.cache/` folder with 24h TTL
- NC Cardinal: Two-tier (ISBN to RecordID permanent, records 1h TTL)
- Clear cache with `rm -rf apps/api/.cache/*`

## Common Tasks

### Adding a new data source
1. Create client in `apps/api/src/scripts/{source}-client.ts`
2. Add caching using the pattern in existing clients
3. Integrate into `manga-search.ts` orchestrator
4. Export types from the client file

### Adding a new frontend feature
1. Create module folder in `apps/app/src/modules/{feature}/`
2. Add shared logic (hooks, types, services) at module root
3. Add platform-specific UI in `web/` and `native/` subfolders
4. Add route in `modules/routing/routes.tsx`
5. Wire up in platform-specific routers

### Fixing volume parsing issues
1. Check Wikipedia wikitext structure (may have changed)
2. Look at `parseVolumeList()` in `wikipedia-client.ts`
3. Test with: `pnpm tsx -e "import { getMangaSeries } from './src/scripts/wikipedia-client.ts'; getMangaSeries('SeriesName').then(console.log)"`

## Testing Changes

```bash
# Start API
cd apps/api && pnpm dev

# Start web app
cd apps/app && pnpm dev

# Test search
curl "http://localhost:3001/manga/search?q=one+piece" | jq

# Test book details
curl "http://localhost:3001/manga/books/9781569319017" | jq

# Clear all caches
rm -rf apps/api/.cache/*
```

## Known Gotchas

1. **Wikipedia redirects**: Always use `redirects=1` parameter (handles special characters)
2. **Transcluded pages**: One Piece splits volumes across 6 subpages - must fetch all
3. **ISBN formats**: Wikipedia has ISBN-10, library needs ISBN-13 - conversion required
4. **Mixed media**: Some pages have both manga and light novels - detect via section headers
5. **CORS**: API needs `@fastify/cors` configured for localhost:3000
6. **Duplicate React**: Monorepo can have multiple React instances - use `resolve.alias` in bundler

## Git Commits

When making changes:
- **Suggest commits** at logical checkpoints (after completing a feature, fix, or refactor)
- **Propose the commit message** with a clear, conventional format (e.g., `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
- **Ask for confirmation** before actually creating the commit
- Don't batch unrelated changes into a single commit

## Do NOT

- Don't scrape HTML when APIs exist (NC Cardinal has OpenSearch API)
- Don't make sequential requests for large batches (use parallel with p-limit)
- Don't return 404 for books not in library catalog (return with `notInCatalog: true`)
- Don't cache availability data for too long (1 hour max - it changes frequently)
- Don't create barrel files (index.ts) - use direct imports
- Don't use .ts extension - all TypeScript files should be .tsx
