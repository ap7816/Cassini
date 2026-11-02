import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { semer, attendreLaGalaxie } from './semer';

/** Voir l'en-tête de `playwright.config.ts` : sur coureur, on ne filme pas. */
const SUR_CI = !!process.env.CI;

/** Le temps qu'on laisse à la caméra, pour le film. Sans film, rien à laisser. */
const POSE_MS = SUR_CI ? 0 : 1;

/**
 * Des parcours, pas des pièges.
 *
 * Chacun de ces cas ouvre l'application et y fait ce qu'un utilisateur ferait.
 * Playwright en garde une vidéo complète et les captures posées en chemin ; les
 * assertions, elles, restent sur ce qui est vérifiable sans regarder — un
 * bouton présent, un calque ouvert, une page atteinte. **Rien n'est comparé en
 * pixels** : c'est à l'œil de juger du reste, et c'est tout l'objet du film.
 *
 * Les attentes fixes sont assumées là où elles filment quelque chose : un
 * voyage de caméra dure trois à six secondes selon la distance, et couper le
 * film à l'arrivée du premier point reviendrait à ne rien montrer du voyage.
 */

/**
 * Pose une capture nommée dans le rapport, en plus de la vidéo.
 *
 * Écrite sur le disque puis jointe **par son chemin**, et non par son contenu :
 * jointe par contenu, Playwright l'encode en base64 dans son JSON de résultats,
 * qui enflerait de plusieurs méga-octets et que le rapport devrait alors porter
 * en entier. Sur le disque, le rapport ne porte qu'un lien.
 */
async function capturer(page: Page, info: TestInfo, nom: string): Promise<void> {
  // Rien à poser sur un coureur d'intégration continue : il ne filme pas, et
  // personne n'y regarde de capture d'un cas qui passe. Photographier une
  // scène WebGL rendue en logiciel oblige à relire tout le tampon, et cela
  // seul mettait les cas à plusieurs minutes.
  if (SUR_CI) return;
  const fichier = info.outputPath(`${nom}.png`);
  await page.screenshot({ path: fichier });
  await info.attach(nom, { path: fichier, contentType: 'image/png' });
}

test.beforeEach(async ({ page }) => {
  await semer(page);
});

test('la galaxie au démarrage', async ({ page }, info) => {
  await page.goto('/solar');
  await attendreLaGalaxie(page);

  // Les trois launchers semés ont chacun leur système.
  await expect(page.getByRole('button', { name: /^Steam/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Epic/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Riot/ })).toBeVisible();
  // Et la liste des jeux du système courant.
  await expect(page.getByRole('button', { name: 'Portal 2' })).toBeVisible();

  await capturer(page, info, 'galaxie');
});

test('voyager d’un système à l’autre', async ({ page }, info) => {
  await page.goto('/solar');
  await attendreLaGalaxie(page);
  await capturer(page, info, '1-depart-steam');

  await page.getByRole('button', { name: /^Epic/ }).click();
  // Le voyage lui-même : c'est ce qu'on est venu voir. Les attentes sont là
  // pour le filmer — couper le film à l'arrivée du premier point reviendrait à
  // ne rien montrer du voyage. Sans film, elles n'attendent rien : l'assertion
  // qui suit attend déjà, et mieux, que le système d'arrivée soit là.
  await page.waitForTimeout(3000 * POSE_MS);
  await capturer(page, info, '2-en-vol');
  await page.waitForTimeout(3500 * POSE_MS);
  await capturer(page, info, '3-arrivee-epic');

  await expect(page.getByRole('button', { name: 'Fortnite' })).toBeVisible();

  await page.getByRole('button', { name: /^Riot/ }).click();
  await page.waitForTimeout(5000 * POSE_MS);
  await capturer(page, info, '4-arrivee-riot');
  await expect(page.getByRole('button', { name: 'VALORANT' })).toBeVisible();
});

test('la fiche d’un jeu', async ({ page }, info) => {
  await page.goto('/solar');
  await attendreLaGalaxie(page);

  await page.getByRole('button', { name: 'Portal 2' }).click();
  await expect(page.getByRole('button', { name: /Jouer|Lancer/ })).toBeVisible();
  await capturer(page, info, 'fiche-portal-2');
});

test('les réglages, onglet par onglet', async ({ page }, info) => {
  await page.goto('/solar');
  await attendreLaGalaxie(page);

  await page.getByRole('button', { name: 'Paramètres' }).click();
  await expect(page.getByRole('button', { name: 'Personnalisation' })).toBeVisible();

  for (const onglet of ['Personnalisation', 'Graphisme', 'Succès', 'Application']) {
    await page.getByRole('button', { name: onglet, exact: true }).click();
    await page.waitForTimeout(400);
    await capturer(page, info, `reglages-${onglet.toLowerCase()}`);
  }

  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('button', { name: 'Personnalisation' })).toBeHidden();
});

test('le lecteur de musique', async ({ page }, info) => {
  await page.goto('/solar');
  await attendreLaGalaxie(page);

  await page.getByRole('button', { name: 'Musique' }).click();
  await expect(page.getByRole('slider', { name: /Volume/ })).toBeVisible();
  await capturer(page, info, 'lecteur');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('slider', { name: /Volume/ })).toBeHidden();
});

test('la bibliothèque et le retour', async ({ page }, info) => {
  await page.goto('/library');

  // Ce que la page sait dire sans le côté natif : ses comptes, tirés de la
  // bibliothèque semée. Les vignettes, elles, demandent des jaquettes que seule
  // une commande Tauri sait aller chercher — hors de l'application, la grille
  // reste muette, et l'exiger ici ferait échouer le parcours pour une raison
  // qui n'existe pas chez l'utilisateur.
  await expect(page.getByRole('heading', { name: 'Bibliothèque' })).toBeVisible();
  await expect(page.getByText('7 jeux')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Favoris/ })).toBeVisible();
  await capturer(page, info, 'bibliotheque');

  await page.goto('/solar');
  await attendreLaGalaxie(page);
  await capturer(page, info, 'retour-galaxie');
});

test('les notes de version s’ouvrent pour une version jamais vue', async ({ page }, info) => {
  // Ce parcours-ci veut la modale : on rétablit donc l'ouverture automatique
  // que `semer` avait coupée, et on efface la version déjà lue.
  await page.addInitScript(() => {
    window.localStorage.removeItem('archive.patchNotes.auto');
    window.localStorage.removeItem('archive.patchNotes.seen');
  });
  await page.goto('/solar');

  const notes = page.getByText('Notes de mise à jour', { exact: false });
  await expect(notes.first()).toBeVisible();
  await capturer(page, info, 'notes-de-version');
});
