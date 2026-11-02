/**
 * La page du banc d'essai.
 *
 * Séparée du collecteur parce que ce sont deux métiers : l'un lance les suites
 * et relit leurs résultats, l'autre décide de ce qu'on voit. On peut changer
 * l'un sans relire l'autre.
 *
 * **Ce n'est pas un tableau de bord générique.** Le vocabulaire est celui du
 * reste de l'application — crochets d'angle, trame de balayage, chasse fixe,
 * jauges segmentées, voyants qui battent —, celui du tableau de bord et du
 * journal des succès. Ce qu'on y lit vient en revanche des outils du métier :
 * l'identité du run avant tout, le verdict en un coup d'œil, la tendance des
 * runs précédents, l'écart avec le run d'avant, puis seulement le détail.
 *
 * ── Lisibilité ──────────────────────────────────────────────────────────────
 *
 * La première version était jolie et illisible : du texte à onze pixels, des
 * gris à 3,6 de contraste, des lignes collées les unes aux autres. Trois règles
 * en sont sorties, et elles priment sur l'allure :
 *
 *  1. **Rien sous 0,8 rem**, et le corps du rapport — les noms de cas, ce qu'on
 *     lit vraiment — à 0,95. Les tailles sont en `rem` et la base n'est pas
 *     forcée : qui agrandit la police de son navigateur agrandit la page.
 *  2. **Tout passe AA**, 4,5 pour le texte et 3 pour les bordures porteuses de
 *     sens. Les valeurs ne sont pas choisies à l'œil mais calculées sur le fond
 *     réel, vitre comprise — les trois qui échouaient sont notées ci-dessous.
 *  3. **De l'air.** Une ligne de cas respire, un fichier se distingue du
 *     suivant, et la densité ne vient plus de la compression mais du pliage :
 *     ce qu'on n'a pas demandé reste fermé.
 *
 * Contrastes mesurés sur le fond composite de chaque thème — sombre
 * `rgb(9 19 31)`, clair `rgb(253 254 254)` :
 *
 *                  texte  doux  faible  accent  vert  rouge  cadre de bouton
 *     sombre        17,1  10,7     6,0     5,6  12,3    7,7              3,6
 *     clair         16,2  11,6     8,1     6,2   6,2    6,9              4,4
 *
 * Les trois valeurs qui échouaient dans la version précédente — `--faible` à
 * 3,6, les numéros de cas à 3,3 et les cadres de boutons à 2,2 — sont remontées
 * au-dessus du seuil. Les filets qui ne font que séparer des lignes restent
 * discrets : ils ne portent aucune information que le texte ne porte déjà.
 *
 * Le thème clair suit la préférence du système : lire du clair sur du sombre
 * n'est pas confortable pour tout le monde, et c'est un réglage que personne ne
 * devrait avoir à demander.
 */

const echappe = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/**
 * Au-delà, un cas est « lent » — le seuil du filtre de la page.
 *
 * Posé par `rendre()`, et non figé ici : le collecteur en est seul maître, de
 * sorte qu'on ne puisse pas marquer un cas lent d'un côté et l'écrire
 * autrement dans le libellé du filtre de l'autre.
 */
let seuilLent = 50;

