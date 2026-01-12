# @repo/native

React Native mobile app for NC Cardinal Manga lookup.

## Tech Stack

- React Native 0.76
- Expo SDK 52 (prebuild workflow)
- TypeScript
- Metro bundler

## Development

```bash
# Start Expo dev server
pnpm dev

# Run on iOS simulator
pnpm ios

# Run on Android emulator
pnpm android
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start Expo dev server |
| `pnpm ios` | Run on iOS simulator |
| `pnpm android` | Run on Android emulator |
| `pnpm typecheck` | TypeScript check |
| `pnpm prebuild` | Regenerate ios/android folders |
| `pnpm prebuild:clean` | Clean regenerate (⚠️ wipes native changes) |

## Project Structure

```
apps/native/
├── src/
│   └── App.tsx         # Root component
├── ios/                # iOS native project (Swift)
├── android/            # Android native project (Kotlin)
├── assets/             # App icons and splash screen
├── app.json            # Expo configuration
├── metro.config.js     # Metro bundler config
└── index.js            # Entry point
```

## Native Folders

The `ios/` and `android/` folders are **committed to git** and can be edited directly.

- iOS code: `ios/NCCardinalManga/`
- Android code: `android/app/src/main/java/com/nccardinal/manga/`

**Note:** Running `pnpm prebuild:clean` will regenerate these folders and wipe any direct edits. Use regular `pnpm prebuild` to apply config changes while preserving edits.

## Code Sharing with Web

This app shares code with `@repo/web` through:

1. **Shared modules** in `apps/web/src/modules/*/` - hooks, services, types
2. **Platform extensions** - Metro resolves `.native.tsx` before `.tsx`

Example:
```typescript
// In apps/native, this import:
import { useSearch } from '../../web/src/modules/search/hooks/useSearch';

// Will resolve:
// - useSearch.native.tsx if it exists (native-specific)
// - useSearch.tsx otherwise (shared)
```

## App Configuration

Edit `app.json` for:
- App name and slug
- Bundle identifiers (iOS/Android)
- Icons and splash screen
- Permissions and capabilities

After changing `app.json`, run `pnpm prebuild` to apply changes to native projects.
