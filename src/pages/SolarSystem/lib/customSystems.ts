import type { Game } from '../../../features/types';
import { ICONES_SYSTEME, ICONE_PAR_DEFAUT } from './iconesSysteme';
import { estImageIconeValide } from './imageIcone';

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
  /**
   * Anneaux de la planète : une couleur #rrggbb, ou `ANNEAU_AUCUN`. Absent, la
   * planète garde ce que le tirage lui a donné — un anneau sur trois environ.
   */
  anneau?: string;
};

/** Valeur de `PlacementPlanete.anneau` qui retire les anneaux. */
export const ANNEAU_AUCUN = 'aucun';

export type SystemePerso = {
  id: string;
  nom: string;
  /** Nom d'une icône de `ICONES_SYSTEME`. */
  icone: string;
  /**
   * Image choisie par l'utilisateur, déjà redessinée en petite icône (voir
   * `imageIcone.ts`). Quand elle est là, elle remplace `icone` — qui reste
   * renseignée, pour qu'on retombe sur un dessin si on retire l'image.
   */
  image: string | null;
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
  /**
   * Couleur du soleil, au format #rrggbb. `null` suit le réglage général.
   *
   * Distincte de `couleur`, qui teinte l'étiquette et l'icône dans la barre :
   * un système peut porter un repère vif sans que son étoile soit verte.
   */
  couleurSoleil: string | null;
  /**
   * Densité des étoiles qui entourent ce système, de 0 (aucune en plus du ciel
   * commun) à 3. Le ciel de fond est partagé par toute la galaxie ; ce nuage-là
   * appartient au système et le distingue de ses voisins.
   */
  etoiles: number;
  /** Placements, par identifiant de jeu. */
  placements: Record<string, PlacementPlanete>;
};

/** Ce que la scène doit savoir d'un système pour en placer les astres. */
export type ReglageSysteme = Pick<SystemePerso, 'soleil' | 'vitesse' | 'aPlat' | 'placements' | 'couleurSoleil' | 'etoiles'>;

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
  etoiles: { min: 0, max: 3, defaut: 0 },
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
  if (o.anneau === ANNEAU_AUCUN) p.anneau = ANNEAU_AUCUN;
  else if (typeof o.anneau === 'string' && HEX.test(o.anneau)) p.anneau = o.anneau.toLowerCase();
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
      // Une valeur qui n'a pas la forme exacte d'une icône préparée est
      // écartée : le stockage ne doit jamais faire afficher autre chose.
      image: estImageIconeValide(o.image) ? o.image : null,
      couleur,
      jeux,
      soleil: borne(o.soleil, BORNES.soleil),
      vitesse: borne(o.vitesse, BORNES.vitesse),
      aPlat: o.aPlat === true,
      couleurSoleil:
        typeof o.couleurSoleil === 'string' && HEX.test(o.couleurSoleil)
          ? o.couleurSoleil.toLowerCase()
          : null,
      etoiles: borne(o.etoiles, BORNES.etoiles),
      placements,
    });
  }
  return sortie;
}

/** Réglages d'un système qu'on n'a pas touché. */
export const REGLAGE_DEFAUT: ReglageSysteme = {
  soleil: BORNES.soleil.defaut,
  vitesse: BORNES.vitesse.defaut,
  aPlat: false,
  couleurSoleil: null,
  etoiles: BORNES.etoiles.defaut,
  placements: {},
};

/** Ce que la scène doit savoir d'un système, extrait de lui. */
export function reglageDeSysteme(s: ReglageSysteme): ReglageSysteme {
  return {
    soleil: s.soleil,
    vitesse: s.vitesse,
    aPlat: s.aPlat,
    couleurSoleil: s.couleurSoleil,
    etoiles: s.etoiles,
    placements: s.placements,
  };
}

