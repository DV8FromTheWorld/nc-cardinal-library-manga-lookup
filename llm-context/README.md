# LLM Context Files

This folder contains context documents for LLMs working on this project.

## Files

| File | Description |
|------|-------------|
| `PROJECT-CONTEXT.md` | **Main context document** - Comprehensive overview of the manga search functionality, data sources, APIs, implementation patterns, and common issues |
| `INITIAL-SETUP.md` | Original project setup context from when the monorepo was first created |

## For LLMs

When starting work on this project:

1. **Read `PROJECT-CONTEXT.md` first** - It contains everything you need to know about:
   - Data sources (Wikipedia, NC Cardinal, Google Books, Bookcover API)
   - API architecture and routes
   - Frontend module architecture (vertical slices)
   - Wikitext parsing patterns
   - Caching strategies
   - Common issues and solutions
   - TypeScript conventions

2. **Key files to reference**:
   
   **Backend:**
   - `apps/api/src/routes/manga.ts` - API route handlers
   - `apps/api/src/scripts/wikipedia-client.ts` - Wikipedia parsing
   - `apps/api/src/scripts/opensearch-client.ts` - NC Cardinal integration
   - `apps/api/src/scripts/manga-search.ts` - Search orchestration
   
   **Frontend:**
   - `apps/app/src/modules/routing/` - Routes and platform routers
   - `apps/app/src/modules/search/` - Search feature
   - `apps/app/src/modules/series/` - Series detail feature
   - `apps/app/src/modules/book/` - Book detail feature

3. **Frontend architecture:**
   ```
   apps/app/src/
   ├── entrypoints/           # Platform bootstrapping (web/native)
   ├── modules/               # Feature slices
   │   └── {feature}/
   │       ├── types.tsx      # Shared types
   │       ├── hooks/         # Shared hooks
   │       ├── services/      # API calls
   │       ├── web/           # Web UI
   │       └── native/        # Native UI (future)
   └── design/                # Reusable UI components (future)
   ```

4. **Code conventions:**
   - All TypeScript files use `.tsx` extension
   - No barrel files (`index.ts`) - use direct imports
   - `exactOptionalPropertyTypes: true` - use `field?: T | undefined`

5. **Testing changes**:
   ```bash
   # Start API
   cd apps/api && pnpm dev
   
   # Start web app
   cd apps/app && pnpm dev
   
   # Test endpoint
   curl "http://localhost:3001/manga/search?q=one+piece" | jq
   
   # Clear cache if needed
   rm -rf apps/api/.cache/*
   ```
