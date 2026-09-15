import type { Reglages } from './tuning';

/**
 * Description des réglages pour le panneau : libellé, groupe, bornes.
 *
 * Séparée de `tuning.ts` pour une raison précise : seul le panneau l'importe.
 * La scène a besoin des valeurs, pas de leurs libellés — et ce fichier quitte
 * ainsi la version publiée en même temps que le panneau.
 */

export const GROUPES = [
  'Interface',
  'En-tête',
  'Liste des jeux',
  'Barre des launchers',
  'Fiche du jeu',
  'Étiquettes',
  'Caméra',
  'Lumière',
  'Atmosphère',
  'Planètes',
  'Soleils',
  'Systèmes',
  'Chargement',
  'Mouvement',
  'Outils',
] as const;
export type Groupe = (typeof GROUPES)[number];

/**
 * Variable CSS pilotée par un réglage.
 *
 * Le panneau l'écrit sur la racine quand la valeur s'écarte du défaut, et la
 * retire sinon : la feuille de style retombe alors sur sa valeur de repli.
 */
export type LienCss = {
  variable: string;
  /** Ajouté à la valeur numérique : « px », ou rien pour un facteur. */
  suffixe?: string;
  /** Pour une bascule active par défaut : valeur écrite quand on la coupe. */
  siFaux?: string;
};

type Commun = {
  cle: keyof Reglages;
  libelle: string;
  groupe: Groupe;
  /** Précise ce que le réglage touche, quand le libellé ne suffit pas. */
  aide?: string;
  /** Le changer reconstruit la scène. */
  reconstruction?: boolean;
  css?: LienCss;
  /** Où reporter la valeur pour en faire le nouveau défaut. */
  fichier?: string;
};

export type Definition =
  | (Commun & { type: 'nombre'; min: number; max: number; pas: number; unite?: string })
  | (Commun & { type: 'couleur' })
  | (Commun & { type: 'choix'; options: readonly string[] })
  | (Commun & { type: 'bascule' });

const APP = 'src/App.css';
const LAYOUT = 'src/app/layout/AppLayout.module.css';
const PAGE = 'src/pages/SolarSystem/SolarSystemPage.module.css';
const LISTE = 'src/pages/SolarSystem/components/GameList.module.css';
const FICHE = 'src/pages/SolarSystem/components/GamePanel.module.css';
const MODULES = 'modules CSS (facteur de repli : 1)';