/** Durée lisible : on ne lit pas « 4127 ms » du premier coup d'œil. */
function duree(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

/**
 * Jauge segmentée : un bloc par tranche de 5 %.
 *
 * Masquée aux lecteurs d'écran : le compte exact est juste à côté, et vingt
 * blocs annoncés un à un ne diraient rien de plus en vingt fois plus de temps.
 */
function jauge(part, etat) {
  const pleins = Math.round(part * 20);
  let html = '<span class="jauge" aria-hidden="true">';
  for (let i = 0; i < 20; i += 1) {
    html += `<span class="bloc${i < pleins ? ' plein ' + etat : ''}"></span>`;
  }
  return html + '</span>';
}

/** Le mot d'un état, pour qui ne voit ni la couleur ni le symbole. */
const motEtat = { ok: 'passé', ko: 'en échec', ignore: 'ignoré' };

/**
 * Les pièces laissées par un parcours : les captures, et le film.
 *
 * Elles ne prouvent rien — aucune assertion ne porte dessus — et c'est l'idée :
 * elles sont là pour être regardées, et pour qu'on voie de ses yeux ce que le
 * test a fait. D'où le pliage : on les ouvre quand on veut regarder, et le
 * rapport n'en est pas encombré le reste du temps.
 *
 * Les adresses sont relatives à la racine du dépôt, où la page est écrite, et
 * passées par `encodeURI` — les dossiers de Playwright portent les titres des
 * cas, accents et apostrophes compris.
 */
function rendreArtefacts(a) {
  if (!a || (!a.captures.length && !a.videos.length)) return '';
  const lien = (src) => encodeURI(src);

  const captures = a.captures.length
    ? `<div class="vignettes">${a.captures
        .map(
          (c) =>
            `<a class="vignette" href="${lien(c.src)}" target="_blank" rel="noopener">
               <img src="${lien(c.src)}" alt="Capture « ${echappe(c.nom)} »" loading="lazy" width="320">
               <span>${echappe(c.nom)}</span>
             </a>`,
        )
        .join('')}</div>`
    : '';

  const videos = a.videos
    .map(
      (v) =>
        `<video class="film" src="${lien(v.src)}" controls preload="none" width="640">
           <a href="${lien(v.src)}">Télécharger la vidéo du parcours</a>
         </video>`,
    )
    .join('');

  const compte = [
    a.videos.length ? `${a.videos.length} vidéo${a.videos.length > 1 ? 's' : ''}` : '',
    a.captures.length ? `${a.captures.length} capture${a.captures.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return `<details class="artefacts">
    <summary>Artefacts — ${compte}</summary>
    ${videos}
    ${captures}
  </details>`;
}

/** Un cas de test, ligne par ligne, numéroté comme une entrée de journal. */
function rendreCas(t, i) {
  const etat = t.ignore ? 'ignore' : t.ok ? 'ok' : 'ko';
  const signe = t.ignore ? '—' : t.ok ? '✓' : '✕';
  return `<li class="cas ${etat}" data-etat="${etat}" data-lent="${t.ms >= seuilLent ? '1' : '0'}" data-nom="${echappe(t.nom.toLowerCase())}">
  <span class="num">${String(i + 1).padStart(3, '0')}</span>
  <span class="signe" title="${motEtat[etat]}"><span aria-hidden="true">${signe}</span><span class="hors-ecran">${motEtat[etat]}</span></span>
  <span class="nom">${echappe(t.nom)}</span>
  <span class="ms">${t.ms ? duree(t.ms) : ''}</span>
  ${t.echec ? `<pre class="echec">${echappe(t.echec)}</pre>` : ''}
  ${rendreArtefacts(t.artefacts)}
</li>`;
}

/** Un fichier de tests ou un module Rust : l'unité qu'on ouvre et qu'on referme. */
function rendreGroupe(g) {
  const rates = g.tests.filter((t) => !t.ok && !t.ignore).length;
  const ignores = g.tests.filter((t) => t.ignore).length;
  const ms = g.tests.reduce((n, t) => n + t.ms, 0);
  const passes = g.tests.length - rates - ignores;
  const part = g.tests.length ? passes / g.tests.length : 1;
  const etat = rates ? 'ko' : ignores ? 'ignore' : 'ok';

  return `<details class="groupe ${etat}" data-etat="${etat}" data-chemin="${echappe(g.nom.toLowerCase())}"${rates ? ' open' : ''}>
  <summary>
    <span class="voyant ${etat}" aria-hidden="true"></span>
    <span class="chemin">${echappe(g.nom)}</span>
    ${jauge(part, etat)}
    <span class="compte"><b>${passes}</b><span class="hors-ecran"> cas passés sur </span><span aria-hidden="true">/</span>${g.tests.length}</span>
    <span class="ms">${ms ? duree(ms) : ''}</span>
  </summary>
  <ol class="cas-liste">${g.tests.map(rendreCas).join('')}</ol>
</details>`;
}

/** Une suite entière : les fichiers d'un même langage. */
function rendreSuite(s) {
  if (s.erreur) {
    return `<section class="suite" id="suite-${s.id}" aria-labelledby="titre-${s.id}">
      <h2 id="titre-${s.id}"><span class="voyant ko" aria-hidden="true"></span>${echappe(s.nom)}</h2>
      <div class="panne">
        <p>La suite n'a pas pu être lue. Sortie brute :</p>
        <pre>${echappe(s.erreur)}</pre>
      </div>
    </section>`;
  }

  const tests = s.groupes.flatMap((g) => g.tests);
  const rates = tests.filter((t) => !t.ok && !t.ignore).length;
  const ms = tests.reduce((n, t) => n + t.ms, 0);

  return `<section class="suite" id="suite-${s.id}" aria-labelledby="titre-${s.id}">
  <h2 id="titre-${s.id}">
    <span class="voyant ${rates ? 'ko' : 'ok'}" aria-hidden="true"></span>
    ${echappe(s.nom)}
    <code>${echappe(s.commande ?? '')}</code>
    <span class="tete-compte">${tests.length} cas · ${duree(ms)}</span>
  </h2>
  ${s.groupes.map(rendreGroupe).join('')}
  ${s.detailEchecs ? `<pre class="echec">${echappe(s.detailEchecs)}</pre>` : ''}
</section>`;
}

/**
 * La tendance : un bâton par run, le dernier à droite.
 *
 * La hauteur dit le nombre de cas — une suite qui maigrit se voit —, et le
 * bâton est empilé : la part verte pour ce qui passe, la rouge pour ce qui
 * casse. Un dessin ne se lit pas à voix haute : le graphique porte donc un
 * résumé en toutes lettres, et le détail de chaque run reste en texte dessous,
 * replié.
 */
function rendreTendance(historique, courant) {
  const runs = [...historique.slice(-24), courant];
  if (runs.length < 2) {
    return `<p class="vide">Premier run enregistré. La tendance se dessinera à partir du suivant.</p>`;
  }
  const max = Math.max(...runs.map((r) => r.total), 1);
  const casses = runs.filter((r) => r.rates > 0).length;
  const resume =
    `Tendance sur ${runs.length} runs, du plus ancien au plus récent : ` +
    `de ${runs[0].total} à ${runs[runs.length - 1].total} cas, ` +
    (casses === 0 ? 'aucun run en échec.' : `${casses} run(s) en échec.`);

  const barres = runs
    .map((r) => {
      const h = Math.max(8, Math.round((r.total / max) * 100));
      const pct = r.total ? Math.round(((r.total - r.rates) / r.total) * 100) : 100;
      const titre = `Run #${r.numero} — ${r.total} cas, ${r.rates} échec(s), ${pct} %`;
      return `<span class="baton${r.numero === courant.numero ? ' courant' : ''}" style="--h:${h}%" title="${echappe(titre)}">
        <span class="pile">
          ${r.rates ? `<i class="part-ko" style="flex:${r.rates}"></i>` : ''}
          <i class="part-ok" style="flex:${Math.max(0, r.total - r.rates)}"></i>
        </span>
        <em>${r.numero}</em>
      </span>`;
    })
    .join('');

  const lignes = runs
    .slice()
    .reverse()
    .map(
      (r) =>
        `<li>Run #${r.numero} — ${r.total} cas, ${r.rates} échec${r.rates > 1 ? 's' : ''}</li>`,
    )
    .join('');

  return `<div class="tendance" role="img" aria-label="${echappe(resume)}">${barres}</div>
  <details class="detail-tendance">
    <summary>Détail des runs</summary>
    <ol class="runs">${lignes}</ol>
  </details>`;
}

