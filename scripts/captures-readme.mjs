/**
 * Les images du README, refaites à la commande.
 *
 *     npm run captures
 *
 * Une capture d'écran collée une fois dans un README vieillit sans qu'on s'en
 * aperçoive : l'interface change, l'image reste. Ce script la refabrique en une
 * minute, à partir de l'application telle qu'elle est.
 *
 * Ce qui tourne ici est la version web servie par Vite, comme pour les
 * parcours de `e2e/` : React, la galaxie, les calques. La bibliothèque est
 * semée dans le stockage du navigateur — c'est ce que l'application relit au
 * démarrage hors Tauri — avec de vrais identifiants Steam, de sorte que les
 * jaquettes arrivent du CDN et que les planètes portent l'affiche du jeu
 * qu'elles représentent.
 *
 * Le serveur de développement est démarré puis arrêté par le script : rien à
 * lancer à côté.
 */

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ADRESSE = 'http://localhost:1420';
const DOSSIER = 'docs/images';
const LARGEUR = 1600;
const HAUTEUR = 1000;
/** Le voyage d'un système à l'autre dure de trois à six secondes selon la distance. */
const DUREE_VOYAGE = 6.5;

/**
 * La bibliothèque semée : vingt jeux sur six launchers.
 *
 * Les identifiants Steam sont réels, et c'est voulu — l'URL de la jaquette se
 * calcule depuis l'AppID sans aucune clé, donc l'application affiche la vraie
 * affiche sans rien demander à personne. Les tailles et les temps de jeu sont
 * inventés mais plausibles : c'est ce qui donne aux systèmes des soleils de
 * tailles différentes, et à la fiche de jeu quelque chose à montrer.
 */
const JEUX = [
  ['steam-620', 'Portal 2', 'Steam', '620', 12.9, 1840, true],
  ['steam-440', 'Team Fortress 2', 'Steam', '440', 22.5, 7320, false],
  ['steam-292030', 'The Witcher 3: Wild Hunt', 'Steam', '292030', 53.7, 11_400, true],
  ['steam-105600', 'Terraria', 'Steam', '105600', 1.1, 4260, false],
  ['steam-1091500', 'Cyberpunk 2077', 'Steam', '1091500', 78.4, 3180, false],
  ['steam-271590', 'Grand Theft Auto V', 'Steam', '271590', 94.2, 2640, false],
  ['steam-1174180', 'Red Dead Redemption 2', 'Steam', '1174180', 118.6, 1920, true],
  ['steam-739630', 'Phasmophobia', 'Steam', '739630', 14.2, 960, false],
  ['steam-648800', 'Raft', 'Steam', '648800', 3.8, 720, false],
  ['epic-fortnite', 'Fortnite', 'Epic', null, 42.9, null, false],
  ['epic-fall-guys', 'Fall Guys', 'Epic', null, 3.2, null, true],
  ['epic-rocket-league', 'Rocket League', 'Epic', null, 23.1, null, false],
  ['epic-alan-wake-2', 'Alan Wake 2', 'Epic', null, 89.3, null, false],
  ['riot-valorant', 'VALORANT', 'Riot', null, 32.2, null, false],
  ['riot-lol', 'League of Legends', 'Riot', null, 28.7, null, false],
  ['bnet-overwatch', 'Overwatch 2', 'BattleNet', null, 51.4, null, false],
  ['bnet-diablo4', 'Diablo IV', 'BattleNet', null, 86.1, null, false],
  ['ubi-valhalla', "Assassin's Creed Valhalla", 'Ubisoft', null, 102.5, null, false],
  ['rockstar-rdr2', 'Red Dead Redemption 2', 'Rockstar', null, 112.0, null, false],
  ['gog-cyberpunk', 'Cyberpunk 2077', 'GOG', null, 76.8, null, false],
].map(([id, title, platform, steamAppId, gio, minutes, favorite]) => ({
  id,
  title,
  platform,
  steamAppId,
  installed: true,
  favorite,
  sizeOnDisk: Math.round(gio * 1024 * 1024 * 1024),
  playtimeMinutes: minutes,
  // Une date pour les jeux dont le launcher tient un temps de jeu : sans elle
  // la fiche affiche « 190 heures jouées » puis « Jamais joué » sur la ligne
  // suivante, ce qui est exact mais se lit mal sur une capture.
  lastPlayedAt: minutes ? new Date(Date.now() - 86_400_000 * 3).toISOString() : null,
}));

