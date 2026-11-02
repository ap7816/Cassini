import { defineConfig, devices } from '@playwright/test';

/**
 * Les tests de bout en bout : l'application vraiment ouverte, et le film de ce
 * qui s'y passe.
 *
 * Ils ne servent pas à comparer des images. Ils servent à **voir** : chaque cas
 * laisse une vidéo de son déroulé et des captures à ses moments clés, qu'on
 * regarde pour juger. Aucune assertion ne porte sur des pixels — un rendu 3D
 * change avec la carte graphique et le pilote, et un test qui échouerait pour
 * cette raison-là ne dirait rien d'utile.
 *
 * **Ce qui tourne ici est la version web de l'application**, servie par Vite :
 * React, la galaxie, les calques, les réglages. Le côté Rust n'y est pas — les
 * commandes Tauri échouent sans fenêtre native —, donc la bibliothèque est
 * **semée depuis le stockage du navigateur** (voir `e2e/semer.ts`), ce qui est
 * exactement ce que l'application relit au démarrage hors Tauri. Pour filmer la
 * vraie application installée, il faudrait `tauri-driver`, qui est une autre
 * histoire et un autre coût.
 *
 * Un seul ouvrier et pas de parallélisme : les vidéos d'une galaxie en WebGL se
 * disputeraient la carte graphique, et un film vaut mieux lent que haché.
 */
/**
 * Les coureurs de l'intégration continue n'ont pas de carte graphique.
 *
 * La galaxie s'y rend quand même, par le moteur logiciel de Chromium, mais
 * chaque image filmée oblige à relire les pixels depuis ce moteur — le
 * journal le dit lui-même, « GPU stall due to ReadPixels ». Filmer une scène
 * WebGL dans ces conditions coûte plus que de la jouer : à la première
 * tentative, les sept cas ont tenu trois minutes chacun et ont tous expiré
 * **pendant la fermeture du contexte**, c'est-à-dire pendant que la vidéo
 * finissait de s'encoder. Les captures, elles, étaient déjà prises.
 *
 * Le film reste donc une affaire de machine de développement, où il est
 * instantané et où quelqu'un le regarde. Sur la CI, où personne ne regarde,
 * c'est la trace qui est gardée en cas d'échec : elle porte les captures, le
 * DOM, le réseau et la console, et se rejoue pas à pas avec
 * `npx playwright show-trace`. Pour un diagnostic, elle vaut mieux qu'une
 * vidéo.
 */
const SUR_CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  outputDir: '.rapports/e2e/artefacts',
  fullyParallel: false,
  workers: 1,
  // La galaxie se construit en quelques secondes au premier chargement, et
  // bien plus lentement sur un coureur sans carte graphique, où Vite compile
  // en prime chaque route à la première visite.
  timeout: SUR_CI ? 180_000 : 90_000,
  expect: { timeout: SUR_CI ? 30_000 : 15_000 },
  reporter: [['list'], ['json', { outputFile: '.rapports/e2e/resultats.json' }]],
  use: {
    baseURL: 'http://localhost:1420',
    // En local, tout est filmé, même ce qui passe : c'est le but, pas un filet
    // de secours. Sur la CI, rien n'est filmé — voir plus haut.
    video: SUR_CI ? 'off' : { mode: 'on', size: { width: 1280, height: 800 } },
    screenshot: SUR_CI ? 'only-on-failure' : 'on',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