/** Ce qui a changé depuis le run précédent — la question qu'on se pose vraiment. */
function rendreComparaison(diff) {
  if (!diff) return `<p class="vide">Aucun run antérieur : rien à comparer.</p>`;

  const bloc = (titre, liste, etat) => `
    <div class="delta ${etat}">
      <span class="delta-n">${liste.length}</span>
      <span class="delta-l">${titre}</span>
      ${
        liste.length
          ? `<ul>${liste
              .slice(0, 6)
              .map((n) => `<li>${echappe(n)}</li>`)
              .join(
                '',
              )}${liste.length > 6 ? `<li class="et-plus">et ${liste.length - 6} autre(s)</li>` : ''}</ul>`
          : ''
      }
    </div>`;

  return `<div class="deltas">
    ${bloc('nouveaux échecs', diff.nouveaux, 'ko')}
    ${bloc('réparés', diff.repares, 'ok')}
    ${bloc('cas ajoutés', diff.ajoutes, 'neutre')}
  </div>`;
}

export function rendre(d) {
  const { run, env, totaux, suites, historique, diff, lents, polices } = d;
  if (d.seuilLent) seuilLent = d.seuilLent;
  const part = totaux.total ? totaux.passes / totaux.total : 1;
  const verdict =
    totaux.rates === 0 ? 'TOUT PASSE' : `${totaux.rates} ÉCHEC${totaux.rates > 1 ? 'S' : ''}`;
  const etatGlobal = totaux.rates === 0 ? 'ok' : 'ko';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Banc d'essai — Cassini · Run #${run.numero} · ${verdict}</title>
<style>
@font-face {
  font-family: 'Share Tech Mono';
  src: url(data:font/woff2;base64,${polices.mono}) format('woff2');
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: 'Chakra Petch';
  src: url(data:font/woff2;base64,${polices.titre}) format('woff2');
  font-weight: 500; font-display: swap;
}

/* ── Jetons ──────────────────────────────────────────────────────────────
   Les opacités ne sont pas décoratives : chacune a été calculée pour passer
   4,5 sur le fond composite (3 pour les bordures). Les baisser, c'est casser
   la lisibilité — pas seulement l'allure. */
:root {
  --hud: 111 220 255;
  --ok: 126 231 160;
  --ko: 255 128 128;
  --alerte: 255 190 110;

  --texte: #e8f7ff;
  --doux: rgb(198 230 244 / 0.86);      /* 9,8 : sous-titres, noms de cas   */
  --faible: rgb(186 216 232 / 0.66);    /* 4,9 : libellés, durées, compteurs */
  --accent-doux: rgb(var(--hud) / 0.65);/* 5,0 : numéros, petites mentions  */

  --fond: #04080f;
  --vitre: rgb(10 22 36 / 0.78);
  --vitre-forte: rgb(5 12 22 / 0.97);
  --ligne: rgb(var(--hud) / 0.28);
  --ligne-forte: rgb(var(--hud) / 0.48);

  --ui: 'Chakra Petch', 'Segoe UI', system-ui, sans-serif;
  --mono: 'Share Tech Mono', ui-monospace, Consolas, monospace;
  --crochets:
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 0 0 / 12px 1px no-repeat,
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 0 0 / 1px 12px no-repeat,
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 100% 0 / 12px 1px no-repeat,
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 100% 0 / 1px 12px no-repeat,
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 0 100% / 12px 1px no-repeat,
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 0 100% / 1px 12px no-repeat,
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 100% 100% / 12px 1px no-repeat,
    linear-gradient(rgb(var(--hud) / 0.75) 0 0) 100% 100% / 1px 12px no-repeat;
  --trame: repeating-linear-gradient(0deg, rgb(var(--hud) / 0.025) 0 1px, transparent 1px 3px);
  color-scheme: dark;
}

/* Le thème clair du système. Mêmes mesures, autres valeurs : l'accent passe au
   bleu sombre de la structure, qui tient 7,4 sur le blanc cassé. */
@media (prefers-color-scheme: light) {
  :root {
    --hud: 0 76 118;
    --ok: 21 110 60;
    --ko: 176 28 28;
    --alerte: 140 78 0;

    --texte: #0b2134;
    --doux: rgb(14 42 62 / 0.92);
    --faible: rgb(22 54 76 / 0.86);
    --accent-doux: rgb(var(--hud) / 0.85);

    --fond: #eef3f7;
    --vitre: rgb(255 255 255 / 0.9);
    --vitre-forte: rgb(252 254 255 / 0.98);
    /* L'accent clair est sombre sur fond blanc : il lui faut plus d'opacité
       pour que le cadre d'un bouton atteigne les 3 exigés d'un élément
       d'interface. Mesuré, pas estimé. */
    --ligne: rgb(var(--hud) / 0.4);
    --ligne-forte: rgb(var(--hud) / 0.72);
    --trame: repeating-linear-gradient(0deg, rgb(var(--hud) / 0.035) 0 1px, transparent 1px 3px);
    color-scheme: light;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 0 0 72px;
  background:
    radial-gradient(1200px 600px at 50% -10%, rgb(var(--hud) / 0.07), transparent 70%),
    var(--fond);
  color: var(--texte);
  font-family: var(--ui);
  /* Pas de taille en pixels sur le corps : la base du navigateur fait foi, et
     qui l'a montée voit la page monter avec. */
  font-size: 1rem;
  line-height: 1.6;
}
.page { max-width: 1180px; margin: 0 auto; padding: 0 24px; }

/* Ce qui n'est que pour les lecteurs d'écran. */
.hors-ecran {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}

/* Le focus se voit, partout, et il ne dépend pas de la couleur seule : c'est un
   cadre plein, décalé du bord. */
:where(a, button, summary, input):focus-visible {
  outline: 2px solid rgb(var(--hud));
  outline-offset: 2px;
  border-radius: 1px;
}

.saut {
  position: absolute; left: 24px; top: -3rem; z-index: 20;
  background: var(--vitre-forte); color: var(--texte);
  border: 1px solid rgb(var(--hud)); padding: 10px 16px;
  font-family: var(--mono); font-size: 0.9rem; text-decoration: none;
  transition: top 0.15s ease;
}
.saut:focus { top: 12px; }

/* ── Le bandeau d'identité ───────────────────────────────────────────────── */

.bandeau {
  position: sticky; top: 0; z-index: 10;
  background: var(--trame), var(--vitre-forte);
  border-bottom: 1px solid var(--ligne-forte);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
}
.bandeau .page { padding-top: 16px; padding-bottom: 14px; }
.ligne1 { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
.marque {
  margin: 0;
  font-family: var(--mono); font-size: 0.95rem; font-weight: 400;
  letter-spacing: 0.22em; color: rgb(var(--hud)); text-transform: uppercase;
}
.marque b { color: var(--texte); font-weight: 400; }
.run {
  margin-left: auto; font-family: var(--mono); font-size: 0.95rem;
  color: var(--doux); letter-spacing: 0.06em;
}
.run b { color: rgb(var(--hud)); font-weight: 400; }

.verdict-ligne { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; margin-top: 12px; }
.verdict {
  display: flex; align-items: center; gap: 12px;
  font-family: var(--mono); font-size: 1.6rem; letter-spacing: 0.1em;
}
.verdict.ok { color: rgb(var(--ok)); }
.verdict.ko { color: rgb(var(--ko)); }

.voyant {
  width: 10px; height: 10px; border-radius: 50%; flex: none;
  background: rgb(var(--ok)); box-shadow: 0 0 10px rgb(var(--ok) / 0.8);
  animation: battre 2.4s ease-in-out infinite;
}
.voyant.ko { background: rgb(var(--ko)); box-shadow: 0 0 10px rgb(var(--ko) / 0.8); animation-duration: 1.1s; }
.voyant.ignore { background: rgb(var(--alerte)); box-shadow: 0 0 10px rgb(var(--alerte) / 0.7); }
@keyframes battre { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.chiffres { display: flex; gap: 26px; margin-left: auto; font-family: var(--mono); flex-wrap: wrap; }
.chiffre { text-align: right; }
.chiffre b { display: block; font-size: 1.3rem; font-weight: 400; line-height: 1.2; }
.chiffre span { font-size: 0.8rem; letter-spacing: 0.1em; color: var(--faible); text-transform: uppercase; }
.chiffre.ok b { color: rgb(var(--ok)); }
.chiffre.ko b { color: ${totaux.rates ? 'rgb(var(--ko))' : 'var(--faible)'}; }

.env {
  margin: 12px 0 0; padding-top: 11px; border-top: 1px solid var(--ligne);
  font-family: var(--mono); font-size: 0.875rem; color: var(--faible);
  display: flex; gap: 12px; flex-wrap: wrap; list-style: none;
}
.env li { white-space: nowrap; }
.env li::after { content: ' ·'; color: var(--accent-doux); }
.env li:last-child::after { content: ''; }
.env .sale { color: rgb(var(--alerte)); }

/* ── Les trois cadrans ──────────────────────────────────────────────────── */

/* Des minimums, et non des parts : à parts égales, la colonne du milieu
   tombait sous la largeur de ses propres libellés, et « nouveaux échecs »
   passait à la ligne au milieu d'un mot. */
.cadrans {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(265px, 1fr) minmax(390px, 1.5fr);
  gap: 16px; margin: 24px 0 28px;
}
.cadran {
  background: var(--crochets), var(--trame), var(--vitre);
  border: 1px solid var(--ligne); padding: 16px 18px 18px;
}
.cadran h2 {
  margin: 0 0 14px; font-family: var(--mono); font-size: 0.85rem;
  letter-spacing: 0.16em; text-transform: uppercase; color: rgb(var(--hud));
  font-weight: 400;
}
.vide { color: var(--faible); font-family: var(--mono); font-size: 0.9rem; margin: 0; }

.tendance { display: flex; align-items: flex-end; gap: 6px; height: 104px; overflow-x: auto; }
.baton {
  flex: 0 0 auto; width: 16px; height: 100%;
  display: flex; flex-direction: column; justify-content: flex-end;
}
.pile {
  display: flex; flex-direction: column; height: var(--h);
  border: 1px solid var(--ligne-forte); border-bottom: 0;
  background: rgb(var(--hud) / 0.06);
}
.part-ok { background: rgb(var(--ok) / 0.8); border-top: 2px solid rgb(var(--ok)); min-height: 2px; }
.part-ko { background: rgb(var(--ko) / 0.85); border-top: 2px solid rgb(var(--ko)); min-height: 4px; }
.baton.courant .pile { border-color: rgb(var(--hud)); box-shadow: 0 0 12px rgb(var(--hud) / 0.35); }
.baton em {
  font-family: var(--mono); font-size: 0.8rem; color: var(--faible);
  font-style: normal; text-align: center; padding-top: 6px;
}
.baton.courant em { color: rgb(var(--hud)); }

.detail-tendance { margin-top: 10px; }
.detail-tendance summary {
  font-family: var(--mono); font-size: 0.85rem; color: var(--faible); cursor: pointer;
}
.detail-tendance summary:hover { color: var(--texte); }
.runs { margin: 8px 0 0; padding-left: 1.2em; font-family: var(--mono); font-size: 0.85rem; color: var(--doux); }

.deltas { display: flex; flex-direction: column; gap: 14px; }
.delta { display: grid; grid-template-columns: 2.2rem 1fr; align-items: baseline; gap: 12px; }
.delta-n { font-family: var(--mono); font-size: 1.25rem; text-align: right; }
.delta.ko .delta-n { color: rgb(var(--ko)); }
.delta.ok .delta-n { color: rgb(var(--ok)); }
.delta.neutre .delta-n { color: var(--doux); }
.delta-l { font-size: 0.875rem; color: var(--faible); text-transform: uppercase; letter-spacing: 0.08em; }
.delta ul {
  grid-column: 2; margin: 4px 0 0; padding: 0; list-style: none;
  font-family: var(--mono); font-size: 0.85rem; color: var(--doux);
}
.delta .et-plus { color: var(--faible); }

.lents { margin: 0; padding: 0; list-style: none; font-family: var(--mono); font-size: 0.875rem; }
.lents li { display: flex; gap: 10px; padding: 3px 0; color: var(--doux); }
.lents .r { color: var(--accent-doux); width: 1.2rem; flex: none; text-align: right; }
.lents .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lents .v { color: var(--texte); }

/* ── La barre de commandes ──────────────────────────────────────────────── */

.commandes {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 8px; padding-bottom: 14px; border-bottom: 1px solid var(--ligne);
}
.filtre {
  font-family: var(--mono); font-size: 0.875rem; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--doux); background: transparent; border: 1px solid var(--ligne-forte);
  padding: 8px 14px; cursor: pointer; transition: color .15s, border-color .15s, background .15s;
}
.filtre:hover { color: var(--texte); border-color: rgb(var(--hud)); }
.filtre[aria-pressed="true"] {
  color: var(--fond); background: rgb(var(--hud)); border-color: rgb(var(--hud)); font-weight: 500;
}
.recherche {
  margin-left: auto; display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--ligne-forte); padding: 6px 12px; min-width: 260px;
}
.recherche:focus-within { border-color: rgb(var(--hud)); box-shadow: 0 0 0 2px rgb(var(--hud) / 0.3); }
.recherche .touche {
  font-family: var(--mono); font-size: 0.85rem; color: var(--accent-doux);
  border: 1px solid var(--ligne); padding: 0 6px; line-height: 1.4;
}
.recherche input {
  flex: 1; background: transparent; border: 0; color: var(--texte);
  font-family: var(--mono); font-size: 0.95rem; min-width: 0;
}
.recherche input:focus-visible { outline: none; }
.recherche input::placeholder { color: var(--faible); opacity: 1; }

.compte-filtre {
  margin: 0 0 18px; font-family: var(--mono); font-size: 0.875rem; color: var(--faible);
}

/* ── Les suites ─────────────────────────────────────────────────────────── */

.suite { margin-bottom: 32px; }
.suite[hidden] { display: none; }
.suite h2 {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin: 0 0 12px; font-size: 1.1rem; font-weight: 500; letter-spacing: 0.02em;
}
.suite h2 code { font-family: var(--mono); font-size: 0.85rem; color: var(--faible); font-weight: 400; }
.tete-compte { margin-left: auto; font-family: var(--mono); font-size: 0.875rem; color: var(--doux); }

.groupe {
  border: 1px solid var(--ligne); border-left: 3px solid rgb(var(--ok));
  margin-bottom: 6px; background: var(--vitre);
}
.groupe.ko { border-left-color: rgb(var(--ko)); }
.groupe.ignore { border-left-color: rgb(var(--alerte)); }
.groupe[hidden] { display: none; }
.groupe summary {
  display: flex; align-items: center; gap: 14px; padding: 11px 16px;
  cursor: pointer; font-family: var(--mono); font-size: 1rem; list-style: none;
}
.groupe summary::-webkit-details-marker { display: none; }
.groupe summary:hover { background: rgb(var(--hud) / 0.07); }
.groupe .voyant { animation: none; width: 8px; height: 8px; }
.chemin { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--texte); }
.compte { font-variant-numeric: tabular-nums; color: var(--faible); }
.compte b { color: var(--texte); font-weight: 400; }
.ms { font-size: 0.875rem; color: var(--faible); min-width: 4.5rem; text-align: right; }

.jauge { display: flex; gap: 2px; flex: none; }
.bloc { width: 6px; height: 12px; border: 1px solid rgb(var(--hud) / 0.3); }
.bloc.plein.ok { background: rgb(var(--ok) / 0.85); border-color: rgb(var(--ok)); }
.bloc.plein.ko { background: rgb(var(--ko) / 0.85); border-color: rgb(var(--ko)); }
.bloc.plein.ignore { background: rgb(var(--alerte) / 0.85); border-color: rgb(var(--alerte)); }

.cas-liste { margin: 0; padding: 8px 16px 14px; list-style: none; }
.cas {
  display: grid; grid-template-columns: 2.6rem 1.2rem 1fr auto; align-items: baseline;
  gap: 10px; padding: 4px 0; font-family: var(--mono); font-size: 0.95rem;
}
.cas + .cas { border-top: 1px solid rgb(var(--hud) / 0.08); }
.cas[hidden] { display: none; }
.cas .num { color: var(--accent-doux); font-size: 0.875rem; }
.cas .nom { color: var(--doux); }
.cas.ok .signe { color: rgb(var(--ok)); }
.cas.ko .signe, .cas.ko .nom { color: rgb(var(--ko)); }
.cas.ignore .signe, .cas.ignore .nom { color: var(--faible); }

.echec {
  grid-column: 1 / -1; margin: 8px 0 10px; padding: 12px 14px;
  background: rgb(var(--ko) / 0.08); border: 1px solid rgb(var(--ko) / 0.45);
  color: var(--texte); font-family: var(--mono); font-size: 0.9rem;
  white-space: pre-wrap; overflow-x: auto; line-height: 1.5;
}
/* Les pièces d'un parcours : un film et des captures, pliés. */
.artefacts { grid-column: 1 / -1; margin: 6px 0 10px; }
.artefacts > summary {
  display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
  font-family: var(--mono); font-size: 0.875rem; color: var(--accent-doux);
  padding: 4px 0;
}
.artefacts > summary:hover { color: rgb(var(--hud)); }
.artefacts > summary::before { content: '▸'; }
.artefacts[open] > summary::before { content: '▾'; }
.film {
  display: block; max-width: 100%; margin: 8px 0 12px;
  border: 1px solid var(--ligne-forte); background: #000;
}
.vignettes { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; }
.vignette {
  display: block; text-decoration: none; color: var(--faible);
  font-family: var(--mono); font-size: 0.8rem; max-width: 320px;
}
.vignette img {
  display: block; width: 100%; height: auto;
  border: 1px solid var(--ligne); background: #000;
}
.vignette:hover { color: var(--texte); }
.vignette:hover img { border-color: rgb(var(--hud)); }
.vignette span { display: block; padding-top: 4px; }

.panne { border: 1px solid rgb(var(--ko) / 0.5); padding: 14px 16px; }
.panne p { margin: 0 0 10px; font-family: var(--mono); font-size: 0.95rem; color: rgb(var(--ko)); }
.panne pre { margin: 0; font-family: var(--mono); font-size: 0.875rem; color: var(--doux); white-space: pre-wrap; max-height: 320px; overflow: auto; }

.rien {
  display: none; font-family: var(--mono); font-size: 0.95rem; color: var(--doux);
  border: 1px dashed var(--ligne-forte); padding: 22px; text-align: center;
}
body.sans-resultat .rien { display: block; }

footer {
  margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--ligne);
  font-family: var(--mono); font-size: 0.875rem; color: var(--faible);
  display: flex; gap: 18px; flex-wrap: wrap;
}
footer code { color: var(--texte); }

