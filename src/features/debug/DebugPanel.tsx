import { useEffect, useState, useSyncExternalStore } from 'react';
import css from './DebugPanel.module.css';
import { DEFINITIONS, GROUPES, type Definition, type Groupe } from './definitions';
import {
  REGLAGES_DEFAUT,
  abonnerReglages,
  ecartsAuDefaut,
  lireReglages,
  modifierReglage,
  reinitialiserReglages,
  revisionReglages,
  type Reglages,
} from './tuning';
import { declencherCiel, EVENEMENTS_CIEL } from './evenementsCiel';
import { abonnerSucces, reinitialiserSucces, succesDecroches } from '../succes/succes';

type Valeur = Reglages[keyof Reglages];

/** Groupes repliés, retenus d'une ouverture à l'autre. */
const CLE_PANNEAU = 'archive.debug.panneau';
const FICHIER_DEFAUT = 'src/features/debug/tuning.ts';
const ID_OUTILS = 'debug-outils';

/**
 * Panneau de réglages à chaud — développement seulement.
 *
 * Monté par `AppLayout` derrière `import.meta.env.DEV` : la version publiée ne
 * contient ni ce composant ni ses définitions.
 *
 * Un panneau flottant plutôt qu'une page, parce qu'on règle ce qu'on regarde :
 * une page cacherait la scène qu'on est en train d'ajuster.
 */
