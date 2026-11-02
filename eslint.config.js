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
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        // `captures-readme.mjs` passe des fonctions au navigateur via
        // `addInitScript` : elles s'exécutent dans la page, pas sous Node.
        window: 'readonly',
      },
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

  // Un fournisseur de contexte et le hook qui le consomme vivent dans le même
  // fichier. C'est le découpage que documente React, et le seul qui garde le
  // contexte privé : `ToastCtx` n'est jamais exporté, donc personne ne peut
  // l'utiliser sans passer par `useToast` et sa vérification de montage.
  //
  // Fast refresh ne sait pas rafraîchir à chaud un module qui exporte autre
  // chose que des composants : éditer un de ces fichiers recharge la page au
  // lieu de remplacer le composant. C'est le prix, il ne coûte qu'en
  // développement, et il est plus petit que quatre fichiers de plus dont le
  // seul rôle serait de contenter l'outil.
  {
    files: [
      'src/components/Tags/Tags.tsx',
      'src/features/music/MusicContext.tsx',
      'src/features/patchNotes/PatchNotesContext.tsx',
      'src/features/toast/ToastContext.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Important: évite que ESLint se batte avec Prettier
  {
    rules: {
      ...(await import('eslint-config-prettier')).default.rules,
    },
  },
];