export const DEFINITIONS: readonly Definition[] = [
  // ── Interface ──────────────────────────────────────────────────────────
  {
    cle: 'policeFamille', libelle: 'Police', groupe: 'Interface', type: 'choix', fichier: APP,
    options: ['Chakra Petch', 'Share Tech Mono', 'Inter', 'Segoe UI', 'system-ui'],
  },
  {
    cle: 'policeEchelle', libelle: 'Taille du texte', groupe: 'Interface', type: 'nombre',
    min: 0.8, max: 1.6, pas: 0.05, unite: '×', fichier: APP,
    aide: 'Liste et fiche des jeux, et tout ce qui est dimensionné en rem.',
  },
  { cle: 'couleurTexte', libelle: 'Couleur du texte', groupe: 'Interface', type: 'couleur', fichier: APP },
  {
    cle: 'uiArrondi', libelle: 'Arrondi des coins', groupe: 'Interface', type: 'nombre',
    min: 0, max: 3, pas: 0.05, unite: '×', css: { variable: '--dbg-arrondi' }, fichier: MODULES,
    aide: 'Navigation, recherche, liste, barre des launchers, fiche.',
  },
  {
    cle: 'uiFlou', libelle: 'Flou derrière les panneaux', groupe: 'Interface', type: 'nombre',
    min: 0, max: 3, pas: 0.05, unite: '×', css: { variable: '--dbg-flou' }, fichier: MODULES,
    aide: 'En-tête, liste et barre des launchers.',
  },

  // ── En-tête ────────────────────────────────────────────────────────────
  {
    cle: 'enteteOpacite', libelle: 'Opacité du fond', groupe: 'En-tête', type: 'nombre',
    min: 0, max: 1, pas: 0.01, css: { variable: '--dbg-entete-op' }, fichier: LAYOUT,
  },
  {
    cle: 'rechercheLargeur', libelle: 'Largeur de la recherche', groupe: 'En-tête', type: 'nombre',
    min: 200, max: 900, pas: 10, unite: 'px', css: { variable: '--dbg-recherche-l', suffixe: 'px' }, fichier: LAYOUT,
    aide: 'Plafonnée à la moitié de la fenêtre.',
  },

  // ── Liste des jeux ─────────────────────────────────────────────────────
  {
    cle: 'listeLargeur', libelle: 'Largeur', groupe: 'Liste des jeux', type: 'nombre',
    min: 140, max: 400, pas: 2, unite: 'px', css: { variable: '--dbg-liste-l', suffixe: 'px' }, fichier: PAGE,
    aide: 'Plafonnée à 26 % de la page. La vue 3D se recadre d’elle-même.',
  },
  {
    cle: 'opaciteListe', libelle: 'Opacité du fond', groupe: 'Liste des jeux', type: 'nombre',
    min: 0, max: 1, pas: 0.01, css: { variable: '--liste-fond-opacite' }, fichier: LISTE,
  },
  {
    cle: 'listeVignette', libelle: 'Taille des vignettes', groupe: 'Liste des jeux', type: 'nombre',
    min: 0.5, max: 3, pas: 0.05, unite: '×', css: { variable: '--dbg-vignette' }, fichier: LISTE,
  },
  {
    cle: 'listeEspacement', libelle: 'Espacement des lignes', groupe: 'Liste des jeux', type: 'nombre',
    min: 0, max: 3, pas: 0.05, unite: '×', css: { variable: '--dbg-liste-esp' }, fichier: LISTE,
  },

  // ── Barre des launchers ────────────────────────────────────────────────
  {
    cle: 'iconesTaille', libelle: 'Taille des icônes', groupe: 'Barre des launchers', type: 'nombre',
    min: 0.5, max: 2.5, pas: 0.05, unite: '×', css: { variable: '--dbg-icones' }, fichier: LISTE,
    aide: 'Icônes des launchers et boutons de la fiche. La barre s’élargit avec, tant que sa largeur n’est pas imposée.',
  },
  {
    cle: 'railLargeur', libelle: 'Largeur imposée', groupe: 'Barre des launchers', type: 'nombre',
    min: 24, max: 96, pas: 2, unite: 'px', css: { variable: '--dbg-rail-l', suffixe: 'px' }, fichier: PAGE,
    aide: 'Au défaut, la largeur suit la taille des icônes.',
  },
  {
    cle: 'railOpacite', libelle: 'Opacité du fond', groupe: 'Barre des launchers', type: 'nombre',
    min: 0, max: 1, pas: 0.01, css: { variable: '--dbg-rail-op' }, fichier: LISTE,
  },
  {
    cle: 'railIconesRepos', libelle: 'Opacité des icônes au repos', groupe: 'Barre des launchers', type: 'nombre',
    min: 0, max: 1, pas: 0.01, css: { variable: '--dbg-rail-repos' }, fichier: LISTE,
  },

  // ── Fiche du jeu ───────────────────────────────────────────────────────
  {
    cle: 'ficheOpacite', libelle: 'Opacité du fond', groupe: 'Fiche du jeu', type: 'nombre',
    min: 0.2, max: 1, pas: 0.01, css: { variable: '--dbg-fiche-op' }, fichier: FICHE,
    aide: 'Sous 1, la scène transparaît et semble faire trembler la fiche.',
  },
  { cle: 'ficheMini', libelle: 'Largeur minimale', groupe: 'Fiche du jeu', type: 'nombre', min: 120, max: 400, pas: 10, unite: 'px' },
  { cle: 'ficheMaxi', libelle: 'Largeur maximale', groupe: 'Fiche du jeu', type: 'nombre', min: 200, max: 700, pas: 10, unite: 'px' },
  {
    cle: 'ficheBase', libelle: 'Largeur de base', groupe: 'Fiche du jeu', type: 'nombre',
    min: 0, max: 400, pas: 10, unite: 'px',
    aide: 'La largeur visée vaut base + part × bande libre, entre le minimum et le maximum.',
  },
  { cle: 'fichePart', libelle: 'Part de la bande libre', groupe: 'Fiche du jeu', type: 'nombre', min: 0, max: 0.6, pas: 0.01 },

  // ── Étiquettes ─────────────────────────────────────────────────────────
  {
    cle: 'etiquettePlanete', libelle: 'Noms des jeux', groupe: 'Étiquettes', type: 'nombre',
    min: 7, max: 24, pas: 1, unite: 'px', css: { variable: '--dbg-etiq-planete', suffixe: 'px' }, fichier: PAGE,
    aide: 'Affichés au survol d’une planète.',
  },
  {
    cle: 'etiquetteOrbite', libelle: 'Noms des launchers', groupe: 'Étiquettes', type: 'nombre',
    min: 7, max: 24, pas: 1, unite: 'px', css: { variable: '--dbg-etiq-orbite', suffixe: 'px' }, fichier: PAGE,
  },
  {
    cle: 'etiquetteOrbiteOpacite', libelle: 'Opacité des noms de launchers', groupe: 'Étiquettes', type: 'nombre',
    min: 0, max: 1, pas: 0.01, css: { variable: '--dbg-etiq-orbite-op' }, fichier: PAGE,
  },

  // ── Caméra ─────────────────────────────────────────────────────────────
  { cle: 'camChamp', libelle: 'Champ de vision', groupe: 'Caméra', type: 'nombre', min: 30, max: 100, pas: 1, unite: '°' },
  { cle: 'camZoom', libelle: 'Vitesse du zoom', groupe: 'Caméra', type: 'nombre', min: 0.05, max: 2, pas: 0.05 },
  {
    cle: 'camAmorti', libelle: 'Amorti', groupe: 'Caméra', type: 'nombre', min: 0.01, max: 0.3, pas: 0.01,
    aide: 'Plus bas, la caméra glisse plus longtemps après la souris.',
  },
  {
    cle: 'camReculMin', libelle: 'Approche d’une planète · au plus près', groupe: 'Caméra', type: 'nombre',
    min: 1, max: 10, pas: 0.1, unite: 'r', aide: 'En rayons visuels de la planète, anneaux compris.',
  },
  {
    cle: 'camReculMax', libelle: 'Approche d’une planète · au plus loin', groupe: 'Caméra', type: 'nombre',
    min: 5, max: 60, pas: 1, unite: 'r',
  },
  { cle: 'volDureeMin', libelle: 'Durée d’un voyage · minimale', groupe: 'Caméra', type: 'nombre', min: 0.2, max: 5, pas: 0.1, unite: 's' },
  { cle: 'volDureeMax', libelle: 'Durée d’un voyage · maximale', groupe: 'Caméra', type: 'nombre', min: 0.5, max: 10, pas: 0.1, unite: 's' },

  // ── Lumière ────────────────────────────────────────────────────────────
  { cle: 'exposition', libelle: 'Exposition', groupe: 'Lumière', type: 'nombre', min: 0.3, max: 2.5, pas: 0.05 },
  { cle: 'bloomForce', libelle: 'Débordement · intensité', groupe: 'Lumière', type: 'nombre', min: 0, max: 2, pas: 0.01 },
  { cle: 'bloomRayon', libelle: 'Débordement · étalement', groupe: 'Lumière', type: 'nombre', min: 0, max: 1.5, pas: 0.01 },
  {
    cle: 'bloomSeuil', libelle: 'Débordement · seuil', groupe: 'Lumière', type: 'nombre',
    min: 0, max: 1.2, pas: 0.01, aide: 'Sous 0,72, les étoiles du champ se mettent à luire.',
  },
  { cle: 'lumiereIntensite', libelle: 'Lumière du soleil', groupe: 'Lumière', type: 'nombre', min: 0, max: 8, pas: 0.1 },
  {
    cle: 'lumiereAmbiante', libelle: 'Lumière ambiante', groupe: 'Lumière', type: 'nombre',
    min: 0, max: 5, pas: 0.05, aide: 'Éclaire les faces tournées à l’opposé du soleil.',
  },

  // ── Atmosphère ─────────────────────────────────────────────────────────
  {
    cle: 'brumeFacteur', libelle: 'Brume', groupe: 'Atmosphère', type: 'nombre',
    min: 0, max: 4, pas: 0.05, unite: '×', aide: 'À zéro, on voit les planètes apparaître et disparaître.',
  },
  {
    cle: 'etoilesNombre', libelle: 'Nombre d’étoiles', groupe: 'Atmosphère', type: 'nombre',
    min: 0, max: 20000, pas: 500, reconstruction: true,
  },
  { cle: 'etoilesTaille', libelle: 'Taille des étoiles', groupe: 'Atmosphère', type: 'nombre', min: 0.2, max: 6, pas: 0.1 },
  { cle: 'etoilesOpacite', libelle: 'Opacité des étoiles', groupe: 'Atmosphère', type: 'nombre', min: 0, max: 1, pas: 0.01 },

  // ── Planètes ───────────────────────────────────────────────────────────
  {
    cle: 'planeteEmissif', libelle: 'Luminosité propre', groupe: 'Planètes', type: 'nombre',
    min: 0, max: 2, pas: 0.01, aide: 'À zéro, la face à l’ombre du soleil devient noire.',
  },
  { cle: 'atmosphereOpacite', libelle: 'Atmosphère', groupe: 'Planètes', type: 'nombre', min: 0, max: 1, pas: 0.01 },
  { cle: 'anneauxOpacite', libelle: 'Opacité des anneaux', groupe: 'Planètes', type: 'nombre', min: 0, max: 2, pas: 0.05, unite: '×' },
  {
    cle: 'tailleContraste', libelle: 'Contraste des tailles', groupe: 'Planètes', type: 'nombre',
    min: 0.1, max: 2, pas: 0.05, reconstruction: true,
    aide: 'Sous 1, les petits jeux grossissent ; au-dessus, seuls les plus lourds ressortent.',
  },
  {
    cle: 'lueurTaille', libelle: 'Lueur vue de loin', groupe: 'Planètes', type: 'nombre',
    min: 0, max: 40, pas: 1, unite: 'px', aide: 'Le point lumineux qui signale une planète de loin.',
  },

  // ── Soleils ────────────────────────────────────────────────────────────
  { cle: 'soleilCouleur', libelle: 'Couleur', groupe: 'Soleils', type: 'couleur' },
  { cle: 'couronneIntensite', libelle: 'Couronne', groupe: 'Soleils', type: 'nombre', min: 0, max: 4, pas: 0.05, unite: '×' },
  {
    cle: 'baliseTaille', libelle: 'Balise vue de loin', groupe: 'Soleils', type: 'nombre',
    min: 0, max: 80, pas: 1, unite: 'px', aide: 'Le point qui signale un système quand ses planètes sont libérées.',
  },

  // ── Systèmes ───────────────────────────────────────────────────────────
  { cle: 'orbitesOpacite', libelle: 'Opacité des orbites', groupe: 'Systèmes', type: 'nombre', min: 0, max: 1, pas: 0.01 },
  {
    cle: 'asteroidesParPlanete', libelle: 'Astéroïdes par planète', groupe: 'Systèmes', type: 'nombre',
    min: 0, max: 400, pas: 5, reconstruction: true,
  },
  {
    cle: 'asteroidesMax', libelle: 'Astéroïdes au plus', groupe: 'Systèmes', type: 'nombre',
    min: 0, max: 10000, pas: 100, reconstruction: true,
  },

  // ── Chargement ─────────────────────────────────────────────────────────
  {
    cle: 'seuilCharge', libelle: 'Construction des planètes', groupe: 'Chargement', type: 'nombre',
    min: 1.5, max: 15, pas: 0.5, unite: 'r', aide: 'Distance, en rayons de système, à laquelle ses planètes apparaissent.',
  },
  {
    cle: 'seuilLibere', libelle: 'Libération des planètes', groupe: 'Chargement', type: 'nombre',
    min: 2, max: 20, pas: 0.5, unite: 'r',
    aide: 'Toujours tenue un demi-rayon au-delà de la construction, sans quoi le système clignoterait.',
  },

  // ── Mouvement ──────────────────────────────────────────────────────────
  { cle: 'vitesseOrbites', libelle: 'Vitesse orbitale', groupe: 'Mouvement', type: 'nombre', min: 0, max: 5, pas: 0.05, unite: '×' },
  { cle: 'vitesseRotation', libelle: 'Rotation des planètes', groupe: 'Mouvement', type: 'nombre', min: 0, max: 5, pas: 0.05, unite: '×' },

  // ── Outils ─────────────────────────────────────────────────────────────
  {
    cle: 'compteurImages', libelle: 'Compteur d’images', groupe: 'Outils', type: 'bascule',
    css: { variable: '--dbg-fps-display', siFaux: 'none' }, fichier: PAGE,
  },
  {
    cle: 'uiSansAnimations', libelle: 'Couper les animations', groupe: 'Outils', type: 'bascule',
    aide: 'Toutes les transitions de l’interface, pour juger un état sans attendre qu’il s’installe.',
  },
  {
    cle: 'uiContours', libelle: 'Contours des éléments', groupe: 'Outils', type: 'bascule',
    aide: 'Révèle les boîtes de la mise en page.',
  },
];
