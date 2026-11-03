/**
 * Le banc d'essai : les deux suites de tests, un seul rapport.
 *
 * Les tests vivent de part et d'autre de la frontière — en TypeScript, que
 * Vitest sait montrer dans son interface, et en Rust, que `cargo test` ne sait
 * dire qu'au terminal. Compter sur deux fenêtres pour savoir si tout passe,
 * c'est ne regarder qu'une des deux.
 *
 * Ce script lance les deux, relit leurs résultats, **garde la trace du run**, et
 * écrit `rapport-tests.html`. Aucune dépendance : ni pour lancer, ni pour
 * dessiner. La page est autonome, polices comprises, et restera lisible dans
 * six mois sans rien réinstaller.
 *
 * Ce qu'un rapport de tests doit dire, et que l'instantané seul ne dit pas :
 *
 *  - **sur quoi** il a tourné — branche, révision, versions. Un rapport sans
 *    révision ne prouve rien ;
 *  - **d'où l'on vient** — la tendance des runs précédents ;
 *  - **ce qui vient de changer** — ce qui a cassé depuis le dernier run, ce qui
 *    a été réparé. C'est la seule question qu'on se pose vraiment en lisant un
 *    rapport.
 *
 * L'historique est gardé dans `.rapports/historique.json`, cinquante runs au
 * plus. Ce n'est pas du code : il n'est pas suivi par git.
 *
 * Usage : `npm run test:rapport`
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform, release } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendre } from './rapport-gabarit.mjs';

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const SORTIE = join(RACINE, 'rapport-tests.html');
const DOSSIER_HISTO = join(RACINE, '.rapports');
const HISTO = join(DOSSIER_HISTO, 'historique.json');
const E2E_RESULTATS = join(DOSSIER_HISTO, 'e2e', 'resultats.json');
const RUNS_GARDES = 50;
/** Au-delà, un cas est « lent » — le seuil des filtres de la page. */
const LENT_MS = 50;

/**
 * Nettoie la pile d'appels d'un échec.
 *
 * Vitest la rend entière, et les deux tiers des lignes désignent ses propres
 * fichiers dans `node_modules` : elles n'apprennent rien sur le test qui vient
 * de casser, et noient la seule ligne qui compte — celle du dépôt.
 */
function pileLisible(message) {
  return message
    .split(/\r?\n/)
    .filter((l) => !/node_modules[\\/]/.test(l))
    .filter(
      (l) => !/^\s+at (new Promise|runWithTimeout|runWithCancel|processTicksAndRejections)/.test(l),
    )
    .join('\n')
    .trim();
}

