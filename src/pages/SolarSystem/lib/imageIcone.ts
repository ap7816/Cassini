/**
 * Image choisie par l'utilisateur comme icône d'un système.
 *
 * Une icône s'affiche entre 20 et 40 pixels. Ce qu'on importe, en revanche,
 * peut être n'importe quoi : un logo détouré, une capture d'écran de 4 000
 * pixels, une bannière très large, une icône en pixel art de 16 pixels. Aucune
 * n'est gardée telle quelle : chacune est redessinée dans un carré de
 * `COTE_ICONE` pixels, de la façon qui lui convient.
 *
 * - **Détourée** (canal alpha utilisé) : c'est un logo. Ses marges vides sont
 *   rognées, puis il est centré *entier* avec un peu d'air — le couper serait
 *   le rendre méconnaissable.
 * - **Opaque** : c'est une photo ou une capture. Elle est recadrée au centre
 *   pour remplir le carré — des bandes vides autour d'une photo réduite à
 *   30 pixels ne laisseraient plus rien voir.
 * - **Minuscule** : c'est du pixel art. Agrandie d'un facteur entier sans
 *   lissage, elle reste nette au lieu de devenir floue.
 *
 * Le stockage ne reçoit donc jamais que quelques kilo-octets de PNG ou de WebP,
 * et jamais de SVG : un SVG importé est rastérisé ici, ce qui écarte d'emblée
 * tout ce qu'un fichier SVG peut embarquer d'autre qu'un dessin.
 *
 * Les calculs de cadrage sont purs et testés ; seul `preparerImageIcone` touche
 * au DOM.
 */

/** Côté de l'image produite. Deux fois la plus grande taille d'affichage. */
export const COTE_ICONE = 128;

/** Règles d'import, affichées telles quelles à l'utilisateur. */
export const REGLES_IMAGE = {
  types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp'],
  /** Au-delà, le décodage seul ferait attendre sans rien apporter. */
  poidsMax: 8 * 1024 * 1024,
  /** En deçà, il n'y a plus de quoi faire une icône. */
  coteMin: 16,
} as const;

/** Sous ce côté, l'image est traitée comme du pixel art. */
const COTE_PIXEL_ART = 48;
/** Air laissé autour d'un logo détouré, en part du côté. */
const MARGE_LOGO = 0.08;
/** Alpha en deçà duquel un pixel compte comme vide. */
const SEUIL_ALPHA = 12;
/** Plus grand côté de travail pour une image matricielle. */
const BASE_MAX = 2048;
/** Côté auquel un SVG est rastérisé : assez pour rester net une fois réduit. */
const BASE_SVG = 1024;

export type ErreurImage = 'type' | 'poids' | 'petite' | 'illisible';

export type Boite = { x: number; y: number; largeur: number; hauteur: number };

export type PlanDessin = {
  /** Portion de l'image source à reprendre. */
  source: Boite;
  /** Où la poser dans le carré de sortie. */
  cible: Boite;
  /** Lissage à l'agrandissement : désactivé pour le pixel art. */
  lisser: boolean;
};

/** Vérifie ce qui peut l'être avant même de décoder le fichier. */
export function verifierFichier(f: { type: string; size: number }): ErreurImage | null {
  if (!(REGLES_IMAGE.types as readonly string[]).includes(f.type)) return 'type';
  if (f.size > REGLES_IMAGE.poidsMax) return 'poids';
  return null;
}

/**
 * Plus petit rectangle contenant tous les pixels visibles, dans une image RGBA.
 * `null` si l'image est entièrement transparente.
 */
export function boiteVisible(
  rgba: ArrayLike<number>,
  largeur: number,
  hauteur: number,
): Boite | null {
  let x0 = largeur,
    y0 = hauteur,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (rgba[(y * largeur + x) * 4 + 3] > SEUIL_ALPHA) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, largeur: x1 - x0 + 1, hauteur: y1 - y0 + 1 };
}

/** Vrai si un pixel au moins n'est pas entièrement opaque. */
export function estDetouree(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true;
  return false;
}