@media (max-width: 980px) {
  .cadrans { grid-template-columns: 1fr; }
  .chiffres { width: 100%; margin-left: 0; justify-content: space-between; gap: 14px; }
  .recherche { margin-left: 0; width: 100%; }
  .ms { min-width: 0; }
}
@media (max-width: 600px) {
  .page { padding: 0 16px; }
  .verdict { font-size: 1.35rem; }
  .cas { grid-template-columns: 2.2rem 1.2rem 1fr; }
  .cas .ms { grid-column: 3; text-align: left; }
  .groupe summary { flex-wrap: wrap; }
  .jauge { order: 3; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
  .voyant { opacity: 1; }
}
</style>
</head>
<body>

<a class="saut" href="#resultats">Aller aux résultats</a>

<header class="bandeau">
  <div class="page">
    <div class="ligne1">
      <h1 class="marque">Cassini · <b>Banc d'essai</b></h1>
      <p class="run">RUN <b>#${run.numero}</b> · ${echappe(run.date)}</p>
    </div>
    <div class="verdict-ligne">
      <p class="verdict ${etatGlobal}">
        <span class="voyant ${etatGlobal}" aria-hidden="true"></span>${verdict}
      </p>
      <div class="chiffres">
        <span class="chiffre"><b>${totaux.total}</b><span>cas</span></span>
        <span class="chiffre ok"><b>${totaux.passes}</b><span>passés</span></span>
        <span class="chiffre ko"><b>${totaux.rates}</b><span>échecs</span></span>
        <span class="chiffre"><b>${totaux.ignores}</b><span>ignorés</span></span>
        <span class="chiffre"><b>${Math.round(part * 100)} %</b><span>réussite</span></span>
        <span class="chiffre"><b>${duree(totaux.dureeMs)}</b><span>durée</span></span>
      </div>
    </div>
    <ul class="env">
      <li>branche ${echappe(env.branche)}</li>
      <li${env.propre ? '' : ' class="sale"'}>${echappe(env.commit)}${env.propre ? '' : ' (modifié)'}</li>
      <li>Cassini ${echappe(env.version)}</li>
      <li>node ${echappe(env.node)}</li>
      <li>${echappe(env.rustc)}</li>
      <li>${echappe(env.os)}</li>
    </ul>
  </div>
</header>

<main class="page">

  <div class="cadrans">
    <section class="cadran" aria-labelledby="t-tendance">
      <h2 id="t-tendance">Tendance · ${historique.length + 1} run${historique.length ? 's' : ''}</h2>
      ${rendreTendance(historique, { ...totaux, numero: run.numero })}
    </section>
    <section class="cadran" aria-labelledby="t-ecart">
      <h2 id="t-ecart">${diff ? `Écart avec le run #${run.numero - 1}` : 'Écart'}</h2>
      ${rendreComparaison(diff)}
    </section>
    <section class="cadran" aria-labelledby="t-lents">
      <h2 id="t-lents">Les plus lents</h2>
      ${
        lents.length
          ? `<ol class="lents">${lents
              .map(
                (t, i) =>
                  `<li><span class="r">${i + 1}</span><span class="t" title="${echappe(t.nom)}">${echappe(t.nom)}</span><span class="v">${duree(t.ms)}</span></li>`,
              )
              .join('')}</ol>`
          : `<p class="vide">Aucun cas mesurable : les tests Rust ne rendent pas de durée par cas.</p>`
      }
    </section>
  </div>

  <div class="commandes" role="search" aria-label="Filtrer les cas">
    <button class="filtre" data-filtre="tous" aria-pressed="true">Tous</button>
    <button class="filtre" data-filtre="ko" aria-pressed="false">Échecs</button>
    <button class="filtre" data-filtre="ignore" aria-pressed="false">Ignorés</button>
    <button class="filtre" data-filtre="lent" aria-pressed="false">Lents (≥ ${seuilLent} ms)</button>
    <div class="recherche">
      <label for="q" class="hors-ecran">Filtrer par nom de cas ou de fichier</label>
      <span class="touche" aria-hidden="true">/</span>
      <input type="search" id="q" placeholder="filtrer par nom de cas ou de fichier…" autocomplete="off">
    </div>
  </div>

  <p class="compte-filtre" id="compte-filtre" role="status" aria-live="polite">${totaux.total} cas affichés sur ${totaux.total}.</p>

  <div id="resultats">
    ${suites.map(rendreSuite).join('')}
    <p class="rien">Aucun cas ne correspond.</p>
  </div>

  <footer>
    <span>Produit par <code>npm run test:rapport</code></span>
    <span>Interface interactive : <code>npm run test:ui</code></span>
    <span>Historique : <code>.rapports/historique.json</code></span>
  </footer>
</main>

<script>
(function () {
  var corps = document.body;
  var champ = document.getElementById('q');
  var compte = document.getElementById('compte-filtre');
  var boutons = [].slice.call(document.querySelectorAll('.filtre'));
  var cas = [].slice.call(document.querySelectorAll('.cas'));
  var groupes = [].slice.call(document.querySelectorAll('.groupe'));
  var suites = [].slice.call(document.querySelectorAll('.suite'));
  var filtre = 'tous';
  var total = cas.length;

  function appliquer() {
    var q = champ.value.trim().toLowerCase();
    var visibles = 0;

    cas.forEach(function (c) {
      var etat = c.dataset.etat;
      var passeFiltre =
        filtre === 'tous' ||
        (filtre === 'lent' ? c.dataset.lent === '1' : etat === filtre);
      // Le nom du cas, ou le chemin de son fichier : on cherche aussi bien
      // « supernova » que « scene/ciel ».
      var passeTexte =
        !q ||
        c.dataset.nom.indexOf(q) !== -1 ||
        (c.closest('.groupe').dataset.chemin || '').indexOf(q) !== -1;
      var ok = passeFiltre && passeTexte;
      c.hidden = !ok;
      if (ok) visibles++;
    });

    groupes.forEach(function (g) {
      var reste = g.querySelectorAll('.cas:not([hidden])').length;
      g.hidden = reste === 0;
      // Un filtre qui ne laisse que quelques cas : on ouvre, sinon il faudrait
      // cliquer chaque fichier pour voir ce qu'on vient de demander.
      if (reste > 0 && (q || filtre !== 'tous')) g.open = true;
    });

    // Une suite dont tous les fichiers sont masqués n'a plus rien à annoncer :
    // laisser son titre seul ferait croire à un résultat vide.
    suites.forEach(function (s) {
      s.hidden =
        s.querySelectorAll('.groupe:not([hidden])').length === 0 &&
        s.querySelectorAll('.panne').length === 0;
    });

    corps.classList.toggle('sans-resultat', visibles === 0);
    // Annoncé, et pas seulement montré : sans cela, filtrer ne dit rien à qui
    // n'a pas la page sous les yeux.
    compte.textContent =
      visibles === 0
        ? 'Aucun cas ne correspond.'
        : visibles + ' cas affiché' + (visibles > 1 ? 's' : '') + ' sur ' + total + '.';
  }

  boutons.forEach(function (b) {
    b.addEventListener('click', function () {
      filtre = b.dataset.filtre;
      boutons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      appliquer();
    });
  });

  champ.addEventListener('input', appliquer);

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== champ) { e.preventDefault(); champ.focus(); }
    if (e.key === 'Escape' && document.activeElement === champ) { champ.value = ''; appliquer(); champ.blur(); }
  });
})();
</script>
</body>
</html>`;
}
