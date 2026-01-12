# Design System

Platform-specific reusable UI components with shared type definitions.

## Structure

```
design/
├── types.tsx          # Shared type definitions
├── theme.tsx          # Shared theme constants (colors, spacing, typography)
└── components/        # Component implementations
    └── Text/
        ├── web/       # Web implementation
        │   ├── Text.tsx
        │   └── Text.module.css
        └── native/    # React Native implementation
            └── Text.tsx
```

## Conventions

- Each component has platform-specific implementations
- Web components use CSS Modules (`.module.css`)
- Native components use StyleSheet
- Types are shared between platforms
- Keep components simple and focused
- Document props with TypeScript interfaces

---

## Components

### Text

The `<Text>` component enforces consistent typography across the app.

#### Usage

```tsx
// Web
import { Text } from '../design/components/Text/web/Text';

// Native
import { Text } from '../design/components/Text/native/Text';
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `TextVariant` | **required** | Defines font size, family, and line height |
| `color` | `TextColor` | `'text-primary'` | Text color from the design system |
| `tag` | `TextTag` | `'span'` | HTML tag (web only) |
| `children` | `ReactNode` | **required** | Content |
| `className` | `string` | — | Additional CSS classes (web only) |
| `style` | — | — | Platform-specific styles |

#### Variants

Format: `{type}-{size}/{weight}` or `code`

**Text variants:**
- `text-xs/normal`, `text-xs/medium`, `text-xs/semibold`, `text-xs/bold`
- `text-sm/normal`, `text-sm/medium`, `text-sm/semibold`, `text-sm/bold`
- `text-md/normal`, `text-md/medium`, `text-md/semibold`, `text-md/bold`
- `text-lg/normal`, `text-lg/medium`, `text-lg/semibold`, `text-lg/bold`
- `text-xl/normal`, `text-xl/medium`, `text-xl/semibold`, `text-xl/bold`

**Header variants:**
- `header-sm/normal`, `header-sm/medium`, `header-sm/semibold`, `header-sm/bold`
- `header-md/normal`, `header-md/medium`, `header-md/semibold`, `header-md/bold`
- `header-lg/normal`, `header-lg/medium`, `header-lg/semibold`, `header-lg/bold`
- `header-xl/normal`, `header-xl/medium`, `header-xl/semibold`, `header-xl/bold`
- `header-2xl/normal`, `header-2xl/medium`, `header-2xl/semibold`, `header-2xl/bold`

**Special:**
- `code` — Monospace text for code snippets

#### Colors

**Semantic text:**
- `text-primary` — Primary text color
- `text-secondary` — Secondary/supporting text
- `text-muted` — Muted/disabled text

**Interactive:**
- `interactive-primary` — Links and interactive elements
- `interactive-hover` — Hover state for interactive elements
- `interactive-active` — Active/pressed state for interactive elements

**Status:**
- `accent` — Brand accent color
- `success` — Success messages
- `warning` — Warning messages
- `error` — Error messages

**Special:**
- `currentColor` — Inherit from parent's color
- `none` — No color (inherit)

#### Tags (Web only)

Default: `span`

Allowed: `span`, `div`, `p`, `strong`, `li`, `label`

#### Examples

```tsx
// Body text
<Text variant="text-md/normal">Regular body text</Text>

// Small muted label
<Text variant="text-sm/medium" color="text-muted">
  Updated 2 hours ago
</Text>

// Section header
<Text variant="header-lg/bold" tag="h2">
  Available Volumes
</Text>

// Error message
<Text variant="text-sm/medium" color="error">
  Failed to load data
</Text>

// Code snippet
<Text variant="code">npm install react</Text>

// Form label
<Text variant="text-sm/semibold" tag="label" htmlFor="email">
  Email Address
</Text>
```

---

## Theme

### Typography

| Token | Size | Used for |
|-------|------|----------|
| `text-xs` | 12px | Captions, badges |
| `text-sm` | 14px | Labels, metadata |
| `text-md` | 16px | Body text |
| `text-lg` | 18px | Large body text |
| `text-xl` | 20px | Lead text |
| `header-sm` | 18px | Small headings |
| `header-md` | 22px | Section headings |
| `header-lg` | 28px | Page headings |
| `header-xl` | 36px | Hero headings |
| `header-2xl` | 48px | Display headings |

### Font Weights

| Token | Weight | Used for |
|-------|--------|----------|
| `normal` | 400 | Body text |
| `medium` | 500 | Labels, emphasis |
| `semibold` | 600 | Headings, buttons |
| `bold` | 700 | Strong emphasis |

### Font Families

| Type | Family |
|------|--------|
| Sans | DM Sans |
| Serif | Crimson Pro |
| Mono | JetBrains Mono |