/**
 * Décide ce qu'on reprend de l'image et où on le pose.
 *
 * @param largeur, hauteur  dimensions de l'image source
 * @param visible           boîte des pixels visibles (image détourée), sinon `null`
 * @param cote              côté du carré de sortie
 */
export function planDessin(
  largeur: number,
  hauteur: number,
  visible: Boite | null,
  cote: number = COTE_ICONE,
): PlanDessin {
  // Pixel art : agrandissement entier, sans lissage, centré. On garde l'image
  // entière — à cette taille, chaque pixel compte.
  if (Math.max(largeur, hauteur) <= COTE_PIXEL_ART) {
    const zone = visible ?? { x: 0, y: 0, largeur, hauteur };
    const facteur = Math.max(1, Math.floor(cote / Math.max(zone.largeur, zone.hauteur)));
    const l = zone.largeur * facteur,
      h = zone.hauteur * facteur;
    return {
      source: zone,
      cible: {
        x: Math.round((cote - l) / 2),
        y: Math.round((cote - h) / 2),
        largeur: l,
        hauteur: h,
      },
      lisser: false,
    };
  }

  // Logo détouré : marges vides rognées, dessin entier centré avec de l'air.
  if (visible) {
    const utile = cote * (1 - 2 * MARGE_LOGO);
    const echelle = utile / Math.max(visible.largeur, visible.hauteur);
    const l = visible.largeur * echelle,
      h = visible.hauteur * echelle;
    return {
      source: visible,
      cible: { x: (cote - l) / 2, y: (cote - h) / 2, largeur: l, hauteur: h },
      lisser: true,
    };
  }

  // Photo opaque : recadrage centré qui remplit tout le carré.
  const c = Math.min(largeur, hauteur);
  return {
    source: { x: (largeur - c) / 2, y: (hauteur - c) / 2, largeur: c, hauteur: c },
    cible: { x: 0, y: 0, largeur: cote, hauteur: cote },
    lisser: true,
  };
}

/** Motif d'une image acceptée en stockage : PNG, WebP ou JPEG en base64. */
const DATA_URL = /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$/;
/** Une icône de 128 px pèse quelques dizaines de kilo-octets au pire. */
const LONGUEUR_MAX = 200_000;

/** Vrai pour une image produite par `preparerImageIcone`, et rien d'autre. */
export function estImageIconeValide(v: unknown): v is string {
  return typeof v === 'string' && v.length <= LONGUEUR_MAX && DATA_URL.test(v);
}

// ── Partie DOM ─────────────────────────────────────────────────────────────

function toile(l: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(l));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d indisponible');
  return [c, ctx];
}

async function decoder(fichier: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // L'image décodée garde ses pixels : l'URL n'est plus nécessaire.
    URL.revokeObjectURL(url);
  }
}

/**
 * Réduit par paliers successifs de moitié jusqu'à la taille voulue.
 *
 * Passer d'un coup de 4 000 à 128 pixels n'échantillonne qu'un pixel sur trente :
 * les traits fins disparaissent et les aplats crénèlent. Chaque palier moyenne
 * les pixels qu'il abandonne.
 */
function reduire(
  image: CanvasImageSource,
  source: Boite,
  largeur: number,
  hauteur: number,
): HTMLCanvasElement {
  let courant: CanvasImageSource = image;
  let zone = source;
  while (zone.largeur / 2 >= largeur && zone.hauteur / 2 >= hauteur) {
    const [c, ctx] = toile(zone.largeur / 2, zone.hauteur / 2);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(courant, zone.x, zone.y, zone.largeur, zone.hauteur, 0, 0, c.width, c.height);
    courant = c;
    zone = { x: 0, y: 0, largeur: c.width, hauteur: c.height };
  }
  const [c, ctx] = toile(largeur, hauteur);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(courant, zone.x, zone.y, zone.largeur, zone.hauteur, 0, 0, c.width, c.height);
  return c;
}

/**
 * Transforme un fichier choisi en icône prête à stocker.
 *
 * Renvoie une URL `data:` de `COTE_ICONE` pixels de côté, ou l'erreur qui
 * explique pourquoi le fichier est refusé.
 */
