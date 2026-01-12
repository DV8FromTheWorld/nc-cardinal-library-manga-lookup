# NC Cardinal Manga - Implementation Log

This document tracks the implementation progress, decisions, and notes for the features outlined in `next-features.md`.

## Started: January 12, 2026

---

## Task Status Overview

| Task | Status | Notes |
|------|--------|-------|
| Back button navigation | ⏳ Pending | Still need to investigate Android hardware back |
| Title cleanup ("Part of:") | ✅ Complete | Added `cleanSeriesTitle()` function |
| Library selector (native) | ✅ Complete | Added modal picker to SearchScreen |
| Debug panel (native) | ✅ Complete | Created DebugPanel.tsx for React Native |
| Cache clear API | ✅ Complete | Added 6 endpoints for granular clearing |
| Cache clear UI | ✅ Complete | Added context-aware buttons to debug panels |
| Expandable search results | ✅ Complete | Added "Show all X volumes" button |
| External links | ✅ Complete | Added Amazon and MAL links |
| Wikipedia parsing issues | ✅ Complete | Added NC Cardinal fallback, rate limiting |

---

## Implementation Notes

### Phase 1: Quick Fixes & Platform Parity

#### Back Button Navigation (Native)
- **Issue**: Back button on native doesn't navigate properly
- **Investigation**: Need to check if hardware back button needs explicit handling
- **Files**: Native screens use `navigation.goBack()` which should work

#### Title Cleanup ("Part of: <series>")
- **Issue**: Extra periods/slashes in series titles on book pages
- **Root cause**: `extractSeriesInfo()` in `manga.ts` extracts from NC Cardinal titles
- **Solution**: Apply `cleanDisplayTitle()` or improve extraction regex

#### Library Selector (Native)
- **Issue**: No way to select home library on React Native
- **Solution**: Add picker component using existing `useHomeLibrary()` hook

#### Debug Panel (Native)
- **Issue**: Debug tools only exist for web
- **Solution**: Port `DebugPanel.tsx` to React Native

#### Cache Clear API
- **Endpoints to add**:
  - `DELETE /manga/cache/book/:isbn`
  - `DELETE /manga/cache/series/:slug`
  - `DELETE /manga/cache/search/:query`
  - `DELETE /manga/cache/:type`
  - `GET /manga/cache/stats`

---

## Decisions Made

1. **Cache clearing granularity**: Chose to support ISBN-level, series-level, and query-level clearing rather than just "clear all" to enable better debugging workflows.

2. **Sub-agent delegation**: Using parallel sub-agents for independent tasks to protect context window and speed up implementation.

3. **NC Cardinal fallback**: When Wikipedia is rate limited (429) and Google Books returns incomplete data, we now build series from NC Cardinal catalog records. This fixes issues like "Blue Period" showing only 1 volume.

4. **Wikipedia rate limiting**: Added exponential backoff retry logic (3 attempts with 1s, 2s, 4s delays) plus request throttling (500ms between requests).

---

## Issues Encountered

### Wikipedia Rate Limiting (429)
- **Problem**: Wikipedia API returns 429 errors when too many requests are made
- **Solution**: Added rate limiting with:
  - Request throttling (500ms minimum between requests)
  - Exponential backoff retries (1s, 2s, 4s delays)
  - NC Cardinal fallback when Wikipedia fails

### Blue Period / Ascendance of a Bookworm Showing Wrong Data
- **Problem**: When Wikipedia fails, Google Books often returns incorrect/incomplete series data
- **Root Cause**: Google Books search for "Blue Period manga" returned 0 items, fallback to title search found NC Cardinal records but didn't use them
- **Solution**: Added logic to detect when NC Cardinal has significantly more volumes than Google Books and use NC Cardinal data as primary source

### Zod Schema Validation Error
- **Problem**: New "nc-cardinal" source type wasn't in the Zod enum
- **Solution**: Added "nc-cardinal" to SeriesResultSchema source enum

---

## Testing Notes

### Verified Working
- Blue Period search: Now returns 18 volumes (was 1)
- Ascendance of a Bookworm: Now returns 41 volumes (was 5)
- Library selector on native: Modal picker working
- Expandable search results: "Show all X volumes" button working
- External links: Amazon and MAL links appearing on book/series pages
- Cache clearing API: All 6 endpoints working

### Still Needs Testing
- Native DebugPanel (created but not tested)
- Back button navigation on Android
- Cache clearing UI integration with pages

---

## Files Modified

### New Files Created
- `apps/app/src/modules/debug/native/DebugPanel.tsx` - Debug panel for React Native
- `apps/api/src/scripts/cache-utils.ts` - Cache management utilities
- `docs/IMPLEMENTATION-LOG.md` - This file

### Files Modified
- `apps/api/src/routes/manga.ts` - Added cache endpoints, updated schemas
- `apps/api/src/scripts/wikipedia-client.ts` - Added rate limiting, retry logic
- `apps/api/src/scripts/manga-search.ts` - Added NC Cardinal fallback, cleanSeriesTitle
- `apps/app/src/modules/search/web/SearchPage.tsx` - Expandable results, cache clearing
- `apps/app/src/modules/search/native/SearchScreen.tsx` - Library selector, expandable results
- `apps/app/src/modules/book/web/BookPage.tsx` - External links, cache clearing
- `apps/app/src/modules/series/web/SeriesPage.tsx` - External links, cache clearing
- `apps/app/src/modules/debug/web/DebugPanel.tsx` - Cache clearing support
- `apps/app/src/modules/search/services/mangaApi.tsx` - Cache API functions
- Various CSS files for new UI elements

---

## Summary

**Completed: 8 out of 9 bullet points from next-features.md** (plus additional improvements)

### Additional Work (2026-01-12, Session 2)

#### Search Navigation Stack
- Each search now pushes onto the navigation stack
- Added back button to search results header
- Tapping the app title goes back to home (popToTop)
- Suggestion chips push new search screens instead of just searching

#### Cache Clearing on Mobile
- Wired up cache clearing in native DebugPanel for all screens:
  - SearchScreen: Clear cache for current search query
  - BookScreen: Clear cache for current ISBN
  - SeriesScreen: Clear cache for current series slug

### Files Modified (Session 2)
- `apps/app/src/modules/search/native/SearchScreen.tsx` - Navigation push, back button, cache clearing
- `apps/app/src/modules/book/native/BookScreen.tsx` - Cache clearing
- `apps/app/src/modules/series/native/SeriesScreen.tsx` - Cache clearing
