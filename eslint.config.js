import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      // Binários do Stockfish copiados para public/engine/ (JS minificado).
      'packages/web/public/engine/**',
    ],
  },

  // Base config for all TypeScript files.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Node-based packages (engine, server) e scripts de build (.mjs).
  {
    files: ['packages/engine/**/*.ts', 'packages/server/**/*.ts', '**/scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Browser-based package (web) with React.
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Turn off rules that conflict with Prettier — keep this last.
  prettier,
);