export function DebugPanel() {
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [replies, setReplies] = useState<Set<string>>(lireReplies);
  // Le nombre de succès décrochés, pour savoir où l'on en est sans quitter le
  // panneau. Il monte tout seul quand un événement passe à l'écran.
  const [succes, setSucces] = useState(() => succesDecroches().length);
  useEffect(
    () =>
      abonnerSucces(() => {
        setSucces(succesDecroches().length);
      }),
    [],
  );
  // La révision change à chaque modification : c'est elle qui fait redessiner,
  // les réglages eux-mêmes étant un objet modifié sur place.
  useSyncExternalStore(abonnerReglages, revisionReglages);
  const reglages = lireReglages();
  const ecarts = Object.keys(ecartsAuDefaut()).length;

  // Appliqués dès le montage, et non à l'ouverture : des valeurs retenues d'une
  // session précédente doivent valoir avant même qu'on ouvre le panneau.
  useEffect(() => {
    appliquerInterface();
    return abonnerReglages(appliquerInterface);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `code` et non `key` : la position de la touche, quelle que soit la
      // disposition du clavier.
      if (e.ctrlKey && e.altKey && e.code === 'KeyD') {
        e.preventDefault();
        setOuvert((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 2600);
    return () => window.clearTimeout(id);
  }, [message]);

  useEffect(() => {
    try {
      localStorage.setItem(CLE_PANNEAU, JSON.stringify([...replies]));
    } catch {
      // Stockage indisponible : les groupes reprendront leur état au rechargement.
    }
  }, [replies]);

  const q = normaliser(recherche.trim());
  const groupes = GROUPES.map((groupe) => {
    const tous = DEFINITIONS.filter((d) => d.groupe === groupe);
    const defs = q
      ? tous.filter((d) =>
          normaliser(`${d.libelle} ${d.groupe} ${d.aide ?? ''} ${d.cle}`).includes(q),
        )
      : tous;
    const modifies = tous.filter((d) => reglages[d.cle] !== REGLAGES_DEFAUT[d.cle]).length;
    return { groupe, defs, modifies };
  }).filter((g) => g.defs.length > 0);

  const toutReplie = GROUPES.every((g) => replies.has(g));

  function basculerGroupe(groupe: Groupe) {
    setReplies((avant) => {
      const apres = new Set(avant);
      if (apres.has(groupe)) apres.delete(groupe);
      else apres.add(groupe);
      return apres;
    });
  }

  async function copierEcarts() {
    const texte = texteEcarts();
    try {
      await navigator.clipboard.writeText(texte);
      setMessage('Écarts copiés, classés par fichier');
    } catch {
      // Presse-papiers refusé : la console reste un moyen sûr de les récupérer.
      console.info(`[debug] écarts aux défauts :\n${texte}`);
      setMessage('Copie refusée — écarts dans la console');
    }
  }

  const sousTitre =
    ecarts === 0
      ? `${DEFINITIONS.length} réglages, tous par défaut`
      : `${ecarts} modifié${ecarts > 1 ? 's' : ''}`;

  return (
    <>
      <button
        type="button"
        className={css.bascule}
        onClick={() => setOuvert((v) => !v)}
        title="Réglages de débogage (Ctrl+Alt+D)"
        aria-label="Réglages de débogage"
        aria-expanded={ouvert}
        data-debug-panneau=""
      >
        🐞
      </button>

      {ouvert && (
        <aside className={css.panneau} aria-label="Réglages de débogage" data-debug-panneau="">
          <header className={css.entete}>
            <div>
              <div className={css.titre}>Réglages</div>
              <div className={css.sousTitre}>{sousTitre}</div>
            </div>
            <button
              type="button"
              className={css.fermer}
              onClick={() => setOuvert(false)}
              aria-label="Fermer"
            >
              ✕
            </button>
          </header>

          <div className={css.outils}>
            <input
              type="search"
              className={css.recherche}
              placeholder="Rechercher un réglage…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher un réglage"
            />
            <button
              type="button"
              className={css.outil}
              onClick={() => setReplies(toutReplie ? new Set() : new Set(GROUPES))}
            >
              {toutReplie ? 'Tout déplier' : 'Tout replier'}
            </button>
          </div>

          <div className={css.corps}>
            {/* Les événements du ciel ne s'attendent pas : ils se provoquent.
                Hors recherche, pour ne pas s'intercaler entre deux résultats. */}
            {q === '' && (
              <section className={css.groupe}>
                <div className={css.groupeTete}>
                  <span className={css.groupeTitre}>Événements du ciel</span>
                </div>
                <div className={css.evenements}>
                  {EVENEMENTS_CIEL.map(({ cle, libelle }) => (
                    <button
                      key={cle}
                      type="button"
                      className={css.evenement}
                      onClick={() => declencherCiel(cle)}
                    >
                      {libelle}
                    </button>
                  ))}
                </div>
                {/* Un succès ne se décroche qu'une fois : sans ce bouton, sa
                    notification ne se revoit plus jamais, et donc ne se règle
                    pas. Le compte dit où l'on en est sans avoir à chercher. */}
                <button
                  type="button"
                  className={css.evenement}
                  onClick={() => {
                    reinitialiserSucces();
                    setSucces(0);
                  }}
                  title="Oublie tous les succès décrochés, pour revoir leurs notifications"
                >
                  Réinitialiser les succès ({succes})
                </button>
              </section>
            )}

            {groupes.map(({ groupe, defs, modifies }) => {
              // Une recherche déplie tout ce qu'elle trouve : replié, un résultat
              // resterait invisible alors qu'il est le seul affiché.
              const deplie = q !== '' || !replies.has(groupe);
              return (
                <section key={groupe} className={css.groupe}>
                  <button
                    type="button"
                    className={css.groupeTete}
                    onClick={() => basculerGroupe(groupe)}
                    aria-expanded={deplie}
                  >
                    <span className={deplie ? `${css.chevron} ${css.chevronOuvert}` : css.chevron}>
                      ›
                    </span>
                    <span className={css.groupeTitre}>{groupe}</span>
                    {modifies > 0 && <span className={css.groupeModifies}>{modifies}</span>}
                    <span className={css.groupeNombre}>{defs.length}</span>
                  </button>
                  {deplie &&
                    defs.map((d) => <Ligne key={d.cle} def={d} valeur={reglages[d.cle]} />)}
                </section>
              );
            })}
            {groupes.length === 0 && <div className={css.vide}>Aucun réglage ne correspond.</div>}
          </div>

          <footer className={css.pied}>
            <button
              type="button"
              className={css.action}
              onClick={() => void copierEcarts()}
              disabled={ecarts === 0}
            >
              Copier les écarts
            </button>
            <button
              type="button"
              className={css.action}
              onClick={reinitialiserReglages}
              disabled={ecarts === 0}
            >
              Tout réinitialiser
            </button>
            {message && (
              <div className={css.message} role="status">
                {message}
              </div>
            )}
          </footer>
        </aside>
      )}
    </>
  );
}

function Ligne({ def, valeur }: { def: Definition; valeur: Valeur }) {
  const defaut = REGLAGES_DEFAUT[def.cle];
  const modifie = valeur !== defaut;
  const id = `debug-${def.cle}`;

  return (
    <div className={modifie ? `${css.ligne} ${css.ligneModifiee}` : css.ligne}>
      <div className={css.ligneTete}>
        <label htmlFor={id} className={css.libelle}>
          {def.libelle}
          {def.reconstruction && (
            <span className={css.badge} title="Reconstruit la scène">
              ↻
            </span>
          )}
        </label>
        <div className={css.ligneActions}>
          {modifie && (
            <button
              type="button"
              className={css.retablir}
              onClick={() => modifierReglage(def.cle, defaut)}
              title={`Rétablir ${formater(def, defaut)}`}
            >
              défaut
            </button>
          )}
          {def.type === 'bascule' && (
            <input
              id={id}
              type="checkbox"
              className={css.interrupteur}
              checked={Boolean(valeur)}
              onChange={(e) => modifierReglage(def.cle, e.target.checked)}
            />
          )}
        </div>
      </div>
      {def.type !== 'bascule' && <Controle id={id} def={def} valeur={valeur} />}
      {def.aide && <div className={css.aide}>{def.aide}</div>}
    </div>
  );
}

function Controle({
  id,
  def,
  valeur,
}: {
  id: string;
  def: Exclude<Definition, { type: 'bascule' }>;
  valeur: Valeur;
}) {
  if (def.type === 'couleur') {
    return (
      <input
        id={id}
        type="color"
        className={css.couleur}
        value={String(valeur)}
        onChange={(e) => modifierReglage(def.cle, e.target.value)}
      />
    );
  }

  if (def.type === 'choix') {
    return (
      <select
        id={id}
        className={css.choix}
        value={String(valeur)}
        onChange={(e) => modifierReglage(def.cle, e.target.value)}
      >
        {def.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  const n = Number(valeur);
  const borne = (v: number) => Math.min(def.max, Math.max(def.min, v));
  const valider = (el: HTMLInputElement) => {
    const v = el.valueAsNumber;
    if (Number.isFinite(v)) modifierReglage(def.cle, borne(v));
  };

  return (
    <div className={css.nombre}>
      <input
        id={id}
        type="range"
        min={def.min}
        max={def.max}
        step={def.pas}
        value={n}
        onChange={(e) => modifierReglage(def.cle, Number(e.target.value))}
      />
      {/* Validée à la sortie du champ ou sur Entrée, et non à chaque frappe :
          contrôlée, la saisie de « 0,5 » serait ramenée à « 0 » dès le point
          tapé. La clé la remonte quand le curseur change la valeur. */}
      <input
        key={n}
        type="number"
        className={css.saisie}
        min={def.min}
        max={def.max}
        step={def.pas}
        defaultValue={n}
        aria-label={`${def.libelle}, valeur`}
        onBlur={(e) => valider(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') valider(e.currentTarget);
        }}
      />
      <span className={css.unite}>{def.unite}</span>
    </div>
  );
}

function formater(def: Definition, v: Valeur): string {
  if (def.type === 'bascule') return v ? 'activé' : 'désactivé';
  if (def.type !== 'nombre') return String(v);
  const decimales = (String(def.pas).split('.')[1] ?? '').length;
  return Number(v).toFixed(decimales) + (def.unite ? ` ${def.unite}` : '');
}

/** Valeur écrite dans la variable CSS d'un réglage. */
function valeurCss(def: Definition, v: Valeur): string {
  if (def.type === 'bascule') return v ? '' : (def.css?.siFaux ?? '');
  if (def.type === 'nombre') return `${v}${def.css?.suffixe ?? ''}`;
  return String(v);
}

/**
 * Les écarts, classés par fichier où les reporter.
 *
 * Un écart ne sert qu'à devenir un nouveau défaut. Or tous ne vivent pas au
 * même endroit : les réglages de scène sont dans `tuning.ts`, ceux d'interface
 * sont la valeur de repli d'une variable CSS. Une liste à plat obligerait à
 * chercher, pour chacun, où il se trouve.
 */
function texteEcarts(): string {
  const ecarts = ecartsAuDefaut() as Record<string, Valeur>;
  const parFichier = new Map<string, string[]>();
  for (const d of DEFINITIONS) {
    if (!(d.cle in ecarts)) continue;
    const v = ecarts[d.cle];
    const fichier = d.fichier ?? FICHIER_DEFAUT;
    const ligne = d.css
      ? `${d.css.variable}: ${valeurCss(d, v)};   /* ${d.groupe} · ${d.libelle} */`
      : `${d.cle}: ${JSON.stringify(v)},   // ${d.groupe} · ${d.libelle}`;
    parFichier.set(fichier, [...(parFichier.get(fichier) ?? []), ligne]);
  }
  return [...parFichier]
    .map(([fichier, lignes]) => `// ${fichier}\n${lignes.join('\n')}`)
    .join('\n\n');
}

/**
 * Reporte les réglages d'interface sur la racine du document.
 *
 * Une valeur égale au défaut retire la propriété au lieu de l'écrire : la
 * feuille de style reprend la main, et l'interface redevient exactement celle
 * de la version publiée.
 */
function appliquerInterface() {
  const r = lireReglages();
  const d = REGLAGES_DEFAUT;
  const racine = document.documentElement.style;
  const poser = (prop: string, valeur: string | null) => {
    if (valeur === null) racine.removeProperty(prop);
    else racine.setProperty(prop, valeur);
  };

  // Police, taille et couleur : elles touchent la racine elle-même, pas une
  // variable, et la famille doit garder sa pile de secours.
  const famille = r.policeFamille === d.policeFamille ? null : r.policeFamille;
  poser('font-family', famille === null ? null : `${famille}, system-ui, sans-serif`);
  poser('--ui-font-family', famille);

  const echelle = r.policeEchelle === d.policeEchelle ? null : r.policeEchelle;
  poser('--ui-font-scale', echelle === null ? null : String(echelle));
  // 15 px : la taille de `:root` dans App.css. Tout ce qui est en rem suit.
  poser('font-size', echelle === null ? null : `${15 * echelle}px`);

  poser('color', r.couleurTexte === d.couleurTexte ? null : r.couleurTexte);

  for (const def of DEFINITIONS) {
    if (!def.css) continue;
    const v = r[def.cle];
    poser(def.css.variable, v === d[def.cle] ? null : valeurCss(def, v));
  }

  appliquerOutils(r);
}

/**
 * Outils de mise en page, portés par une feuille de style injectée.
 *
 * Ils agissent sur tout le document, ce qu'aucune variable ne sait faire. Le
 * panneau est exclu des contours : entouré, il deviendrait illisible au moment
 * précis où on s'en sert.
 */
function appliquerOutils(r: Readonly<Reglages>) {
  const regles: string[] = [];
  if (r.uiSansAnimations) {
    regles.push(
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
    );
  }
  if (r.uiContours) {
    regles.push(
      '*:not([data-debug-panneau]):not([data-debug-panneau] *) { outline: 1px solid rgba(255, 90, 90, 0.4) !important; outline-offset: -1px; }',
    );
  }

  let feuille = document.getElementById(ID_OUTILS);
  if (regles.length === 0) {
    feuille?.remove();
    return;
  }
  if (!feuille) {
    feuille = document.createElement('style');
    feuille.id = ID_OUTILS;
    document.head.appendChild(feuille);
  }
  feuille.textContent = regles.join('\n');
}

function lireReplies(): Set<string> {
  try {
    const brut = localStorage.getItem(CLE_PANNEAU);
    // Première ouverture : tout replié. Une soixantaine de réglages dépliés
    // d'un coup noieraient ce qu'on vient chercher.
    if (brut === null) return new Set(GROUPES);
    const lu: unknown = JSON.parse(brut);
    if (!Array.isArray(lu)) return new Set(GROUPES);
    return new Set(lu.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set(GROUPES);
  }
}

/** Minuscules, sans accents : « lumiere » doit trouver « Lumière ». */
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
