/**
 * Réglages ajustables de l'interface et de la scène.
 *
 * En production, ce module ne fait que tenir les valeurs par défaut : rien ne
 * les modifie, et la scène les lit comme elle lisait ses constantes. En
 * développement, le panneau de débogage les change à chaud.
 *
 * Il ne dépend de rien — ni de Three.js, ni du DOM au chargement — parce que
 * la scène l'importe, et avec elle tout ce qui la vérifie hors navigateur.
 *
 * Libellés, bornes et groupes vivent à part, dans `definitions.ts`, que seul le
 * panneau importe : ils disparaissent de la version publiée avec lui.
 *
 * Les réglages d'interface pilotent des variables CSS. Leur défaut est aussi la
 * valeur de repli écrite dans la feuille de style : les deux doivent rester
 * égaux, et c'est ce qui garantit que la version publiée — où rien n'écrit ces
 * variables — s'affiche exactement comme avant.
 */

export type Reglages = {
  // ── Interface ──────────────────────────────────────────────────────────
  policeFamille: string;
  policeEchelle: number;
  couleurTexte: string;
  /** Facteur appliqué aux arrondis des panneaux et boutons. */
  uiArrondi: number;
  /** Facteur appliqué au flou derrière les panneaux translucides. */
  uiFlou: number;

  // ── Navigation ─────────────────────────────────────────────────────────

  // ── En-tête ────────────────────────────────────────────────────────────
  enteteOpacite: number;
  rechercheLargeur: number;

  // ── Liste des jeux ─────────────────────────────────────────────────────
  listeLargeur: number;
  opaciteListe: number;
  listeVignette: number;
  listeEspacement: number;

  // ── Barre des launchers ────────────────────────────────────────────────
  /** Facteur appliqué aux icônes : barre des launchers et boutons de la fiche. */
  iconesTaille: number;
  railLargeur: number;
  railOpacite: number;
  railIconesRepos: number;

  // ── Fiche du jeu ───────────────────────────────────────────────────────
  ficheOpacite: number;
  ficheMini: number;
  ficheMaxi: number;
  ficheBase: number;
  fichePart: number;

  // ── Étiquettes ─────────────────────────────────────────────────────────
  etiquettePlanete: number;
  etiquetteOrbite: number;
  etiquetteOrbiteOpacite: number;

  // ── Caméra ─────────────────────────────────────────────────────────────
  camChamp: number;
  camZoom: number;
  camAmorti: number;
  /** Distance d'approche d'une planète, en rayons visuels. */
  camReculMin: number;
  camReculMax: number;
  /** Durée d'un voyage entre deux points de la galaxie, en secondes. */
  volDureeMin: number;
  volDureeMax: number;

  // ── Lumière ────────────────────────────────────────────────────────────
  exposition: number;
  bloomForce: number;
  bloomRayon: number;
  bloomSeuil: number;
  lumiereIntensite: number;
  lumiereAmbiante: number;

  // ── Atmosphère ─────────────────────────────────────────────────────────
  brumeFacteur: number;
  /** Exige une reconstruction. */
  etoilesNombre: number;
  etoilesTaille: number;
  etoilesOpacite: number;

  // ── Planètes ───────────────────────────────────────────────────────────
  planeteEmissif: number;
  atmosphereOpacite: number;
  /** Facteur appliqué à l'opacité propre de chaque anneau. */
  anneauxOpacite: number;
  /** Exposant de la courbe taille sur disque → rayon. Exige une reconstruction. */
  tailleContraste: number;
  lueurTaille: number;

  // ── Soleils ────────────────────────────────────────────────────────────
  soleilCouleur: string;
  /** Facteur appliqué à l'opacité propre de chaque couche de couronne. */
  couronneIntensite: number;
  baliseTaille: number;

  // ── Systèmes ───────────────────────────────────────────────────────────
  orbitesOpacite: number;
  /** Exige une reconstruction. */
  asteroidesParPlanete: number;
  /** Exige une reconstruction. */
  asteroidesMax: number;

  // ── Chargement ─────────────────────────────────────────────────────────
  /** En rayons de système : distance à laquelle ses planètes sont construites. */
  seuilCharge: number;
  /** En rayons de système : distance à laquelle elles sont libérées. */
  seuilLibere: number;

  // ── Mouvement ──────────────────────────────────────────────────────────
  vitesseOrbites: number;
  vitesseRotation: number;

  // ── Outils ─────────────────────────────────────────────────────────────
  compteurImages: boolean;
  uiSansAnimations: boolean;
  uiContours: boolean;
};

