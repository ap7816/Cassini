import type { Game } from '../../../features/types';
import { ICONES_SYSTEME, ICONE_PAR_DEFAUT } from './iconesSysteme';

/**
 * Systèmes solaires créés par l'utilisateur, en plus de ceux des launchers.
 *
 * Pur et sans stockage : la persistance vit dans `customSystemsStorage.ts`, ce
 * qui permet de vérifier la logique sans rien simuler.
 *
 * Un système ne possède pas ses jeux, il les désigne. Un même jeu reste dans
 * son launcher et peut figurer dans plusieurs systèmes personnalisés : ranger
 * un jeu dans « Favoris » ne doit pas le faire disparaître de Steam.
 */

/** Placement choisi pour une planète. Un champ absent garde la valeur calculée. */
export type PlacementPlanete = {
  /** Distance au soleil, en unités de la scène. */
  distance?: number;
  /** Position de départ sur l'orbite, en degrés. */
  angle?: number;
  /** Facteur appliqué au rayon calculé d'après la taille sur disque. */
  taille?: number;
};

export type SystemePerso = {
  id: string;
  nom: string;
  /** Nom d'une icône de `ICONES_SYSTEME`. */
  icone: string;
  /** Couleur au format #rrggbb. */
  couleur: string;
  /** Identifiants des jeux, dans l'ordre des orbites. */
  jeux: string[];
  /** Facteur appliqué au rayon du soleil. */
  soleil: number;
  /** Facteur appliqué à la vitesse des planètes ; 0 les fige. */
  vitesse: number;
  /** Toutes les orbites dans le plan du soleil, sans inclinaison. */
  aPlat: boolean;
  /** Placements, par identifiant de jeu. */
  placements: Record<string, PlacementPlanete>;
};

/** Ce que la scène doit savoir d'un système pour en placer les astres. */
export type ReglageSysteme = Pick<SystemePerso, 'soleil' | 'vitesse' | 'aPlat' | 'placements'>;

/**
 * Préfixe des clés de système personnalisé dans la galaxie.
 *
 * La galaxie indexe ses systèmes par une chaîne — jusqu'ici le nom du launcher.
 * Un préfixe qu'aucun launcher ne porte évite toute collision : un système
 * baptisé « Steam » ne prend pas la place du vrai.
 */
export const PREFIXE_SYSTEME = 'perso:';
export const NOM_MAX = 32;

/** Bornes des réglages : au-delà, le système cesse d'être lisible. */
export const BORNES = {
  soleil: { min: 0.3, max: 3, defaut: 1 },
  vitesse: { min: 0, max: 4, defaut: 1 },
  taille: { min: 0.3, max: 3, defaut: 1 },
} as const;

export const COULEURS_SYSTEME: readonly string[] = [
  '#f0c040',
  '#f08a4b',
  '#e8636f',
  '#e36fb8',
  '#9b7bf2',
  '#4fb6e8',
  '#4ccf8f',
  '#cfd6e0',
];

const HEX = /^#[0-9a-f]{6}$/i;

export function cleSysteme(s: Pick<SystemePerso, 'id'>): string {
  return PREFIXE_SYSTEME + s.id;
}

export function estSystemePerso(cle: string): boolean {
  return cle.startsWith(PREFIXE_SYSTEME);
}

function borne(v: unknown, b: { min: number; max: number; defaut: number }): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(b.max, Math.max(b.min, v)) : b.defaut;
}

