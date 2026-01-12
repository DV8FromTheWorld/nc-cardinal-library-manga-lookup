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

# Run web app (port 3000)  
cd apps/app && pnpm dev

# Test
curl "http://localhost:3001/manga/search?q=one+piece" | jq
```

## Project Structure

```
apps/
├── api/src/                    # Fastify API server
│   ├── index.ts                # Server setup
│   ├── routes/manga.ts         # API endpoints
│   └── scripts/
│       ├── wikipedia-client.ts     # Series data + ISBNs
│       ├── opensearch-client.ts    # NC Cardinal availability
│       ├── google-books-client.ts  # Fallback source
│       └── manga-search.ts         # Orchestrates all sources
│
├── app/src/                    # Shared web + native code
│   ├── entrypoints/
│   │   ├── web/App.tsx         # Web bootstrap
│   │   └── native/App.tsx      # Native bootstrap
│   ├── modules/                # Feature slices
│   │   ├── routing/            # Routes + routers
│   │   ├── search/             # Search feature
│   │   ├── series/             # Series detail
│   │   ├── book/               # Book detail
│   │   ├── settings/           # Home library
│   │   ├── storage/            # Platform storage
│   │   └── debug/              # Debug panel
│   └── design/                 # Future UI components
│
└── native/                     # React Native entry point
    └── index.js                # Points to apps/app code
```

## Frontend Module Pattern

Each module in `apps/app/src/modules/` follows this pattern:

```
modules/{feature}/
├── types.tsx           # Shared types
├── hooks/              # Shared hooks
│   └── use{Feature}.tsx
├── services/           # API calls
│   └── {feature}Api.tsx
├── web/                # Web-specific UI
│   └── {Feature}Page.tsx
└── native/             # React Native UI (future)
    └── {Feature}Screen.tsx
```

**Key conventions:**
- All files use `.tsx` extension (even without JSX)
- No barrel files (`index.ts`) - use direct imports
- Shared logic at module root, platform UI in `web/` or `native/`

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

### Cover Images (Priority Order)
1. **Bookcover API** - Clean 404 when no image
2. **Google Books** - May return placeholder
3. **OpenLibrary** - Last resort fallback

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

All TypeScript files use `.tsx` extension, even without JSX.
