import eslint from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import reactPlugin from '@eslint-react/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['apps/app/rspack.config.ts', 'apps/native/babel.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.tsx', '**/*.ts'],
    ...reactPlugin.configs['recommended-type-checked'],
  },
  // React Hooks rules (official React linter)
  {
    files: ['**/*.tsx', '**/*.ts'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Import sorting
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  // ESLint directive comments (require explanations for eslint-disable)
  {
    plugins: {
      '@eslint-community/eslint-comments': eslintComments,
    },
    rules: {
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
    },
  },
  {
    rules: {
      // Require === but allow == null for null/undefined checks
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // KEY RULE: Disallow implicit boolean coercion
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false, // Disallow: if (str)
          allowNumber: false, // Disallow: if (num)
          allowNullableObject: true, // Allow: if (obj) for objects
          allowNullableBoolean: true, // Allow: if (bool) for booleans
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

      // React-specific rules adjustments
      // SSE handlers and prop-sync patterns legitimately need to call setters in useEffect
      '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 'off',

      // Enforce using `import type` for type-only imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],

      // Ensure all cases in switch statements on union types are handled
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Prefer ?? over || for nullish checks (|| treats '' and 0 as falsy)
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // Prefer ?. over && chains for optional access
      '@typescript-eslint/prefer-optional-chain': 'error',

      // Disallow non-null assertion (!) - forces proper null handling
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  // Accessibility rules for JSX
  {
    files: ['**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      '**/rspack.config.ts',
    ],
  },
  // Prettier - must be last to disable conflicting rules
  eslintConfigPrettier
);
