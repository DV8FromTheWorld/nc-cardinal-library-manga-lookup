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
- [x] Search loading progress indicator - Implemented SSE streaming with step-by-step progress
- [ ] Debug data capture without refetch - Debug info should persist from initial request
- [ ] Search → Book instant navigation - Pre-populate book-detail cache from search results
- [x] Manga vs Light Novel differentiation - Allow series like Ascendance of a Bookworm to show both
- [ ] Fix the search loading indicator to not jump around when changing between categories
- [ ] Research how the hold/reserve system works so we can implement it into our app instead of requiring the user open the library website
- [ ] Fix the amazon links as they're broken
- [ ] Update the homepage to have more recommendations for series
- [ ] Implement a way for users to refresh on mobile, potentially by pulling down.
- [ ] When the API is down we should better communicate that to the user rather than things just breaking
- [x] We need to fix book titles. They often are wrong. Every volume in Bleach except the first one is wrong. One piece is the same way. It shows the right names on the search page / series page, but the book detail page is wrong.


## Technical Debt / Improvements

- [ ] Wikipedia rate limiting is aggressive - Consider longer cache TTL or server-side caching
- [ ] Consider optimizing search to only fetch shown results (lazy load additional volumes)

## Implementation Notes

See `/docs/IMPLEMENTATION-LOG.md` for detailed notes on completed work, decisions made, and issues encountered.
