import { STORAGE_KEYS, readJSON, writeJSON } from '../../../services/storage';

/**
 * Largeurs choisies pour la colonne de droite.
 *
 * `null` signifie « pas de choix » : la feuille de style garde alors la main,
 * avec sa largeur par défaut et son plafond en pourcentage. C'est ce qui permet
 * au panneau de débogage de continuer à éprouver ces largeurs tant que
 * l'utilisateur n'a rien décidé.
 */
export type Largeurs = {
  liste: number | null;
  rail: number | null;
};

/** En deçà, un titre de jeu ne tient plus ; au-delà, la scène n'a plus de place. */
export const LARGEUR_LISTE = { min: 150, max: 520, defaut: 196 } as const;
/** La barre doit contenir une icône ; très large, elle mange la vue pour rien. */
export const LARGEUR_RAIL = { min: 32, max: 96, defaut: 50 } as const;

/** Colonne réglable, désignée par son nom dans les largeurs retenues. */
export type Colonne = keyof Largeurs;

export const LARGEURS_LIBRES: Largeurs = { liste: null, rail: null };

export function borner(v: number, bornes: { min: number; max: number }): number {
  return Math.min(bornes.max, Math.max(bornes.min, Math.round(v)));
}

/**
 * Facteurs d'échelle du contenu, déduits des largeurs choisies.
 *
 * Élargir une colonne n'a d'intérêt que si ce qu'elle contient en profite :
 * une liste à 520 px avec des vignettes de 34 px et des titres de 12 px reste
 * la même liste, entourée de vide.
 */
export type Echelles = {
  /** Vignettes et icônes : elles suivent la largeur au plus près. */
  image: number;
  /** Texte : il suit de moins près, un titre n'est pas une manchette. */
  texte: number;
  /** La barre des launchers a sa propre largeur, donc sa propre échelle. */
  rail: number;
  /** Texte de la barre : même échelle, mais avec le plancher de lisibilité. */
  railTexte: number;
};

const rond = (v: number) => Math.round(v * 1000) / 1000;

/** Amortissement du texte : à pleine largeur il grandit de moitié, pas du double. */
const AMORTI_TEXTE = 0.45;

/**
 * Plancher du texte.
 *
 * Les images suivent la colonne jusqu'en bas — une vignette minuscule reste
 * une vignette. Le texte, non : à 32 px de barre, l'initiale d'un launcher
 * tombait à 7 px, bien sous le seuil de lisibilité que le reste de
 * l'application tient. Rétrécir une colonne ne doit pas rendre son contenu
 * illisible.
 */
const PLANCHER_TEXTE = 0.9;

export function echelles(l: Largeurs): Echelles {
  const liste = (l.liste ?? LARGEUR_LISTE.defaut) / LARGEUR_LISTE.defaut;
  const rail = (l.rail ?? LARGEUR_RAIL.defaut) / LARGEUR_RAIL.defaut;
  // Rien à brider vers le haut : les bornes de largeur bornent déjà les rapports.
  return {
    image: rond(liste),
    texte: rond(Math.max(PLANCHER_TEXTE, 1 + (liste - 1) * AMORTI_TEXTE)),
    rail: rond(rail),
    railTexte: rond(Math.max(PLANCHER_TEXTE, rail)),
  };
}

function nombreOuNull(v: unknown, bornes: { min: number; max: number }): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? borner(v, bornes) : null;
}

export function normaliserLargeurs(brut: unknown): Largeurs {
  if (!brut || typeof brut !== 'object') return LARGEURS_LIBRES;
  const o = brut as Record<string, unknown>;
  return {
    liste: nombreOuNull(o.liste, LARGEUR_LISTE),
    rail: nombreOuNull(o.rail, LARGEUR_RAIL),
  };
}

export function chargerLargeurs(): Largeurs {
  return normaliserLargeurs(readJSON<unknown>(STORAGE_KEYS.solarLargeurs));
}

export function enregistrerLargeurs(l: Largeurs): void {
  writeJSON(STORAGE_KEYS.solarLargeurs, l);
}
