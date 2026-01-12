# Session Summary: NC Cardinal Manga Frontend Architecture & Cover Images

## 1. Frontend Architecture Rework
Restructured `apps/app/` (formerly `apps/web/`) for web/native code sharing:

- **`entrypoints/`** - Platform-specific entry points (`web/App.tsx`, `native/App.tsx`)
- **`modules/`** - Feature slices with shared logic + platform-specific UI:
  - `routing/` - Shared routes, web/native routers (`react-router-dom` / `@react-navigation`)
  - `search/` - Search hooks, API client, web UI
  - `series/` - Series detail hooks, web UI
  - `book/` - Book detail hooks, web UI
  - `settings/` - `useHomeLibrary` hook
  - `storage/` - Platform-agnostic storage abstraction
  - `debug/` - Debug panel module
- **`design/`** - Reusable UI components (web/native subdirs, currently empty)

## 2. Routing Migration
- Switched from manual URL parsing to `react-router-dom`
- Routes: `/` (search), `/series/:slug`, `/books/:isbn`
- Search now pushes to history stack (enables back/forward navigation)

## 3. Cover Image System Overhaul
Added **Bookcover API** as a cover source (aggregates Amazon, Goodreads, etc.):

**Priority order:**
1. Google Books (matched by volume number)
2. Bookcover API (`https://bookcover.longitood.com/bookcover/{ISBN}`)
3. OpenLibrary (fallback, may return placeholder GIFs)

**Files changed:**
- `apps/api/src/scripts/manga-search.ts` - Added `fetchBookcoverUrls()`, updated all cover lookups
- `apps/api/src/routes/manga.ts` - Book detail uses Google Books → OpenLibrary
- Cache: `.cache/bookcover/{ISBN}.txt`

## 4. Wikipedia Parsing Fixes
- Fixed search scoring to prefer `(manga)` pages over disambiguation pages
- Fixed page name generation to strip `(manga)` suffix when building "List of X chapters"
- Added volume-number-based thumbnail matching (fallback when ISBNs differ between sources)

## 5. UI Placeholders
- Always render cover container (even when no image)
- Show 📖/📚 placeholder when cover unavailable
- `onError` handler hides broken images, shows placeholder

## Key Files Modified

```
apps/app/src/
├── entrypoints/web/App.tsx
├── entrypoints/native/App.tsx
├── modules/routing/{routes,types,web/Router,native/Router}.tsx
├── modules/search/{hooks/useSearch,services/mangaApi,web/SearchPage}.tsx
├── modules/series/{hooks/useSeriesDetails,web/SeriesPage}.tsx
├── modules/book/{hooks/useBookDetails,web/BookPage}.tsx
├── modules/settings/hooks/useHomeLibrary.tsx
├── modules/storage/{storage,storage.web,storage.native}.tsx
├── modules/debug/{types,web/DebugPanel}.tsx
└── index.tsx (updated imports)

apps/api/src/
├── scripts/manga-search.ts (Bookcover API, Wikipedia fixes)
├── scripts/wikipedia-client.ts (search scoring, page name fixes)
├── scripts/google-books-client.ts
└── routes/manga.ts (cover fallbacks)
```

## Running the App

```bash
# API (port 3001)
cd apps/api && pnpm dev

# Web (port 3000)  
cd apps/app && pnpm dev

# Clear caches
rm -rf apps/api/.cache/*
```