export const REGLAGES_DEFAUT: Readonly<Reglages> = Object.freeze({
  policeFamille: 'Chakra Petch',
  policeEchelle: 1,
  // La feuille de style dit rgba(224, 230, 240, 0.92). Un hexadécimal ne sait
  // pas porter l'opacité : c'est pourquoi le panneau n'écrit cette couleur que
  // lorsqu'elle s'écarte du défaut.
  couleurTexte: '#e0e6f0',
  uiArrondi: 1,
  uiFlou: 1,


  enteteOpacite: 0.6,
  rechercheLargeur: 480,

  listeLargeur: 196,
  // Montée de 0,34 : sous une planète claire qui défile, le texte de la liste
  // tombait à 2,4 de contraste. À 0,80, le pire cas reste au-dessus du seuil.
  opaciteListe: 0.8,
  // Deux fois et demie le dessin d'origine : à ×1, la vignette d'un jeu faisait
  // 34 px de large et ne montrait rien de sa jaquette.
  listeVignette: 2.5,
  listeEspacement: 1,

  // Un quart plus grandes que le dessin d'origine : à ×1, les icônes des
  // launchers et les boutons de la fiche faisaient des cibles de 28 px.
  iconesTaille: 1.25,
  railLargeur: 40,
  railOpacite: 0.42,
  railIconesRepos: 0.55,

  ficheOpacite: 1,
  // Largeur de la fiche : base + part de la bande libre, bornée. Justification
  // dans `lib/framing.ts`.
  ficheMini: 200,
  ficheMaxi: 340,
  ficheBase: 120,
  fichePart: 0.18,

  etiquettePlanete: 11,
  etiquetteOrbite: 11,
  etiquetteOrbiteOpacite: 0.75,

  camChamp: 60,
  camZoom: 0.35,
  camAmorti: 0.06,
  camReculMin: 2.6,
  camReculMax: 20,
  volDureeMin: 2.4,
  volDureeMax: 4.5,

  exposition: 1.15,
  // Débordement discret : le soleil et les jaquettes les plus claires luisent,
  // le reste garde ses contrastes.
  bloomForce: 0.45,
  bloomRayon: 0.4,
  // Au-dessus des étoiles du champ, qui rendent autour de 0,72 une fois leur
  // opacité appliquée. À 0,55 chacune des cinq mille devenait une pastille
  // floue et le fond de nébuleuse se mettait à luire : la scène perdait ses
  // contrastes au lieu d'en gagner.
  bloomSeuil: 0.85,
  lumiereIntensite: 2.6,
  lumiereAmbiante: 1.1,

  brumeFacteur: 1,
  etoilesNombre: 5000,
  etoilesTaille: 1.6,
  etoilesOpacite: 0.85,

  planeteEmissif: 0.42,
  atmosphereOpacite: 0.1,
  anneauxOpacite: 1,
  tailleContraste: 0.7,
  lueurTaille: 13,

  soleilCouleur: '#ffdd44',
  couronneIntensite: 1,
  baliseTaille: 26,

  // Montée de 16 % à 30 % pour que les orbites restent lisibles de loin.
  orbitesOpacite: 0.3,
  asteroidesParPlanete: 75,
  asteroidesMax: 1800,

  // Deux seuils et non un : avec un seul, un système basculerait à chaque frame
  // dès que la caméra flotte à cette distance.
  seuilCharge: 4.5,
  seuilLibere: 6.5,

  vitesseOrbites: 1,
  vitesseRotation: 1,

  compteurImages: true,
  uiSansAnimations: false,
  uiContours: false,
});

