# NC Cardinal Manga - Feature Tracking

## Completed (2026-01-12)

- [x] Library selector for native - Added modal picker to SearchScreen
- [x] "Part of: <series>" title cleanup - Added `cleanSeriesTitle()` function to remove extra punctuation
- [x] Debug tools for React Native - Created DebugPanel.tsx component
- [x] Cache clearing via debug tools - Added 6 API endpoints + UI buttons for granular cache clearing
- [x] Expandable search results - Added "Show all X volumes" button (both web and native)
- [x] Amazon and MAL links - Added to book and series detail pages
- [x] Blue Period / Ascendance of a Bookworm parsing issues - Fixed with NC Cardinal fallback when Wikipedia fails
- [x] Wikipedia List of Volumes - Was already being used; added rate limiting and better fallback logic

## In Progress / Remaining

- [ ] Back button on native - Need to investigate Android hardware back button handling
- [ ] Search loading progress indicator - Show progress as N items are being looked up
- [ ] Debug data capture without refetch - Debug info should persist from initial request
- [ ] Search → Book instant navigation - Pre-populate book-detail cache from search results
- [ ] Manga vs Light Novel differentiation - Allow series like Ascendance of a Bookworm to show both

## Technical Debt / Improvements

- [ ] Wikipedia rate limiting is aggressive - Consider longer cache TTL or server-side caching
- [ ] Consider optimizing search to only fetch shown results (lazy load additional volumes)

## Implementation Notes

See `/docs/IMPLEMENTATION-LOG.md` for detailed notes on completed work, decisions made, and issues encountered.
