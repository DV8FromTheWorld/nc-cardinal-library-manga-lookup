import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from '@eslint-react/eslint-plugin';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'apps/app/rspack.config.ts',
            'apps/native/babel.config.js',
          ],
        },
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

      // React-specific rules adjustments
      // SSE handlers and prop-sync patterns legitimately need to call setters in useEffect
      '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs', '**/rspack.config.ts'],
  }
);