/** Angle ramené dans [0, 360[. */
export function angleNormal(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function normaliserPlacement(brut: unknown): PlacementPlanete | null {
  if (!brut || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  const p: PlacementPlanete = {};
  if (typeof o.distance === 'number' && Number.isFinite(o.distance) && o.distance > 0) p.distance = o.distance;
  if (typeof o.angle === 'number' && Number.isFinite(o.angle)) p.angle = angleNormal(o.angle);
  if (typeof o.taille === 'number' && Number.isFinite(o.taille)) p.taille = borne(o.taille, BORNES.taille);
  return Object.keys(p).length > 0 ? p : null;
}

/**
 * Relit une liste venue du stockage, en écartant ce qui ne tient pas debout.
 *
 * Un système sans identifiant ni nom est ignoré ; une icône, une couleur ou un
 * réglage invalide retombe sur le défaut plutôt que de faire échouer le
 * chargement ; les jeux en double ne gardent que leur première place, et un
 * placement ne survit que pour un jeu du système.
 */
export function normaliserSystemes(brut: unknown): SystemePerso[] {
  if (!Array.isArray(brut)) return [];
  const vus = new Set<string>();
  const sortie: SystemePerso[] = [];

  for (const x of brut) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const nom = typeof o.nom === 'string' ? o.nom.trim().slice(0, NOM_MAX) : '';
    if (!id || !nom || vus.has(id)) continue;
    vus.add(id);

    const icone =
      typeof o.icone === 'string' && ICONES_SYSTEME.some((i) => i.nom === o.icone)
        ? o.icone
        : ICONE_PAR_DEFAUT;
    const couleur =
      typeof o.couleur === 'string' && HEX.test(o.couleur) ? o.couleur.toLowerCase() : COULEURS_SYSTEME[0];
    const jeux = Array.isArray(o.jeux)
      ? [...new Set(o.jeux.filter((j): j is string => typeof j === 'string' && j.length > 0))]
      : [];

    const placements: Record<string, PlacementPlanete> = {};
    if (o.placements && typeof o.placements === 'object') {
      for (const [idJeu, p] of Object.entries(o.placements as Record<string, unknown>)) {
        if (!jeux.includes(idJeu)) continue;
        const propre = normaliserPlacement(p);
        if (propre) placements[idJeu] = propre;
      }
    }

    sortie.push({
      id,
      nom,
      icone,
      couleur,
      jeux,
      soleil: borne(o.soleil, BORNES.soleil),
      vitesse: borne(o.vitesse, BORNES.vitesse),
      aPlat: o.aPlat === true,
      placements,
    });
  }
  return sortie;
}

/** Un système neuf, avec ses réglages par défaut. */
export function nouveauSysteme(
  champs: Pick<SystemePerso, 'id' | 'nom' | 'icone' | 'couleur' | 'jeux'>,
): SystemePerso {
  return {
    ...champs,
    soleil: BORNES.soleil.defaut,
    vitesse: BORNES.vitesse.defaut,
    aPlat: false,
    placements: {},
  };
}

/**
 * Les jeux d'un système, dans son ordre, parmi ceux de la bibliothèque.
 *
 * Un jeu retiré de la bibliothèque disparaît simplement du système : garder
 * une planète pour un jeu qui n'existe plus ne désignerait rien.
 */
export function jeuxDuSysteme(s: Pick<SystemePerso, 'jeux'>, parId: ReadonlyMap<string, Game>): Game[] {
  const jeux: Game[] = [];
  for (const id of s.jeux) {
    const g = parId.get(id);
    if (g) jeux.push(g);
  }
  return jeux;
}

/** Ajoute un jeu en dernière orbite ; sans effet s'il y est déjà. */
export function ajouterJeu(s: SystemePerso, id: string): SystemePerso {
  return s.jeux.includes(id) ? s : { ...s, jeux: [...s.jeux, id] };
}

/** Retire un jeu et oublie son placement. */
export function retirerJeu(s: SystemePerso, id: string): SystemePerso {
  if (!s.jeux.includes(id)) return s;
  const placements = { ...s.placements };
  delete placements[id];
  return { ...s, jeux: s.jeux.filter((x) => x !== id), placements };
}

/** Déplace un jeu d'un cran vers le soleil (−1) ou vers l'extérieur (+1). */
export function deplacerJeu(s: SystemePerso, id: string, sens: -1 | 1): SystemePerso {
  const i = s.jeux.indexOf(id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= s.jeux.length) return s;
  const jeux = [...s.jeux];
  [jeux[i], jeux[j]] = [jeux[j], jeux[i]];
  return { ...s, jeux };
}

/** Fusionne un placement ; un champ `undefined` le rend au calcul. */
export function placer(s: SystemePerso, id: string, modif: PlacementPlanete): SystemePerso {
  const fusion: PlacementPlanete = { ...s.placements[id], ...modif };
  for (const k of Object.keys(fusion) as Array<keyof PlacementPlanete>) {
    if (fusion[k] === undefined) delete fusion[k];
  }
  const placements = { ...s.placements };
  if (Object.keys(fusion).length > 0) placements[id] = fusion;
  else delete placements[id];
  return { ...s, placements };
}

/** Identifiant libre, dérivé de l'heure pour rester lisible dans le stockage. */
export function nouvelId(existants: readonly SystemePerso[], maintenant = Date.now()): string {
  const pris = new Set(existants.map((s) => s.id));
  const base = maintenant.toString(36);
  let id = base;
  for (let n = 1; pris.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Ajoute un système, ou remplace celui qui porte son identifiant, à sa place. */
export function remplacerSysteme(liste: readonly SystemePerso[], s: SystemePerso): SystemePerso[] {
  const i = liste.findIndex((x) => x.id === s.id);
  if (i < 0) return [...liste, s];
  const copie = [...liste];
  copie[i] = s;
  return copie;
}

export function retirerSysteme(liste: readonly SystemePerso[], id: string): SystemePerso[] {
  return liste.filter((s) => s.id !== id);
}

/** Couleur #rrggbb en entier, pour Three.js. Gris neutre si elle est invalide. */
export function couleurEntier(hex: string): number {
  return HEX.test(hex) ? parseInt(hex.slice(1), 16) : 0x7a8a9a;
}