const semences = {
  'archive.library.games.v1': JSON.stringify(JEUX),
  // Pas de modale de notes de version par-dessus la galaxie.
  'archive.patchNotes.auto': 'off',
};

/** Démarre Vite et rend la main quand il répond. */
async function demarrerVite() {
  if (await repond()) {
    console.log('Vite répond déjà sur ' + ADRESSE + ' — je le réutilise.');
    return null;
  }
  console.log('Démarrage de Vite…');
  const vite = spawn('npm', ['run', 'dev'], { shell: true, stdio: 'ignore' });
  const limite = Date.now() + 90_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 500));
    if (await repond()) return vite;
  }
  vite.kill();
  throw new Error("Vite n'a pas répondu en 90 secondes.");
}

async function repond() {
  try {
    const r = await fetch(ADRESSE, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Une page semée, posée sur la galaxie et prête à être photographiée. */
async function ouvrir(navigateur, options = {}) {
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR },
    locale: 'fr-FR',
    ...options,
  });
  const page = await contexte.newPage();
  await page.addInitScript((s) => {
    for (const [cle, valeur] of Object.entries(s)) window.localStorage.setItem(cle, valeur);
  }, semences);
  return { contexte, page };
}

async function attendreLaGalaxie(page) {
  await page.getByRole('button', { name: /^Steam/ }).waitFor({ state: 'visible' });
  await page.locator('canvas').first().waitFor({ state: 'visible' });
  // Les jaquettes arrivent du CDN Steam et deviennent les textures des
  // planètes : sans cette pause, on photographie des sphères grises.
  await page.waitForTimeout(4000);
}

async function photo(page, nom) {
  const chemin = join(DOSSIER, nom + '.png');
  await page.screenshot({ path: chemin });
  console.log('  ' + chemin);
}

/**
 * Le voyage entre deux systèmes, en GIF.
 *
 * Playwright filme en WebM ; le README veut un GIF, que GitHub joue tout seul
 * dans la page. La conversion passe par le ffmpeg que Playwright installe avec
 * ses navigateurs — rien à installer de plus. La palette est calculée sur
 * l'ensemble des images avant d'être appliquée : un dégradé de nébuleuse rendu
 * sur la palette par défaut se couvre de bandes.
 */
async function filmerLeVoyage(navigateur) {
  const brut = join(DOSSIER, '.film');
  await rm(brut, { recursive: true, force: true });

  const { contexte, page } = await ouvrir(navigateur, {
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: brut, size: { width: 1280, height: 720 } },
  });
  // L'enregistrement commence avec le contexte : tout ce qui précède le clic
  // est du chargement, et ne doit pas se retrouver dans le GIF. On note donc
  // l'instant du départ pour découper au bon endroit, plutôt que de deviner.
  const t0 = Date.now();
  await page.goto(ADRESSE + '/solar');
  await attendreLaGalaxie(page);

  const depart = (Date.now() - t0) / 1000;
  await page.getByRole('button', { name: /^Epic/ }).click();
  await page.waitForTimeout(DUREE_VOYAGE * 1000 + 800);
  await contexte.close();

  const webm = (await readdir(brut)).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error("Playwright n'a pas écrit de vidéo.");

  const entree = join(brut, webm);
  const ffmpeg = await trouverFfmpeg();
  if (!ffmpeg) {
    // Pas de ffmpeg : on garde le film tel que Playwright l'a écrit. Le README
    // n'aura pas son GIF, mais la vidéo existe et se regarde.
    const garde = join(DOSSIER, 'voyage.webm');
    await rename(entree, garde);
    await rm(brut, { recursive: true, force: true });
    console.log('  ' + garde + '  (ffmpeg introuvable : pas de GIF)');
    console.log('  Installe ffmpeg, ou indique-le : FFMPEG=/chemin/vers/ffmpeg npm run captures');
    return;
  }

  // Un GIF pèse ce que lui coûte le bruit, et un ciel étoilé n'est que du
  // bruit. D'où le tramage coupé — il ajoute un grain qui double le poids pour
  // un dégradé à peine plus doux — une palette courte, et dix images par
  // seconde, assez pour un mouvement de caméra lent.
  const gif = join(DOSSIER, 'voyage.gif');
  const filtre =
    'fps=10,scale=640:-1:flags=lanczos,split[a][b];' +
    '[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none';
  await executer(ffmpeg, [
    '-y',
    // `-ss` après `-i` : le découpage se fait à l'image près, là où un
    // découpage en entrée se cale sur l'image-clé précédente — et le VP8 de
    // Playwright en pose peu.
    '-i',
    entree,
    '-ss',
    String(Math.max(0, depart - 0.4)),
    '-t',
    String(DUREE_VOYAGE + 0.8),
    '-vf',
    filtre,
    '-loop',
    '0',
    gif,
  ]);
  await rm(brut, { recursive: true, force: true });
  console.log('  ' + gif);
}

