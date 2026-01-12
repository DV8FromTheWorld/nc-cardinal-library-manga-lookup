# Modules (Vertical Slices)

Each module is a self-contained feature with shared logic and platform-specific UI.

## File Extension Convention

- **Use `.tsx` for all TypeScript files** (even without JSX)
- **Use `.d.ts` only for type declarations**
- **No `.js`/`.jsx` files** in src/

## Structure

```
modules/
└── manga-search/              # Example feature module
    ├── index.tsx              # Public exports
    ├── types.tsx              # Shared types
    ├── hooks/                 # Shared hooks (business logic)
    │   └── useSearch.tsx
    ├── services/              # Shared services/API calls
    │   └── searchService.tsx
    ├── web/                   # Web-specific components
    │   ├── SearchPage.tsx
    │   └── SearchPage.module.css
    └── native/                # React Native components (future)
        └── SearchScreen.tsx
```

## Platform-Specific Files

For files that need platform variants but live in the same directory:

```
utils/
├── storage.tsx         # Shared interface
├── storage.web.tsx     # Web implementation (localStorage)
└── storage.native.tsx  # Native implementation (AsyncStorage)
```

When importing `./storage`, the bundler resolves:
- **Web (rspack)**: `storage.web.tsx` (via extensions config)
- **Native (Metro)**: `storage.native.tsx` (via Metro's platform extensions)

## Guidelines

1. **Shared logic** goes in the module root (`hooks/`, `services/`, `types.tsx`)
2. **Platform UI** goes in `web/` or `native/` subdirectories
3. **Use `.web.tsx`/`.native.tsx`** for platform-specific implementations of shared interfaces
4. **Export from `index.tsx`** only what other modules need
