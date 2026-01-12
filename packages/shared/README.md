# @repo/shared

Shared TypeScript types and Zod schemas used across the monorepo.

## Usage

```typescript
import { UserSchema, type User } from '@repo/shared';

// Zod schema for validation
const result = UserSchema.safeParse(data);

// TypeScript type
const user: User = { id: '...', name: '...', email: '...' };
```

## Structure

```
src/
├── index.ts            # Public exports
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
export * from './user';
export * from './manga';
```

3. Run `pnpm build` to compile

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm typecheck` | TypeScript check |

## Build Output

Compiled JavaScript and type declarations are output to `dist/`:
- `dist/index.js` - CommonJS module
- `dist/index.d.ts` - Type declarations

Other packages import from `dist/` via the `exports` field in `package.json`.