/**
 * Un ffmpeg capable d'écrire un GIF.
 *
 * Celui que Playwright installe avec ses navigateurs ne convient pas : c'est
 * une build réduite à l'enregistrement WebM, sans le format GIF en sortie ni
 * les filtres de palette. On cherche donc un vrai ffmpeg — celui que la
 * variable `FFMPEG` désigne, ou celui du PATH.
 */
async function trouverFfmpeg() {
  const designe = process.env.FFMPEG;
  if (designe && existsSync(designe)) return designe;
  try {
    await executer('ffmpeg', ['-version']);
    return 'ffmpeg';
  } catch {
    return null;
  }
}

function executer(commande, args) {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(commande, args, { stdio: 'ignore' });
    p.on('error', rejeter);
    p.on('close', (code) =>
      code === 0 ? resoudre() : rejeter(new Error(commande + ' a rendu ' + code)),
    );
  });
}

async function principal() {
  await mkdir(DOSSIER, { recursive: true });
  const vite = await demarrerVite();
  const navigateur = await chromium.launch();
  try {
    console.log('Captures :');

    // La galaxie, qui est la page d'accueil et la pièce maîtresse.
    {
      const { contexte, page } = await ouvrir(navigateur);
      await page.goto(ADRESSE + '/solar');
      await attendreLaGalaxie(page);
      await photo(page, 'galaxie');

      // La fiche d'un jeu, ouverte par-dessus la scène.
      await page.getByRole('button', { name: 'The Witcher 3: Wild Hunt' }).click();
      await page.getByRole('button', { name: /Jouer|Lancer/ }).waitFor({ state: 'visible' });
      await page.waitForTimeout(1500);
      await photo(page, 'fiche-jeu');

      // Retour à la galaxie par un rechargement plutôt qu'en fermant le
      // panneau : Échap ne le ferme pas, et son bouton de fermeture porte le
      // même nom accessible que celui des calques.
      await page.goto(ADRESSE + '/solar');
      await attendreLaGalaxie(page);

      // Les réglages, sur l'onglet qui montre le plus de matière.
      await page.getByRole('button', { name: 'Paramètres' }).click();
      const reglages = page.getByRole('dialog', { name: 'Paramètres' });
      await page.getByRole('button', { name: 'Graphisme', exact: true }).click();
      await page.waitForTimeout(800);
      await photo(page, 'reglages');
      await reglages.getByRole('button', { name: 'Fermer' }).click();

      // Le lecteur de musique.
      await page.getByRole('button', { name: 'Musique' }).click();
      await page.getByRole('slider', { name: /Volume/ }).waitFor({ state: 'visible' });
      await page.waitForTimeout(800);
      await photo(page, 'lecteur-musique');
      await contexte.close();
    }

    // La bibliothèque, sur sa propre page.
    {
      const { contexte, page } = await ouvrir(navigateur);
      await page.goto(ADRESSE + '/library');
      await page.getByRole('heading', { name: 'Bibliothèque' }).waitFor({ state: 'visible' });
      await page.waitForTimeout(3000);
      await photo(page, 'bibliotheque');
      await contexte.close();
    }

    console.log('Film du voyage :');
    await filmerLeVoyage(navigateur);

    await writeFile(
      join(DOSSIER, 'LISEZMOI.md'),
      [
        '# Images du README',
        '',
        'Produites par `npm run captures` (voir `scripts/captures-readme.mjs`), et',
        "non à la main : quand l'interface change, on relance la commande.",
        '',
        "La bibliothèque qui s'y affiche est semée pour la capture — vingt jeux",
        'inventés sur six launchers. Les affiches viennent du CDN Steam, calculées',
        "depuis l'AppID : elles appartiennent à leurs éditeurs et ne sont montrées",
        "que pour illustrer l'application.",
        '',
      ].join('\n'),
    );
  } finally {
    await navigateur.close();
    if (vite) {
      // Vite est lancé via npm sous un shell : tuer le père laisse le fils.
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' });
      } else {
        vite.kill('SIGTERM');
      }
      console.log('Vite arrêté.');
    }
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
