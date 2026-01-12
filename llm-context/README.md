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
   - Data sources (Wikipedia, NC Cardinal, Google Books)
   - API architecture and routes
   - Wikitext parsing patterns
   - Caching strategies
   - Common issues and solutions
   - TypeScript conventions

2. **Key files to reference**:
   - `apps/api/src/routes/manga.ts` - API route handlers
   - `apps/api/src/scripts/wikipedia-client.ts` - Wikipedia parsing
   - `apps/api/src/scripts/opensearch-client.ts` - NC Cardinal integration
   - `apps/api/src/scripts/manga-search.ts` - Search orchestration

3. **Testing changes**:
   ```bash
   # Start API
   cd apps/api && pnpm dev
   
   # Test endpoint
   curl "http://localhost:3001/manga/search?q=one+piece" | jq
   
   # Clear cache if needed
   rm -rf apps/api/.cache/*
   ```
