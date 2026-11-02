import type { Page } from '@playwright/test';

/**
 * Ce que l'application trouve dans son stockage au démarrage.
 *
 * Hors Tauri, `initStorage()` relit `localStorage` — c'est son mode navigateur,
 * écrit pour le développement. On s'en sert ici : une bibliothèque semée avant
 * le premier rendu donne une vraie galaxie, avec ses systèmes et ses planètes,
 * là où une bibliothèque vide ne donnerait qu'un ciel noir. Les commandes Rust,
 * elles, ne répondent pas : les scans échouent, et c'est sans conséquence
 * puisque rien n'efface ce qui a été semé (un scan en échec laisse sa
 * plateforme intacte).
 *
 * Les jeux sont faux mais plausibles : trois launchers, des tailles sur disque
 * crédibles, deux favoris. Assez pour que la galaxie ait trois soleils de
 * tailles différentes, ce qui est ce qu'on veut voir sur le film.
 */

const JEUX = [
  {
    id: 'steam-620',
    title: 'Portal 2',
    platform: 'Steam',
    installed: true,
    favorite: true,
    sizeOnDisk: 12_884_901_888,
  },
  {
    id: 'steam-440',
    title: 'Team Fortress 2',
    platform: 'Steam',
    installed: true,
    favorite: false,
    sizeOnDisk: 22_548_578_304,
  },
  {
    id: 'steam-105600',
    title: 'Terraria',
    platform: 'Steam',
    installed: true,
    favorite: false,
    sizeOnDisk: 1_073_741_824,
  },
  {
    id: 'steam-292030',
    title: 'The Witcher 3',
    platform: 'Steam',
    installed: true,
    favorite: false,
    sizeOnDisk: 53_687_091_200,
  },
  {
    id: 'epic-fortnite',
    title: 'Fortnite',
    platform: 'Epic',
    installed: true,
    favorite: false,
    sizeOnDisk: 42_949_672_960,
  },
  {
    id: 'epic-fall-guys',
    title: 'Fall Guys',
    platform: 'Epic',
    installed: true,
    favorite: true,
    sizeOnDisk: 3_221_225_472,
  },
  {
    id: 'riot-valorant',
    title: 'VALORANT',
    platform: 'Riot',
    installed: true,
    favorite: false,
    sizeOnDisk: 32_212_254_720,
  },
];

/**
 * Pose le stockage avant le chargement de la page.
 *
 * `addInitScript` s'exécute avant tout script de la page, donc avant
 * `initStorage()` : au moment où l'application lit, la bibliothèque est déjà là.
 */
export async function semer(page: Page): Promise<void> {
  await page.addInitScript((jeux) => {
    window.localStorage.setItem('archive.library.games.v1', JSON.stringify(jeux));
    // L'ouverture automatique des notes de version est coupée : leur modale n'a
    // pas à couvrir la galaxie sur chaque film, et un parcours lui est consacré
    // à part. On coupe la préférence plutôt que de marquer une version lue —
    // « lue » se compare au numéro de la version courante, qui change à chaque
    // publication, et le jour où il aurait changé tous les films auraient été
    // couverts par la modale sans qu'on comprenne pourquoi.
    window.localStorage.setItem('archive.patchNotes.auto', 'off');
  }, JEUX);
}

/**
 * Attend que la galaxie soit bâtie.
 *
 * La barre des launchers n'apparaît qu'une fois les systèmes placés : c'est le
 * signe le plus sûr que la scène est prête, et il vaut mieux que n'importe
 * quelle attente fixe.
 */
export async function attendreLaGalaxie(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Steam/ }).waitFor({ state: 'visible' });
  await page.locator('canvas').first().waitFor({ state: 'visible' });
}
