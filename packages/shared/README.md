# @repo/shared

Shared TypeScript types, Zod schemas, and utility functions used across the monorepo.

## Usage

```typescript
import { UserSchema, type User } from '@repo/shared';

// Zod schema for validation
const result = UserSchema.safeParse(data);

// TypeScript type
const user: User = { id: '...', name: '...', email: '...' };
```

## Availability Utilities

The package provides comprehensive utilities for library availability:

### Types

```typescript
import type {
  CopyStatusCategory, // 'available' | 'checked_out' | 'in_transit' | ...
  CopyTotals, // { available: number, checkedOut: number, ... }
  EditionStatus, // 'japan_only' | 'not_released' | 'not_in_catalog' | ...
  VolumeDisplayStatus, // Combined edition + availability status
  VolumeDisplayInfo, // { status, label, icon, catalogUrl? }
} from '@repo/shared';
```

### Functions

```typescript
import {
  // Compute copy counts from holdings
  computeCopyTotals, // (copies: CopyWithStatus[]) => CopyTotals
  mergeCopyTotals, // (totals: CopyTotals[]) => CopyTotals

  // Get display status
  getStackRankedStatus, // (totals: CopyTotals) => CopyStatusCategory | null
  formatCopyTotalsDisplay, // (totals: CopyTotals) => "3 available, 1 checked out"

  // Volume display helpers
  deriveEditionStatus, // (editions?: Edition[]) => EditionStatus
  getVolumeDisplayStatus, // (editionStatus, copyTotals?) => VolumeDisplayStatus
  getFullVolumeDisplayInfo, // (editions?, copyTotals?, catalogUrl?) => VolumeDisplayInfo
} from '@repo/shared';
```

### Example

```typescript
import { computeCopyTotals, mergeCopyTotals, getFullVolumeDisplayInfo } from '@repo/shared';

// For detail views - derive from libraryHoldings
const allCopies = volume.libraryHoldings.flatMap((lh) => lh.copies);
const copyTotals = computeCopyTotals(allCopies);

// Or merge per-library totals
const copyTotals = mergeCopyTotals(
  volume.libraryHoldings.map((lh) => computeCopyTotals(lh.copies))
);

// Get display info
const info = getFullVolumeDisplayInfo(volume.editions, copyTotals, volume.catalogUrl);
// => { status: 'available', label: '✓ Available', icon: '✅' }
```

## Structure

```
src/
├── index.ts            # Public exports
├── availability.tsx    # Availability types and utilities
└── schemas/
    ├── index.ts        # Schema exports
    └── user.ts         # User schema (example)
```

## Adding New Schemas

1. Create schema file in `src/schemas/`:

```typescript
// src/schemas/manga.ts
import { z } from 'zod';

export const MangaSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  author: z.string(),
  volumes: z.number().int().positive(),
});

export type Manga = z.infer<typeof MangaSchema>;
```

2. Export from `src/schemas/index.ts`:

```typescript
export * from './user.js';
export * from './manga.js';
```

3. Run `pnpm build` to compile

**Note**: Use `.js` extensions in exports for ESM compatibility.

## Scripts

| Script           | Description                   |
| ---------------- | ----------------------------- |
| `pnpm build`     | Compile TypeScript to `dist/` |
| `pnpm typecheck` | TypeScript check              |

## Build Output

Compiled JavaScript and type declarations are output to `dist/`:

- `dist/index.js` - ESM module
- `dist/index.d.ts` - Type declarations

Other packages import from `dist/` via the `exports` field in `package.json`.
