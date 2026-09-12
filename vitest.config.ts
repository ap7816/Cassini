import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const tauriConf = JSON.parse(
  readFileSync(resolve(__dirname, 'src-tauri/tauri.conf.json'), 'utf-8'),
) as { version: string };

/**
 * Configuration à part de `vite.config.ts`.
 *
 * Celle de l'application est asynchrone et porte le serveur de développement,
 * le port fixe et la surveillance de fichiers — rien de tout cela n'a de sens
 * ici, et la mêler aux tests revenait à les faire dépendre de réglages qui
 * peuvent changer pour de tout autres raisons.
 *
 * Environnement Node et non jsdom : les modules vérifiés ici sont purs. Ceux
 * qui touchent au DOM demanderont jsdom, on l'ajoutera quand ce sera le cas
 * plutôt que de charger un navigateur simulé pour des fonctions qui calculent.
 */
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
