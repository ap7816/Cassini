import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  // Ignore ce qui n'est pas du front
  {
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/**', 'coverage/**', '*.min.*'],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  // Les outils de `scripts/` tournent sous Node, et non dans le navigateur :
  // `process`, `console` et les modules `node:` y sont chez eux.
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React hooks
      ...reactHooks.configs.recommended.rules,

      'react-hooks/preserve-manual-memoization': 'off',
      // Vite / Fast refresh
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Qualité TS (tu peux durcir après)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Important: évite que ESLint se batte avec Prettier
  {
    rules: {
      ...(await import('eslint-config-prettier')).default.rules,
    },
  },
];