export async function preparerImageIcone(
  fichier: File,
): Promise<{ image: string } | { erreur: ErreurImage }> {
  const refus = verifierFichier(fichier);
  if (refus) return { erreur: refus };

  let img: HTMLImageElement;
  try {
    img = await decoder(fichier);
  } catch {
    return { erreur: 'illisible' };
  }

  // Un SVG sans dimensions intrinsèques en annonce zéro : on lui en donne.
  const estSvg = fichier.type === 'image/svg+xml';
  const largeurNat = img.naturalWidth || (estSvg ? 512 : 0);
  const hauteurNat = img.naturalHeight || (estSvg ? 512 : 0);
  if (!largeurNat || !hauteurNat) return { erreur: 'illisible' };
  if (!estSvg && Math.max(largeurNat, hauteurNat) < REGLES_IMAGE.coteMin)
    return { erreur: 'petite' };

  // Toute la suite part d'une toile de dimensions connues, et non de l'image.
  //
  // Deux raisons. Un SVG n'a pas de pixels : découper un rectangle « source »
  // dans ses coordonnées propres ne correspond pas à ce qu'on a mesuré en le
  // dessinant — le logo ressortait minuscule au milieu du carré. Le dessiner
  // entier sur une toile règle la question. Et une photo de 8 000 pixels n'a
  // pas besoin d'être traitée à cette taille pour produire 128 pixels.
  const echelleBase = estSvg
    ? BASE_SVG / Math.max(largeurNat, hauteurNat)
    : Math.min(1, BASE_MAX / Math.max(largeurNat, hauteurNat));
  const [base, ctxBase] = toile(largeurNat * echelleBase, hauteurNat * echelleBase);
  ctxBase.imageSmoothingQuality = 'high';
  ctxBase.drawImage(img, 0, 0, base.width, base.height);
  const largeur = base.width;
  const hauteur = base.height;

  // Analyse sur une copie réduite : lire les pixels d'une image de plusieurs
  // mégapixels coûterait des centaines de millisecondes pour le même verdict.
  const echelleSonde = Math.min(1, 256 / Math.max(largeur, hauteur));
  const [sonde, ctxSonde] = toile(largeur * echelleSonde, hauteur * echelleSonde);
  ctxSonde.drawImage(base, 0, 0, sonde.width, sonde.height);
  const pixels = ctxSonde.getImageData(0, 0, sonde.width, sonde.height).data;

  const detouree = estDetouree(pixels);
  let visible: Boite | null = null;
  if (detouree) {
    const b = boiteVisible(pixels, sonde.width, sonde.height);
    if (!b) return { erreur: 'illisible' };
    // Retour aux coordonnées de la toile, en arrondissant vers l'extérieur
    // pour ne rogner aucun pixel du bord.
    const x0 = Math.max(0, Math.floor(b.x / echelleSonde));
    const y0 = Math.max(0, Math.floor(b.y / echelleSonde));
    const x1 = Math.min(largeur, Math.ceil((b.x + b.largeur) / echelleSonde));
    const y1 = Math.min(hauteur, Math.ceil((b.y + b.hauteur) / echelleSonde));
    visible = { x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0 };
  }

  const plan = planDessin(largeur, hauteur, visible);
  const [sortie, ctx] = toile(COTE_ICONE, COTE_ICONE);

  if (plan.lisser) {
    const reduite = reduire(base, plan.source, plan.cible.largeur, plan.cible.hauteur);
    ctx.drawImage(reduite, plan.cible.x, plan.cible.y, plan.cible.largeur, plan.cible.hauteur);
  } else {
    ctx.imageSmoothingEnabled = false;
    const { source: s, cible: c } = plan;
    ctx.drawImage(base, s.x, s.y, s.largeur, s.hauteur, c.x, c.y, c.largeur, c.hauteur);
  }

  // PNG pour garder la transparence, WebP sinon — et JPEG si le moteur ne sait
  // pas encoder le WebP, ce qu'il signale en rendant du PNG.
  let url = detouree ? sortie.toDataURL('image/png') : sortie.toDataURL('image/webp', 0.9);
  if (!detouree && !url.startsWith('data:image/webp')) url = sortie.toDataURL('image/jpeg', 0.9);

  return estImageIconeValide(url) ? { image: url } : { erreur: 'illisible' };
}
