# CLAUDE.md - Instructions for Claude

## What This Project Does

NC Cardinal Manga helps users find manga in North Carolina public libraries. It:
1. Searches Wikipedia for manga series metadata and ISBNs
2. Checks NC Cardinal (library catalog) for availability
3. Shows which volumes are available, checked out, or missing

## Quick Start

```bash
# Install
pnpm install

# Run API (port 3001)
cd apps/api && pnpm dev

# Run web (port 3000)  
cd apps/web && pnpm dev

# Test
curl "http://localhost:3001/manga/search?q=one+piece" | jq
```

## Project Structure

```
apps/api/src/
├── index.ts              # Fastify server setup
├── routes/manga.ts       # API endpoints
└── scripts/
    ├── wikipedia-client.ts    # Series data + ISBNs
    ├── opensearch-client.ts   # NC Cardinal availability
    ├── google-books-client.ts # Fallback source
    └── manga-search.ts        # Orchestrates all sources
```

## For Detailed Context

Read `llm-context/PROJECT-CONTEXT.md` - it contains:
- All data source APIs and how to use them
- Wikitext parsing implementation details
- Caching strategies
- Common issues and solutions
- TypeScript conventions

## Key Implementation Notes

### Wikipedia API
- Use OpenSearch for fuzzy title matching
- Include `redirects=1` parameter (handles special chars like ×)
- Parse `{{Graphic novel list}}` templates for volume data
- Fetch transcluded subpages for series like One Piece

### NC Cardinal (Evergreen ILS)
- OpenSearch API at `/opac/extras/opensearch/1.1/CARDINAL/atom-full/keyword/`
- SuperCat for direct record lookup: `/opac/extras/supercat/retrieve/atom-full/record/{id}`
- Two-tier cache: ISBN→RecordID (permanent) + Full records (1 hour)

### Availability Categories
```typescript
type CopyStatusCategory = 
  | 'available'     // On shelf
  | 'checked_out'   // Borrowed
  | 'in_transit'    // Moving between libraries
  | 'on_order'      // Ordered, not arrived
  | 'on_hold'       // Reserved
  | 'unavailable';  // Lost, missing, etc.
```

## Common Tasks

### Debug Wikipedia parsing
```bash
cd apps/api
pnpm tsx -e "
import { getMangaSeries } from './src/scripts/wikipedia-client.ts';
getMangaSeries('Demon Slayer').then(s => {
  console.log('Title:', s?.title);
  console.log('Volumes:', s?.totalVolumes);
  console.log('Sample:', s?.volumes?.slice(0,3));
});
"
```

### Clear caches
```bash
rm -rf apps/api/.cache/*
```

### Check specific ISBN availability
```bash
curl "http://localhost:3001/manga/books/9781569319017" | jq '.availability'
```

## TypeScript Note

This project uses `exactOptionalPropertyTypes: true`. Always type optional fields as:
```typescript
field?: string | undefined;  // ✓ Correct
field?: string;              // ✗ Will cause errors
```