/** Exécute une commande et rend sa sortie, sans jamais jeter. */
function lancer(commande, cwd = RACINE) {
  const r = spawnSync(commande, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? 1, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

/** Première ligne d'une sortie de commande, ou un repli. */
function premiereLigne(commande, repli) {
  const { code, sortie } = lancer(commande);
  if (code !== 0) return repli;
  const l = sortie.trim().split(/\r?\n/)[0];
  return l || repli;
}

// ── Sur quoi ce run a tourné ─────────────────────────────────────────────────

function environnement() {
  const paquet = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
  const sale = lancer('git status --porcelain').sortie.trim().length > 0;
  return {
    branche: premiereLigne('git rev-parse --abbrev-ref HEAD', '(hors git)'),
    commit: premiereLigne('git rev-parse --short HEAD', '(sans révision)'),
    propre: !sale,
    version: `v${paquet.version}`,
    node: process.version,
    rustc: premiereLigne('rustc --version', 'rustc absent').replace(/ \(.*\)$/, ''),
    os: `${platform()} ${release()}`,
  };
}

// ── TypeScript ───────────────────────────────────────────────────────────────

/**
 * Vitest écrit son rapport en JSON dans un fichier temporaire.
 *
 * Et non sur la sortie standard : il y mêle ses lignes de progression, et le
 * JSON n'y est plus analysable.
 */
function suiteTypeScript() {
  const dossier = mkdtempSync(join(tmpdir(), 'cassini-tests-'));
  const fichier = join(dossier, 'vitest.json');
  const { sortie } = lancer(`npx vitest run --reporter=json --outputFile="${fichier}"`);

  let brut;
  try {
    brut = JSON.parse(readFileSync(fichier, 'utf8'));
  } catch {
    return {
      id: 'ts',
      nom: 'TypeScript · Vitest',
      commande: 'npm test',
      erreur: sortie.trim().slice(-4000),
      groupes: [],
    };
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }

  const groupes = brut.testResults.map((f) => ({
    nom: relative(RACINE, f.name).split('\\').join('/'),
    tests: f.assertionResults.map((t) => ({
      nom: t.title,
      ok: t.status === 'passed',
      ignore: t.status === 'skipped' || t.status === 'pending',
      ms: t.duration ?? 0,
      echec: pileLisible((t.failureMessages ?? []).join('\n')),
    })),
  }));

  groupes.sort((a, b) => b.tests.length - a.tests.length);
  return { id: 'ts', nom: 'TypeScript · Vitest', commande: 'npm test', groupes };
}

// ── Rust ─────────────────────────────────────────────────────────────────────

/**
 * `cargo test` n'a pas de sortie structurée stable, mais son format de ligne,
 * lui, ne change pas : `test <module>::<nom> ... ok`. On s'appuie sur cela, et
 * sur rien d'autre. Les durées par cas n'y figurent pas — libtest ne les donne
 * qu'au total, d'où des durées nulles de ce côté.
 */
function suiteRust() {
  const { sortie, code } = lancer('cargo test --lib', join(RACINE, 'src-tauri'));
  const parModule = new Map();

  for (const ligne of sortie.split(/\r?\n/)) {
    const m = /^test (\S+) \.\.\. (ok|FAILED|ignored)/.exec(ligne.trim());
    if (!m) continue;
    const chemin = m[1];
    const coupe = chemin.lastIndexOf('::');
    const module = coupe === -1 ? '(racine)' : chemin.slice(0, coupe);
    const nom = coupe === -1 ? chemin : chemin.slice(coupe + 2);
    if (!parModule.has(module)) parModule.set(module, []);
    parModule.get(module).push({
      nom,
      ok: m[2] === 'ok',
      ignore: m[2] === 'ignored',
      ms: 0,
      echec: '',
    });
  }

  if (parModule.size === 0) {
    return {
      id: 'rs',
      nom: 'Rust · cargo test',
      commande: 'cargo test --lib',
      erreur: sortie.trim().slice(-4000),
      groupes: [],
    };
  }

  // Le détail des échecs est rassemblé en fin de sortie, sous « failures: ».
  const debut = sortie.indexOf('\nfailures:');
  const detailEchecs = code === 0 || debut === -1 ? '' : sortie.slice(debut).trim().slice(0, 8000);

  const groupes = [...parModule.entries()]
    .map(([nom, tests]) => ({ nom, tests }))
    .sort((a, b) => b.tests.length - a.tests.length);

  return {
    id: 'rs',
    nom: 'Rust · cargo test',
    commande: 'cargo test --lib',
    groupes,
    detailEchecs,
  };
}

// ── Bout en bout ─────────────────────────────────────────────────────────────

/**
 * Les parcours Playwright : l'application vraiment ouverte, et le film.
 *
 * À part des deux autres suites, et lancée seulement sur demande (`--e2e`) :
 * elle dure une minute et demie là où les 254 autres durent six secondes, et on
 * ne la joue pas au même moment. Les anciens résultats sont relus tels quels si
 * on ne la relance pas, de sorte qu'un rapport garde le dernier film connu.
 *
 * Les artefacts restent sur le disque : le rapport ne porte que des liens
 * relatifs, résolus depuis la racine du dépôt où il est écrit.
 */
function suiteBoutEnBout(relancer) {
  if (relancer) {
    process.stdout.write('· parcours Playwright (une minute et demie)…\n');
    // Le navigateur d'abord. Playwright ne le télécharge pas à
    // l'installation des paquets, et npm bloque de toute façon les scripts
    // d'installation sur les versions récentes : sans cette ligne, les sept
    // parcours tombent tous sur « Executable doesn't exist », ce qui ne
    // ressemble en rien à un échec de test.
    lancer('npx playwright install chromium');
    lancer('npx playwright test');
  }

  let brut;
  try {
    brut = JSON.parse(readFileSync(E2E_RESULTATS, 'utf8'));
  } catch {
    return null;
  }

  /** Chemin d'artefact relatif à la racine, utilisable tel quel dans la page. */
  const relatif = (p) => relative(RACINE, p).split('\\').join('/');

  const groupes = [];
  const visiter = (suite, prefixe) => {
    const tests = [];
    for (const spec of suite.specs ?? []) {
      const resultat = spec.tests?.[0]?.results?.[0];
      if (!resultat) continue;
      const joints = (resultat.attachments ?? []).filter((a) => a.path);
      tests.push({
        nom: spec.title,
        ok: spec.ok === true,
        ignore: resultat.status === 'skipped',
        ms: resultat.duration ?? 0,
        echec: pileLisible((resultat.errors ?? []).map((e) => e.message ?? '').join('\n')),
        artefacts: {
          captures: joints
            .filter((a) => a.contentType === 'image/png')
            .map((a) => ({ nom: a.name, src: relatif(a.path) })),
          videos: joints
            .filter((a) => (a.contentType ?? '').startsWith('video/'))
            .map((a) => ({ nom: a.name, src: relatif(a.path) })),
        },
      });
    }
    if (tests.length) groupes.push({ nom: prefixe + (suite.title ?? ''), tests });
    for (const fille of suite.suites ?? []) visiter(fille, prefixe);
  };
  for (const s of brut.suites ?? []) visiter(s, '');

  if (!groupes.length) return null;
  return {
    id: 'e2e',
    nom: 'Parcours · Playwright',
    commande: 'npx playwright test',
    groupes,
  };
}

// ── Compter, comparer, garder ────────────────────────────────────────────────

/** Identifiant stable d'un cas, pour comparer deux runs entre eux. */
const identifiant = (suite, groupe, test) => `${suite.id}:${groupe.nom}:${test.nom}`;

function parcourir(suites) {
  const tous = [];
  for (const s of suites) {
    for (const g of s.groupes) {
      for (const t of g.tests)
        tous.push({ ...t, id: identifiant(s, g, t), suite: s.id, groupe: g.nom });
    }
  }
  return tous;
}

function compter(tous) {
  const ignores = tous.filter((t) => t.ignore).length;
  const rates = tous.filter((t) => !t.ok && !t.ignore).length;
  return { total: tous.length, rates, ignores, passes: tous.length - rates - ignores };
}

function lireHistorique() {
  try {
    const d = JSON.parse(readFileSync(HISTO, 'utf8'));
    return Array.isArray(d.runs) ? d.runs : [];
  } catch {
    return [];
  }
}

function ecrireHistorique(runs) {
  if (!existsSync(DOSSIER_HISTO)) mkdirSync(DOSSIER_HISTO, { recursive: true });
  writeFileSync(HISTO, JSON.stringify({ runs: runs.slice(-RUNS_GARDES) }, null, 2), 'utf8');
}

/**
 * Ce qui a changé depuis le run précédent.
 *
 * `nouveaux` ne retient que ce qui existait déjà et qui passait : un cas écrit
 * aujourd'hui et rouge d'emblée est un cas ajouté, pas une régression.
 *
 * Et `repares` exige que le cas soit toujours là : un test rouge qu'on
 * supprime n'est pas un test réparé, et compter sa disparition comme une
 * victoire serait le plus sûr moyen de se mentir.
 */
function comparer(tous, precedent) {
  if (!precedent) return null;
  const avant = new Set(precedent.echecs ?? []);
  const connus = new Set(precedent.cas ?? []);
  const presents = new Set(tous.map((t) => t.id));
  const maintenant = tous.filter((t) => !t.ok && !t.ignore).map((t) => t.id);
  const ensemble = new Set(maintenant);

  const court = (id) => id.split(':').slice(1).join(' › ');
  return {
    nouveaux: maintenant.filter((id) => !avant.has(id) && connus.has(id)).map(court),
    repares: [...avant].filter((id) => !ensemble.has(id) && presents.has(id)).map(court),
    ajoutes: tous.filter((t) => !connus.has(t.id)).map((t) => court(t.id)),
  };
}

/** Les polices de l'application, embarquées pour que la page tienne seule. */
function polices() {
  const lire = (chemin) => {
    try {
      return readFileSync(join(RACINE, 'node_modules', chemin)).toString('base64');
    } catch {
      return '';
    }
  };
  return {
    mono: lire('@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2'),
    titre: lire('@fontsource/chakra-petch/files/chakra-petch-latin-500-normal.woff2'),
  };
}

// ── Déroulé ──────────────────────────────────────────────────────────────────

// `--e2e` relance les parcours ; sans lui, leurs derniers résultats sont relus.
const relancerE2E = process.argv.includes('--e2e');

const depart = Date.now();
process.stdout.write('· suite TypeScript…\n');
const ts = suiteTypeScript();
process.stdout.write('· suite Rust…\n');
const rust = suiteRust();
const e2e = suiteBoutEnBout(relancerE2E);
// La durée couvre tout ce que ce run a réellement lancé, parcours compris.
const dureeMs = Date.now() - depart;
const suites = e2e ? [ts, rust, e2e] : [ts, rust];
const tous = parcourir(suites);
const totaux = { ...compter(tous), dureeMs };

const historique = lireHistorique();
const precedent = historique[historique.length - 1] ?? null;
const numero = (precedent?.numero ?? 0) + 1;

const entree = {
  numero,
  date: new Date().toISOString(),
  total: totaux.total,
  passes: totaux.passes,
  rates: totaux.rates,
  ignores: totaux.ignores,
  dureeMs,
  echecs: tous.filter((t) => !t.ok && !t.ignore).map((t) => t.id),
  cas: tous.map((t) => t.id),
};

// Les huit plus lents, quelle que soit leur durée : le classement est ce qu'on
// lit, pas le franchissement d'un seuil. `LENT_MS` ne sert qu'au filtre de la
// page, où l'on cherche au contraire ce qui dépasse.
const lents = tous
  .filter((t) => t.ms > 0)
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 8)
  .map((t) => ({ nom: `${t.groupe.split('/').pop()} › ${t.nom}`, ms: t.ms }));

writeFileSync(
  SORTIE,
  rendre({
    run: {
      numero,
      date: new Date().toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }),
    },
    env: environnement(),
    totaux,
    suites,
    historique,
    diff: comparer(tous, precedent),
    lents,
    seuilLent: LENT_MS,
    polices: polices(),
  }),
  'utf8',
);

ecrireHistorique([...historique, entree]);

process.stdout.write(
  `\nRun #${numero} — ${totaux.total} cas : ${totaux.passes} passés, ${totaux.rates} en échec` +
    `${totaux.ignores ? `, ${totaux.ignores} ignorés` : ''} (${(dureeMs / 1000).toFixed(1)} s)\n` +
    `Rapport : ${SORTIE}\n`,
);
process.exit(totaux.rates === 0 ? 0 : 1);