/** Vrai quand un réglage ne change rien au système calculé. */
export function estReglageDefaut(r: ReglageSysteme): boolean {
  return JSON.stringify(reglageDeSysteme(r)) === JSON.stringify(REGLAGE_DEFAUT);
}

/**
 * Réglages des systèmes des launchers, relus depuis le stockage.
 *
 * Un launcher n'est pas un système personnalisé — ni nom, ni icône, ni jeux
 * choisis : il les tient de la bibliothèque. Mais son soleil, ses orbites et
 * ses planètes se règlent de la même façon. Chaque entrée passe donc par la
 * même normalisation, avec pour seuls jeux admis ceux qu'elle place ; un
 * placement pour un jeu disparu est sans effet, la scène ne le trouvant pas.
 */
export function normaliserReglagesLaunchers(brut: unknown): Record<string, ReglageSysteme> {
  const sortie: Record<string, ReglageSysteme> = {};
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return sortie;
  for (const [plateforme, r] of Object.entries(brut as Record<string, unknown>)) {
    if (!plateforme || estSystemePerso(plateforme) || !r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const jeux = o.placements && typeof o.placements === 'object' ? Object.keys(o.placements) : [];
    const [propre] = normaliserSystemes([{ ...o, id: plateforme, nom: plateforme, jeux }]);
    if (propre) sortie[plateforme] = reglageDeSysteme(propre);
  }
  return sortie;
}

/** Un système neuf, avec ses réglages par défaut. */
export function nouveauSysteme(
  champs: Pick<SystemePerso, 'id' | 'nom' | 'icone' | 'couleur' | 'jeux'> & { image?: string | null },
): SystemePerso {
  return {
    ...champs,
    image: champs.image ?? null,
    soleil: BORNES.soleil.defaut,
    vitesse: BORNES.vitesse.defaut,
    aPlat: false,
    couleurSoleil: null,
    etoiles: BORNES.etoiles.defaut,
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

/** Critères de rangement automatique des planètes d'un système. */
export type TriSysteme = 'az' | 'za' | 'taille' | 'recent';

/**
 * Range les planètes d'un système, de la plus proche du soleil à la plus
 * lointaine.
 *
 * Les placements ne suivent pas : une planète que l'utilisateur a posée à une
 * distance choisie y reste, c'est tout l'intérêt de l'avoir placée. Le tri ne
 * décide que de l'ordre des orbites calculées.
 *
 * Un jeu du système absent de la bibliothèque garde sa place en fin de liste
 * plutôt que d'être perdu : il peut n'être qu'absent temporairement — un
 * disque externe débranché, un scan qui n'a pas encore tourné.
 */
export function trierJeux(
  s: SystemePerso,
  parId: ReadonlyMap<string, Game>,
  critere: TriSysteme,
): SystemePerso {
  const connus = s.jeux.filter((id) => parId.has(id));
  const inconnus = s.jeux.filter((id) => !parId.has(id));

  const clef = (id: string) => parId.get(id)!;
  const parNom = (a: string, b: string) =>
    clef(a).title.localeCompare(clef(b).title, undefined, { sensitivity: 'base', numeric: true });

  const ranges = [...connus];
  if (critere === 'az') ranges.sort(parNom);
  else if (critere === 'za') ranges.sort((a, b) => parNom(b, a));
  else if (critere === 'taille') {
    // La plus grosse au plus près du soleil : c'est elle qu'on vient voir.
    ranges.sort((a, b) => (clef(b).sizeOnDisk ?? 0) - (clef(a).sizeOnDisk ?? 0) || parNom(a, b));
  } else {
    // Jamais jouée en dernier, et non en premier : une date absente n'est pas
    // une date ancienne, mais elle intéresse moins que la partie d'hier.
    ranges.sort((a, b) => {
      const da = clef(a).lastPlayedAt ?? '';
      const db = clef(b).lastPlayedAt ?? '';
      if (da === db) return parNom(a, b);
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    });
  }

  return { ...s, jeux: [...ranges, ...inconnus] };
}
