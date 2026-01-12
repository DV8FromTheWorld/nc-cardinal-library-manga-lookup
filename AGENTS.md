# AGENTS.md - AI Agent Instructions

This file provides instructions for AI agents (GitHub Copilot, Cursor, Claude, etc.) working on this codebase.

## Project Summary

NC Cardinal Manga is a web app for searching manga series and checking availability across NC Cardinal (North Carolina's public library system). It uses Wikipedia for series metadata, NC Cardinal's Evergreen ILS for availability, and Google Books as a fallback.

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **API**: Fastify + Zod (port 3001) at `apps/api/`
- **Web**: React + Rspack (port 3000) at `apps/web/`
- **Shared**: Common types at `packages/shared/`

## Key Files

| When working on... | Look at these files |
|-------------------|---------------------|
| API routes | `apps/api/src/routes/manga.ts` |
| Wikipedia parsing | `apps/api/src/scripts/wikipedia-client.ts` |
| Library availability | `apps/api/src/scripts/opensearch-client.ts` |
| Search orchestration | `apps/api/src/scripts/manga-search.ts` |
| Frontend components | `apps/web/src/components/` |
| Full context | `llm-context/PROJECT-CONTEXT.md` |

## Code Conventions

### TypeScript
- Project uses `exactOptionalPropertyTypes: true`
- Optional properties must be typed as `field?: T | undefined`
- All API responses validated with Zod schemas

### API Patterns
- Use Fastify with Zod type provider
- Return proper HTTP status codes (200, 404, 500)
- Include `notInCatalog: true` for books not in NC Cardinal (don't return 404)

### Caching
- Wikipedia/Google Books: `.cache/` folder with 24h TTL
- NC Cardinal: Two-tier (ISBN→RecordID permanent, records 1h TTL)
- Clear cache with `rm -rf apps/api/.cache/*`

## Common Tasks

### Adding a new data source
1. Create client in `apps/api/src/scripts/{source}-client.ts`
2. Add caching using the pattern in existing clients
3. Integrate into `manga-search.ts` orchestrator
4. Export types from the client file

### Fixing volume parsing issues
1. Check Wikipedia wikitext structure (may have changed)
2. Look at `parseVolumeList()` in `wikipedia-client.ts`
3. Test with: `pnpm tsx -e "import { getMangaSeries } from './src/scripts/wikipedia-client.ts'; getMangaSeries('SeriesName').then(console.log)"`

### Adding new availability status
1. Add to `CopyStatusCategory` type in `opensearch-client.ts`
2. Update `categorizeStatus()` function
3. Update Zod schema in `manga.ts`
4. Update `calculateAvailability()` helper

## Testing Changes

```bash
# Start API
cd apps/api && pnpm dev

# Test search
curl "http://localhost:3001/manga/search?q=one+piece" | jq

# Test book details
curl "http://localhost:3001/manga/books/9781569319017" | jq

# Clear all caches
rm -rf apps/api/.cache/*
```

## Known Gotchas

1. **Wikipedia redirects**: Always use `redirects=1` parameter (e.g., "Spy × Family" uses special ×)
2. **Transcluded pages**: One Piece splits volumes across 6 subpages - must fetch all
3. **ISBN formats**: Wikipedia has ISBN-10, library needs ISBN-13 - conversion required
4. **Mixed media**: Some pages have both manga and light novels - detect via section headers
5. **CORS**: API needs `@fastify/cors` configured for localhost:3000

## Do NOT

- Don't scrape HTML when APIs exist (NC Cardinal has OpenSearch API)
- Don't make sequential requests for large batches (use parallel with p-limit)
- Don't return 404 for books not in library catalog (return with `notInCatalog: true`)
- Don't cache availability data for too long (1 hour max - it changes frequently)
