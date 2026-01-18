# NC Cardinal Manga - LLM Context Document

This document provides comprehensive context for LLMs working on this project. It covers architecture, data sources, implementation patterns, and lessons learned.

## Project Overview

**Purpose**: A web/native application to search manga series and check availability across NC Cardinal library system (North Carolina's consortium of public libraries).

**Key Goals**:
1. Search for manga by title (handles typos, romanized Japanese names, alternate titles)
2. Display series information with all volumes
3. Show library availability for each volume
4. Distinguish between manga and light novels
5. Handle spin-offs separately from main series

## Architecture

### Monorepo Structure (Turborepo + pnpm)

```
nc-cardinal-manga/
├── apps/
│   ├── api/              # Fastify API server (port 3001)
│   │   └── src/
│   │       ├── index.ts           # Entry point, CORS setup
│   │       ├── routes/
│   │       │   └── manga.ts       # Main API routes
│   │       └── scripts/           # Data source clients
│   │           ├── wikipedia-client.ts
│   │           ├── google-books-client.ts
│   │           ├── opensearch-client.ts  # NC Cardinal
│   │           ├── manga-search.ts       # Orchestrator
│   │           └── ...
│   │
│   ├── app/              # React + Rspack (port 3000) - shared web/native code
│   │   └── src/
│   │       ├── entrypoints/       # Platform bootstrapping
│   │       │   ├── web/App.tsx
│   │       │   └── native/App.tsx
│   │       ├── modules/           # Feature slices
│   │       │   ├── routing/       # Routes + routers
│   │       │   ├── search/        # Search feature
│   │       │   ├── series/        # Series detail
│   │       │   ├── book/          # Book detail
│   │       │   ├── settings/      # Home library
│   │       │   ├── storage/       # Platform storage
│   │       │   └── debug/         # Debug panel
│   │       └── design/            # Reusable UI components (future)
│   │
│   └── native/           # React Native entry point
│       └── index.js      # Points to apps/app code
│
├── packages/
│   └── shared/           # Shared types and schemas
└── llm-context/          # This folder - LLM documentation
```

### Tech Stack

- **Backend**: Fastify + Zod (validation) + TypeScript
- **Frontend**: React + Rspack + CSS Modules
- **Native**: React Native (entry point in apps/native, code in apps/app)
- **Package Manager**: pnpm with workspaces
- **Build**: Turborepo for monorepo orchestration

### Frontend Module Architecture

The frontend uses **vertical slices** (modules) for code sharing between web and React Native:

```
modules/{feature}/
├── types.tsx           # Shared types/interfaces
├── hooks/              # Shared React hooks
│   └── use{Feature}.tsx
├── services/           # API client functions
│   └── {feature}Api.tsx
├── web/                # Web-specific React components
│   ├── {Feature}Page.tsx
│   └── {Feature}Page.module.css
└── native/             # React Native components (future)
    └── {Feature}Screen.tsx
```

**Key conventions:**
- All TypeScript files use `.tsx` extension (even without JSX)
- No barrel files (`index.ts`) - use direct imports
- Platform-agnostic logic at module root
- Platform-specific UI in `web/` or `native/` subfolders

### Routing

Routes are defined once and used by both platforms:

```typescript
// modules/routing/routes.tsx
export const ROUTES = {
  HOME: '/',
  SEARCH: '/search',
  SERIES: '/series/:slug',
  BOOK: '/books/:isbn',
} as const;
```

Platform-specific routers:
- **Web**: `react-router-dom` in `modules/routing/web/Router.tsx`
- **Native**: `@react-navigation` in `modules/routing/native/Router.tsx`

### Platform-Specific Code

For code that differs between platforms (e.g., storage), use platform extensions:

```
modules/storage/
├── storage.tsx         # Interface + re-export
├── storage.web.tsx     # localStorage implementation
└── storage.native.tsx  # AsyncStorage implementation
```

The bundler (Rspack/Metro) resolves the correct file based on platform.

## Data Sources

### 1. Wikipedia API (Primary - Series Metadata & ISBNs)

**Why Wikipedia**: 
- Free, no rate limits, no authentication
- Excellent fuzzy search via OpenSearch API
- Handles typos, romanized names (e.g., "Kimetsu no Yaiba" → "Demon Slayer")
- Has structured volume data in `{{Graphic novel list}}` templates
- Contains ISBNs for both Japanese and English editions

**Key Endpoints**:
```
# OpenSearch (fuzzy title search)
https://en.wikipedia.org/w/api.php?action=opensearch&search={query}&limit=10&format=json

# Page content with wikitext
https://en.wikipedia.org/w/api.php?action=query&titles={title}&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json
```

**Important Implementation Details**:
- Always include `redirects=1` parameter - Wikipedia uses special characters (e.g., "Spy × Family" with multiplication sign)
- Volume data is in `{{Graphic novel list}}` wikitext templates
- Some pages use **transclusion** (e.g., One Piece splits volumes across 6 subpages via `{{:List of One Piece chapters (1-186)}}`)
- Must parse both `OriginalISBN` (Japanese) and `LicensedISBN` (English) fields
- ISBN-10 format must be converted to ISBN-13 (add "978" prefix, recalculate check digit)

**Challenges Solved**:
- Section detection for mixed media (manga vs light novels on same page)
- Spin-off filtering (exclude "Short Story Collection", "Side Story", etc.)
- Volume deduplication when same volume number appears in different parts
- Part renumbering (manga with Part 1 Vol 1-7, Part 2 Vol 1-13 → sequential 1-20)

### 2. NC Cardinal / Evergreen ILS (Library Availability)

**What it is**: NC Cardinal is North Carolina's shared library catalog, running Evergreen ILS.

**Key Endpoints**:

```
# OpenSearch API (primary search method)
/opac/extras/opensearch/1.1/{org}/{format}/{searchClass}/?searchTerms={query}&count={n}

# SuperCat direct record lookup (faster for known record IDs)
/opac/extras/supercat/retrieve/{format}/record/{recordId}
```

**Formats**:
- `atom-full`: Atom feed with full holdings data (recommended)
- `marcxml`: MARC21 XML records
- `mods`: MODS format

**Organization Codes**:
- `CARDINAL`: All NC Cardinal libraries
- Individual library codes: `KINSTON`, `BRYAN`, etc.

**Two-Tier Caching Strategy**:
```
.cache/nc-cardinal/
├── isbn-map/       # ISBN → RecordID (permanent, never changes)
│   └── 9781234567890.txt
└── records/        # RecordID → Full record (1 hour TTL, availability changes)
    └── 12345678.json
```

This allows:
1. First lookup: Full OpenSearch (slow ~5s) → cache both ISBN→RecordID and full record
2. Subsequent lookups: ISBN→RecordID cache hit → SuperCat direct fetch (fast ~1s)
3. Availability refresh: Just SuperCat fetch using cached RecordID

**Holdings Status Categories**:
```typescript
type CopyStatusCategory = 
  | 'available'      // On shelf
  | 'checked_out'    // Borrowed
  | 'in_transit'     // Moving between libraries
  | 'on_order'       // Ordered but not received
  | 'on_hold'        // Reserved for someone
  | 'unavailable';   // Lost, missing, repair, withdrawn
```

### 3. Cover Image Sources (Priority Order)

**1. Bookcover API** (Preferred)
```
https://bookcover.longitood.com/bookcover/{isbn}
```
- Returns clean 404 when no image (allows proper placeholder handling)
- Aggregates from Amazon, Goodreads, etc.
- Cached in `.cache/bookcover/`

**2. Google Books API** (Fallback)
- `thumbnail` field in search results
- May return placeholder images when no cover exists

**3. OpenLibrary Covers API** (Last Resort)
```
https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg
```
- May return placeholder GIFs instead of 404
- UI handles via `onError` image handler

### 4. Google Books API (Series Data Fallback)

**When used**: Fallback when Wikipedia doesn't have volume data

**Key features**:
- `seriesInfo` field groups volumes by series and differentiates spin-offs
- Good for newer releases and future volumes
- No authentication needed for basic search

**Limitations**:
- `series/get` endpoint requires OAuth (geographically restricted)
- Some series missing or incomplete

## Key Implementation Patterns

### 1. Wikitext Parsing

The Wikipedia client parses `{{Graphic novel list}}` templates:

```wikitext
{{Graphic novel list
 | VolumeNumber    = 1
 | OriginalISBN    = 978-4-08-872509-3
 | LicensedISBN    = 978-1-56931-901-4
 | OriginalRelDate = December 24, 1997
 | LicensedRelDate = June 2003
}}
```

**Parsing approach**:
1. Split wikitext by lines
2. Detect section headers (`===Light novels===`, `===Manga===`)
3. Track current media type and part number
4. Extract field values with regex: `/^\s*\|\s*(\w+)\s*=\s*(.+)/`
5. Clean values (remove refs, templates, wiki links)

### 2. Media Type Separation

Pages like "Ascendance of a Bookworm" have both light novels and manga:

```typescript
export type MediaType = 'manga' | 'light_novel' | 'unknown';

// Detection from section headers
function detectMediaType(header: string): MediaType {
  const lower = header.toLowerCase();
  if (lower.includes('light novel') || lower.includes('novel')) return 'light_novel';
  if (lower.includes('manga')) return 'manga';
  return 'unknown';
}
```

When both types exist, the API:
1. Tags each volume with its media type
2. Prefers manga over light novels in default search
3. `getAllSeriesFromPage()` returns both as separate series

### 3. Spin-off Detection

```typescript
function isSpinoffTitle(title: string | undefined): boolean {
  if (!title) return false;
  const lower = title.toLowerCase();
  return (
    lower.includes('short story') ||
    lower.includes('side story') ||
    lower.includes('anthology') ||
    lower.includes('gaiden') ||
    lower.includes('stories –') ||
    lower.includes('fan book') ||
    lower.includes('guidebook')
  );
}
```

### 4. ISBN-10 to ISBN-13 Conversion

```typescript
function convertISBN10to13(isbn10: string): string {
  const base = isbn10.slice(0, 9);
  const isbn13Base = '978' + base;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(isbn13Base[i], 10);
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return isbn13Base + checkDigit;
}
```

### 5. Search Result Scoring

Wikipedia search returns multiple results. Scoring prioritizes:

```typescript
// Scoring factors (higher = better)
+500: Exact title match (normalized)
+200: "List of ... volumes" or "List of ... chapters"
+100: "(manga)" in title
+50:  Contains query string
-100: Has colon but doesn't start with query (likely spinoff)
-30:  Title much longer than query

// Skip entirely
- Movies, films, TV series, seasons, episodes, OVAs
```

### 6. Parallel Batch Fetching

For series with many volumes (e.g., One Piece with 114):

```typescript
import pLimit from 'p-limit';

const limit = pLimit(10); // 10 concurrent requests
const batches = chunk(isbns, 10);

for (const batch of batches) {
  await Promise.all(batch.map(isbn => 
    limit(() => searchByISBN(isbn))
  ));
  await delay(100); // Small delay between batches
}
```

### 7. Caching Strategy

All external API calls are cached:

```
.cache/
├── wikipedia/           # 24 hour TTL
│   ├── search_{query}.json
│   ├── page_title_{title}.json
│   └── series_{query}.json
├── google-books/        # 24 hour TTL
│   └── search_{query}.json
├── bookcover/           # 24 hour TTL
│   └── {isbn}.txt
├── nc-cardinal/
│   ├── isbn-map/        # Permanent (ISBN→RecordID never changes)
│   └── records/         # 1 hour TTL (availability changes)
└── search-service/      # 1 hour TTL (aggregated results)
```

### 8. Error Handling for Missing Books

When a book isn't in NC Cardinal:

```typescript
if (!record) {
  return {
    id: `isbn-${cleanISBN}`,
    title: `Book (ISBN: ${cleanISBN})`,
    availability: {
      available: false,
      notInCatalog: true,  // Key flag for UI
      totalCopies: 0,
      // ... other counts
    },
  };
}
```

## API Routes

### GET /manga/search?q={query}

Returns series and volumes matching the query.

```typescript
{
  query: string,
  parsedQuery: { title: string, volumeNumber?: number },
  series: [{
    id: string,      // Wikipedia pageid or generated
    slug: string,    // URL-friendly
    title: string,
    totalVolumes: number,
    availableVolumes: number,
    isComplete: boolean,
    coverImage?: string,
    source: 'wikipedia' | 'google-books'
  }],
  volumes: [{
    title: string,
    volumeNumber?: number,
    isbn?: string,
    availability?: VolumeAvailability
  }],
  _debug?: DebugInfo  // When ?debug=true
}
```

### GET /manga/series/:slug

Returns detailed series info with all volumes.

### GET /manga/books/:isbn

Returns book details with holdings from all libraries.

```typescript
{
  id: string,
  title: string,
  authors: string[],
  isbns: string[],
  coverImage?: string,
  holdings: [{
    libraryCode: string,
    libraryName: string,
    location: string,
    callNumber: string,
    status: string,           // Raw: "Checked out", "Lost", etc.
    statusCategory: string,   // Categorized: "checked_out", "unavailable"
    available: boolean
  }],
  availability: {
    available: boolean,
    notInCatalog?: boolean,
    totalCopies: number,
    availableCopies: number,
    checkedOutCopies: number,
    inTransitCopies: number,
    onOrderCopies: number,
    onHoldCopies: number,
    unavailableCopies: number,
    libraries: string[]
  }
}
```

## Common Issues & Solutions

### 1. "Only 18 volumes for One Piece"

**Cause**: Not fetching transcluded subpages
**Solution**: Detect `{{:SubpageTitle}}` patterns and fetch all subpages

### 2. "80 volumes for Ascendance of a Bookworm"

**Cause**: Mixing light novels and manga from same page
**Solution**: Section detection + media type filtering

### 3. "Unknown ISBN" when clicking books

**Cause**: Returning 404 for books not in NC Cardinal
**Solution**: Return minimal book info with `notInCatalog: true`

### 4. "Spy x Family" not working

**Cause**: Wikipedia uses "Spy × Family" (multiplication sign)
**Solution**: Add `redirects=1` to Wikipedia API calls

### 5. Volume parsing fails

**Cause**: Wikitext field regex too strict
**Solution**: Handle leading whitespace: `/^\s*\|\s*(\w+)\s*=\s*(.+)/`

### 6. CORS errors in browser

**Cause**: API on port 3001, frontend on port 3000
**Solution**: `@fastify/cors` configured for localhost origins

### 7. Slow series loading (100+ seconds)

**Cause**: Sequential ISBN lookups
**Solution**: Parallel batch fetching with p-limit + two-tier caching

### 8. Duplicate React instances in monorepo

**Cause**: Multiple React copies in node_modules
**Solution**: Add `resolve.alias` in Rspack config to force single React

### 9. Cover images showing placeholders instead of 404

**Cause**: Google Books and OpenLibrary return placeholder images
**Solution**: Prioritize Bookcover API which returns clean 404

## TypeScript Conventions

### File Extensions

All TypeScript files use `.tsx` extension, even without JSX. This simplifies tooling and allows adding JSX later without renaming.

### exactOptionalPropertyTypes

The project uses `exactOptionalPropertyTypes: true`. This means:

```typescript
// ❌ Wrong
interface Foo {
  bar?: string;
}
const foo: Foo = { bar: undefined }; // Error!

// ✅ Correct
interface Foo {
  bar?: string | undefined;
}
```

### No Barrel Files

Don't create `index.ts` files to re-export. Use direct imports:

```typescript
// ❌ Wrong
import { useSearch } from '../search';

// ✅ Correct
import { useSearch } from '../search/hooks/useSearch';
```

### Zod Schemas

All API responses use Zod schemas for validation:

```typescript
const BookDetailsSchema = z.object({
  id: z.string(),
  title: z.string(),
  availability: z.object({
    available: z.boolean(),
    notInCatalog: z.boolean().optional(),
    // ...
  }),
});
```

## File Quick Reference

| File | Purpose |
|------|---------|
| `apps/api/src/index.ts` | Fastify entry, CORS setup |
| `apps/api/src/routes/manga.ts` | All manga API routes |
| `apps/api/src/scripts/wikipedia-client.ts` | Wikipedia API + wikitext parsing |
| `apps/api/src/scripts/opensearch-client.ts` | NC Cardinal API + caching |
| `apps/api/src/scripts/google-books-client.ts` | Google Books fallback |
| `apps/api/src/scripts/manga-search.ts` | Search orchestrator |
| `apps/app/src/entrypoints/web/App.tsx` | Web entry point |
| `apps/app/src/modules/routing/web/Router.tsx` | Web router (react-router-dom) |
| `apps/app/src/modules/search/web/SearchPage.tsx` | Search UI |
| `apps/app/src/modules/series/web/SeriesPage.tsx` | Series detail UI |
| `apps/app/src/modules/book/web/BookPage.tsx` | Book detail UI |

## Running the Project

All commands run from repo root:

```bash
# Install dependencies
pnpm install

# Start API (port 3001)
pnpm api

# Start web app (port 3000)
pnpm app

# Start React Native dev server (Metro/Expo)
pnpm native

# Build and run iOS app (separate terminal)
pnpm ios

# Clear caches (useful for debugging)
rm -rf apps/api/.cache/*
```

## Cross-Platform Testing

**CRITICAL**: This is a web + React Native app. Any changes to shared frontend code MUST be tested on BOTH platforms.

### When to test both platforms
- Any change to `apps/app/src/modules/*/` (shared code)
- Any change to `apps/app/src/design/` (UI components)
- Any change to routing, navigation, or screens

### When single-platform testing is OK
- API-only changes (`apps/api/`)
- Web-specific changes (`modules/*/web/`)
- Native-specific changes (`modules/*/native/`)

### How to test

**Web testing:**
```bash
pnpm api    # Terminal 1: Start API
pnpm app    # Terminal 2: Start web app → http://localhost:3000
```

**React Native testing:**
```bash
pnpm api    # Terminal 1: Start API (if not already running)
pnpm native # Terminal 2: Start Metro/Expo JS server (keep running)
pnpm ios    # Terminal 3: Build and launch iOS app (once)
```

**Note:** `pnpm native` starts the Metro bundler that serves JS to the app. Keep it running while testing. `pnpm ios` builds the native app and installs it on the simulator - you only need to run this once unless native code changes.

For iOS Simulator automation (clicking, screenshots), see `IOS-SIMULATOR-AUTOMATION.md`.

## Testing Scripts

```bash
# Test Wikipedia client
cd apps/api && pnpm tsx src/scripts/wikipedia-client.ts

# Test specific manga
cd apps/api && pnpm tsx -e "
import { getMangaSeries } from './src/scripts/wikipedia-client.ts';
getMangaSeries('One Piece').then(console.log);
"

# Test API endpoint
curl "http://localhost:3001/manga/search?q=demon+slayer" | jq
```
