# TypeScript & ESLint Strict Boolean Configuration Guide

This guide explains how to set up strict boolean expressions and path aliasing in a TypeScript project.

## 1. TypeScript Configuration (`tsconfig.json`)

Ensure these options are enabled:

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**`exactOptionalPropertyTypes`** requires you to explicitly include `undefined` in optional types:

```typescript
// With exactOptionalPropertyTypes: true
interface User {
  name: string;
  bio?: string | undefined;  // Must include | undefined
}
```

---

## 2. ESLint Configuration

### Install Dependencies

```bash
pnpm add -D eslint @eslint/js typescript-eslint @eslint-react/eslint-plugin
```

### Create `eslint.config.js`

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from '@eslint-react/eslint-plugin';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.tsx', '**/*.ts'],
    ...reactPlugin.configs['recommended-type-checked'],
  },
  {
    rules: {
      // Require === but allow == null for null/undefined checks
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // KEY RULE: Disallow implicit boolean coercion
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,        // Disallow: if (str)
          allowNumber: false,        // Disallow: if (num)
          allowNullableObject: true, // Allow: if (obj) for objects
          allowNullableBoolean: true,// Allow: if (bool) for booleans
          allowNullableString: false,
          allowNullableNumber: false,
          allowNullableEnum: false,
          allowAny: false,
        },
      ],

      // Prevent {count && <Component />} rendering "0" in JSX
      '@eslint-react/no-leaked-conditional-rendering': 'error',

      // Allow unused vars prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Practical adjustments for common patterns
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs'],
  }
);
```

### Add to `package.json`

```json
{
  "type": "module",
  "scripts": {
    "lint": "eslint src/"
  }
}
```

---

## 3. Code Patterns Enforced

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| `if (value) { }` | `if (value != null) { }` |
| `{error && <Error />}` | `{error !== null ? <Error /> : null}` |
| `{item.name && <Name />}` | `{item.name !== undefined ? <Name /> : null}` |
| `str ? a : b` (str is string) | `str !== '' ? a : b` |

**Key principle**: Use `!= null` (loose equality) to check both `null` and `undefined` in one check.

---

## 4. Path Alias Configuration (`@/` imports)

### TypeScript (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Rspack/Webpack (`rspack.config.ts` or `webpack.config.js`)

```typescript
import { resolve } from 'path';

export default {
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
};
```

### React Native / Metro (`babel.config.js`)

```javascript
const path = require('path');

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': path.resolve(__dirname, '../app/src'), // Adjust path as needed
          },
        },
      ],
    ],
  };
};
```

**Required dependency:**

```bash
pnpm add -D babel-plugin-module-resolver
```

### Usage

```typescript
// Instead of:
import { Text } from '../../../design/components/Text/web/Text';

// Use:
import { Text } from '@/design/components/Text/web/Text';
```

---

## Quick Setup Checklist

1. [ ] Add `"type": "module"` to root `package.json`
2. [ ] Install ESLint dependencies
3. [ ] Create `eslint.config.js` with strict-boolean-expressions
4. [ ] Add `lint` script to package.json
5. [ ] Configure `paths` in tsconfig.json for `@/` alias
6. [ ] Configure bundler (Rspack/Webpack) with `resolve.alias`
7. [ ] Configure Babel with `module-resolver` plugin (for React Native)
8. [ ] Run `pnpm lint` and fix any violations
