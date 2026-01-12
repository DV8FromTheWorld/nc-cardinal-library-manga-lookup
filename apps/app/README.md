# @repo/web

React web application for NC Cardinal Manga lookup.

## Tech Stack

- React 18
- rspack (bundler)
- TypeScript (strict mode)
- CSS Modules with CSS variables

## Development

```bash
# From monorepo root
pnpm dev --filter=@repo/web

# Or from this directory
pnpm dev
```

Runs at http://localhost:3000

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | TypeScript check |

## Project Structure

```
src/
├── index.tsx           # Entry point
├── App.tsx             # Root component
├── components/         # Shared reusable components
├── modules/            # Feature modules (vertical slices)
├── config/
│   └── env.tsx         # Environment config
├── styles/
│   └── variables.css   # CSS design system
└── types/
    ├── css.d.ts        # CSS modules types
    └── env.d.ts        # Environment types
```

## CSS Design System

All styling uses CSS variables defined in `src/styles/variables.css`:

**Spacing** (4px increments):
- `--spacing-xs`: 4px
- `--spacing-sm`: 8px
- `--spacing-md`: 16px
- `--spacing-lg`: 32px
- `--spacing-xl`: 64px

**Border Radius** (4px increments):
- `--radius-xs`: 4px
- `--radius-sm`: 8px
- `--radius-md`: 12px
- `--radius-lg`: 16px

**Theming**:
- Light theme: default
- Dark theme: `[data-theme="dark"]` on root
- System preference: auto-detected via `prefers-color-scheme`

## File Conventions

- Use `.tsx` for all TypeScript files (even without JSX)
- Use `.module.css` for component styles
- Use `.d.ts` only for type declarations