/** Réglages qui fixent un nombre ou une taille d'objets : les changer reconstruit la scène. */
const STRUCTURELS: ReadonlyArray<keyof Reglages> = [
  'etoilesNombre',
  'asteroidesParPlanete',
  'asteroidesMax',
  'tailleContraste',
];

const CLE_STOCKAGE = 'archive.debug.reglages';

// Les réglages retenus ne sont relus qu'en développement. En production, rien
// ne les écrit, et la version publiée démarre toujours sur les défauts.
const EN_DEV = import.meta.env?.DEV === true;

const courant: Reglages = { ...REGLAGES_DEFAUT, ...(EN_DEV ? charger() : {}) };
let revision = 0;
let structure = 0;
let minuteur: ReturnType<typeof setTimeout> | null = null;
const abonnes = new Set<() => void>();

function charger(): Partial<Reglages> {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    if (!brut) return {};
    const lu = JSON.parse(brut) as Record<string, unknown>;
    const propre: Record<string, unknown> = {};
    for (const [cle, defaut] of Object.entries(REGLAGES_DEFAUT)) {
      const v = lu[cle];
      // Une valeur d'un autre type, ou un nombre non fini, viendrait d'une
      // ancienne forme de ces réglages : on retombe sur le défaut.
      if (typeof v !== typeof defaut) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      propre[cle] = v;
    }
    return propre as Partial<Reglages>;
  } catch {
    return {};
  }
}

function enregistrer(): void {
  if (!EN_DEV) return;
  try {
    // Seuls les écarts sont gardés : un défaut qui change dans le code doit
    // s'appliquer, plutôt que d'être masqué par une copie ancienne.
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(ecartsAuDefaut()));
  } catch {
    // Stockage indisponible : les réglages tiennent jusqu'au rechargement.
  }
}

function notifier(): void {
  revision += 1;
  for (const fn of abonnes) fn();
}

function planifierReconstruction(): void {
  // Reconstruire la scène coûte plusieurs centaines de millisecondes, et un
  // curseur qu'on glisse émet des dizaines de valeurs : on attend qu'il se pose.
  if (minuteur) clearTimeout(minuteur);
  minuteur = setTimeout(() => {
    minuteur = null;
    structure += 1;
    notifier();
  }, 350);
}

/** Les réglages du moment. Objet modifié sur place : ne pas le conserver. */
export function lireReglages(): Readonly<Reglages> {
  return courant;
}

/** Change à chaque modification, quelle qu'elle soit. */
export function revisionReglages(): number {
  return revision;
}

/** Change seulement quand un réglage exige de reconstruire la scène. */
export function versionStructure(): number {
  return structure;
}

export function modifierReglage<K extends keyof Reglages>(cle: K, valeur: Reglages[K]): void {
  if (courant[cle] === valeur) return;
  courant[cle] = valeur;
  enregistrer();
  if (STRUCTURELS.includes(cle)) planifierReconstruction();
  notifier();
}

export function reinitialiserReglages(): void {
  const structurel = STRUCTURELS.some((c) => courant[c] !== REGLAGES_DEFAUT[c]);
  Object.assign(courant, REGLAGES_DEFAUT);
  enregistrer();
  if (structurel) planifierReconstruction();
  notifier();
}

/** Les réglages qui s'écartent du défaut — ce qu'on reporte dans le code. */
export function ecartsAuDefaut(): Partial<Reglages> {
  const ecarts: Record<string, unknown> = {};
  for (const cle of Object.keys(REGLAGES_DEFAUT) as Array<keyof Reglages>) {
    if (courant[cle] !== REGLAGES_DEFAUT[cle]) ecarts[cle] = courant[cle];
  }
  return ecarts as Partial<Reglages>;
}

export function abonnerReglages(fn: () => void): () => void {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
