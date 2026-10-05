/**
 * L'aspiration de l'écran par le trou noir.
 *
 * Le ciel, lui, est un nuanceur : on y retranche à la direction du regard une
 * déviation inversement proportionnelle à l'angle qui le sépare de la masse,
 * et les étoiles cachées ressortent en anneau autour de l'ombre. L'interface,
 * elle, est du HTML — pas de nuanceur, pas de direction de regard. Il faut
 * donc obtenir la même chose autrement.
 *
 * Le moyen est un filtre SVG. `feDisplacementMap` relit chaque pixel ailleurs
 * qu'à sa place, et l'« ailleurs » est lu dans une image : le rouge porte le
 * décalage horizontal, le vert le vertical, 128 voulant dire « ne bouge pas ».
 * On dessine donc une fois pour toutes une carte d'attraction — en chaque
 * point, de combien et vers où aller chercher ce qu'on affichera là — et on la
 * pose sur l'écran, centrée sur l'objet.
 *
 * Aller chercher **plus loin du centre** ce qu'on affiche **plus près** fait
 * couler l'image vers le trou. C'est la seule idée du fichier.
 *
 * Toute la question est de savoir **dans quel sens**, et de combien selon
 * l'endroit. Un décalage qui serait fort près du trou et faible au loin vide
 * le milieu de l'écran plus vite qu'il n'est réapprovisionné : il en sort un
 * disque noir qui s'étale, c'est-à-dire un trou qui grossit, et ce n'est pas
 * ce qu'on veut voir. Le décalage croît donc **avec la distance** : chaque
 * point va chercher ce qui se trouvait un peu plus loin que lui, d'autant plus
 * loin qu'il en est lui-même éloigné, et l'image entière glisse vers le centre
 * sans jamais s'y creuser. Elle se resserre, et le bord de l'écran se vide le
 * premier — puisque rien ne vient de l'extérieur de la fenêtre.
 *
 * L'objet, lui, garde sa taille du début à la fin. Ce n'est pas lui qui mange
 * l'écran : c'est l'écran qui part dedans.
 *
 * Le vissage, à l'inverse, est d'autant plus serré qu'on est près : loin, un
 * glissement à peine incliné ; près, une spirale. C'est ce qui donne le
 * tourbillon plutôt qu'un simple rétrécissement.
 *
 * Trois détails qui, omis, se voient tout de suite :
 *
 * — `feFlood` remplit d'abord toute la région du filtre de gris neutre. Sans
 *   lui, partout où la carte ne porte pas, le canal vaudrait 0 au lieu de 128,
 *   et le reste de la page partirait d'un bloc d'un demi-écran de côté.
 *
 * — 128 n'est pas tout à fait le milieu de 0..255. Le biais est minuscule,
 *   mais il est multiplié par l'échelle du décalage : l'écran entier part de
 *   plusieurs pixels de travers, d'un coup, quand le filtre s'allume et quand
 *   il s'éteint. `feOffset` le reprend.
 *
 * — rien n'est déplacé. Le nœud ne se réduit pas, ne tourne pas, ne bouge pas
 *   d'un pixel : le filtre travaille donc dans les coordonnées de l'écran,
 *   telles que la scène les annonce, et il n'y a aucun repère à faire
 *   concorder.
 */

import type { Aspiration } from './aspirationEcran';

const ID_SVG = 'cassini-lentille';
const ID_FILTRE = 'cassini-lentille-puits';

/** Côté de l'image de la carte. Elle est lisse : l'interpolation suffit. */
const TAILLE_CARTE = 512;

/**
 * Côté de la carte à l'écran, en diagonales de fenêtre.
 *
 * Elle couvre largement l'écran, où que l'objet se tienne — y compris dans un
 * coin — de sorte que son propre bord, où l'attraction s'éteint, reste
 * toujours hors champ. C'est ce qui permet à la déformation de porter jusque
 * dans les angles sans qu'une couture n'apparaisse nulle part.
 */
const PORTEE_CARTE = 2.1;

/**
 * Rayon de l'objet, en parts du rayon de la carte.
 *
 * Il ne sert qu'au vissage, dont il règle le serrement, et au petit disque
 * noir qui tient lieu de trou. Il ne bouge pas de l'événement.
 */
const COEUR = 0.06;

/**
 * Comment le glissement croît avec la distance.
 *
 * Un peu plus que proportionnellement : le lointain rentre légèrement plus
 * vite qu'il ne faudrait pour un simple rétrécissement, de sorte que l'image
 * se tasse en approchant au lieu de garder ses proportions. Beaucoup plus, et
 * les bords rattraperaient le milieu, ce qui se replierait sur soi.
 */
const PENTE = 1.05;

/**
 * Le vissage, en parts du glissement.
 *
 * Une aspiration droite ne tourne pas : l'image se resserre vers le point, et
 * c'est tout. Or rien ne tombe droit sur une masse — tout ce qui l'approche
 * s'enroule, et d'autant plus vite qu'il est près. Loin, l'image glisse à
 * peine de travers ; près, elle fait un tiers de tour avant d'entrer.
 */
const TOURBILLON = 1.6;

/** Milieu exact de l'encodage ; 128 est juste à côté, et `feOffset` répare. */
const BIAIS = 128 / 255 - 0.5;

/**
 * Le glissement vers le trou : nul au centre, croissant avec la distance.
 *
 * C'est ce sens-là qui fait couler l'image sans la creuser (voir l'en-tête).
 * Hors de la carte, il est maintenu à sa valeur du bord — la carte couvre de
 * toute façon plus que l'écran, et une extinction brutale s'y verrait.
 */
export function attraction(r: number): number {
  return Math.min(1, r) ** PENTE;
}

/**
 * Le vissage : en angle, d'autant plus serré qu'on approche.
 *
 * Rendu en part du rayon, comme le glissement, pour qu'il s'encode dans la
 * même carte.
 */
export function vissage(r: number): number {
  return Math.min(1, r) * TOURBILLON * (COEUR / (r + COEUR)) ** 0.6;
}

/**
 * Le plus grand décalage que la carte porte, tourbillon compris.
 *
 * Il sert à deux choses à la fois, et c'est pour cela qu'il est calculé plutôt
 * qu'écrit à la main : l'encodage s'y normalise, pour que les 256 niveaux
 * servent tous — sans quoi une fraction seulement serait utilisée et l'image
 * déformée avancerait par marches — et l'échelle du filtre le reprend, pour
 * que le résultat retombe sur la portée demandée.
 */
export function amplitudeMax(): number {
  let m = 0;
  for (let i = 0; i <= 1000; i++) {
    const r = i / 1000;
    m = Math.max(m, Math.hypot(attraction(r), vissage(r)));
  }
  return m;
}

const AMPLITUDE = amplitudeMax();

export type ParametresLentille = {
  /** Côté de la carte à l'écran, en pixels. */
  taille: number;
  /** Échelle du décalage passée au filtre. */
  echelle: number;
  /** Décalage uniforme à reprendre, en pixels. */
  biais: number;
  /** De combien le fond du puits va chercher plus loin, en pixels. */
  portee: number;
  /** Rayon de l'objet lui-même : noir, et borné. */
  rayonTrou: number;
  /** Rayon où l'image est intacte ; entre les deux, elle s'efface. */
  rayonBord: number;
  /** Ce qu'il reste de l'image à voir, de 1 à 0 sur le dernier quart. */
  reste: number;
};

/**
 * Ce que la force demande, en pixels. Séparé du DOM : c'est la seule partie
 * qui mérite d'être relue, et la seule qui se teste.
 *
 * Une seule chose grandit : de combien l'image va chercher plus loin. La carte,
 * elle, ne bouge pas — sa forme est la même du début à la fin, c'est sa force
 * qui monte. L'écran se vide donc par ses bords, puis par ce qui reste, sans
 * que rien n'ait eu à s'élargir pour le recouvrir.
 */
export function parametresLentille(force: number, largeur: number, hauteur: number): ParametresLentille {
  const diagonale = Math.hypot(largeur, hauteur) || 1;
  const f = Math.max(0, Math.min(1, force));

  // De combien le bord de la carte va chercher plus loin, au comble.
  //
  // Une demi-diagonale, et pas davantage : c'est la précision de la carte qui
  // décide. Elle tient sur huit bits, donc sur 256 niveaux ; au-delà d'environ
  // trois pixels de décalage entre deux niveaux voisins, l'image ne glisse
  // plus, elle se déchire en gaufrage régulier. Ce plafond ramène l'image à
  // deux tiers de sa taille, serrée et vissée autour du trou — le reste de la
  // disparition est affaire d'extinction, pas de décalage.
  const portee = diagonale * 0.5 * f ** 1.3;

  return {
    taille: diagonale * PORTEE_CARTE,
    echelle: 2 * portee,
    biais: 2 * portee * BIAIS,
    portee,
    // L'objet ne grandit pas. Il paraît en même temps que l'aspiration, tient
    // sa taille jusqu'au bout, et c'est tout : ce n'est pas lui qui mange
    // l'écran, c'est l'écran qui part dedans.
    rayonTrou: diagonale * 0.035 * Math.min(1, f * 4),
    rayonBord: diagonale * 0.05 * Math.min(1, f * 4),
    // Ce qu'il reste à voir. L'image, une fois resserrée et tordue autour du
    // trou, s'éteint sur le dernier quart : la faire disparaître par le
    // décalage seul demanderait une carte que huit bits ne portent pas.
    reste: 1 - lissage((f - 0.76) / 0.24),
  };
}

/** Marche douce de 0 à 1, dérivée nulle aux deux bouts. */
function lissage(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * La carte, construite au premier besoin.
 *
 * `undefined` : pas encore tenté. `null` : impossible ici — pas de canvas,
 * donc pas de déformation, et l'aspiration ne fait rien.
 */
let carte: string | null | undefined;

function carteDuPuits(): string | null {
  if (carte !== undefined) return carte;
  carte = null;

  const toile = document.createElement('canvas');
  toile.width = TAILLE_CARTE;
  toile.height = TAILLE_CARTE;
  const ctx = toile.getContext('2d');
  if (!ctx) return carte;

  const image = ctx.createImageData(TAILLE_CARTE, TAILLE_CARTE);
  const px = image.data;
  for (let y = 0; y < TAILLE_CARTE; y++) {
    const v = ((y + 0.5) / TAILLE_CARTE) * 2 - 1;
    for (let x = 0; x < TAILLE_CARTE; x++) {
      const u = ((x + 0.5) / TAILLE_CARTE) * 2 - 1;
      const r = Math.hypot(u, v);

      // Deux directions : celle qui s'éloigne du centre — aller chercher plus
      // loin, c'est faire couler l'image vers le trou — et celle qui tourne
      // autour, qui la fait se visser en descendant. Chacune a sa loi : la
      // première croît avec la distance, la seconde se resserre en approchant.
      const g = attraction(r) / AMPLITUDE;
      const t = vissage(r) / AMPLITUDE;
      const ux = u / (r || 1);
      const uy = v / (r || 1);

      const i = (y * TAILLE_CARTE + x) * 4;
      px[i] = 128 + Math.round(127 * (g * ux - t * uy));
      px[i + 1] = 128 + Math.round(127 * (g * uy + t * ux));
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  carte = toile.toDataURL('image/png');
  return carte;
}

type Pieces = {
  image: SVGElement;
  deplacement: SVGElement;
  decalage: SVGElement;
};

let pieces: Pieces | null = null;

function filtre(): Pieces | null {
  if (pieces) return pieces;

  const image = carteDuPuits();
  if (!image) return null;

  const NS = 'http://www.w3.org/2000/svg';
  const el = (nom: string, attrs: Record<string, string>): SVGElement => {
    const n = document.createElementNS(NS, nom);
    for (const [k, val] of Object.entries(attrs)) n.setAttribute(k, val);
    return n;
  };

  const svg = el('svg', { id: ID_SVG, 'aria-hidden': 'true' });
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');

  // La région du filtre colle à la coque.
  //
  // Elle la débordait d'un cinquième de chaque côté, par habitude : c'est deux
  // fois plus de pixels à calculer à chaque image, pour une bande qui n'est
  // jamais regardée — rien ne sort de l'écran ici, tout y rentre. Et le coût
  // n'est pas théorique : mesuré à trente-six millisecondes par image au plus
  // fort de l'aspiration, quand le décalage va chercher à mille pixels.
  const f = el('filter', {
    id: ID_FILTRE,
    x: '-2%',
    y: '-2%',
    width: '104%',
    height: '104%',
    // Sans cela, les canaux seraient relus comme de la lumière et non comme
    // des nombres : la carte serait fausse de bout en bout.
    'color-interpolation-filters': 'sRGB',
  });

  const puits = el('feImage', {
    href: image,
    x: '0',
    y: '0',
    width: '0',
    height: '0',
    preserveAspectRatio: 'none',
    result: 'puits',
  });
  puits.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', image);

  const deplacement = el('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'carte',
    scale: '0',
    xChannelSelector: 'R',
    yChannelSelector: 'G',
    result: 'deforme',
  });

  const decalage = el('feOffset', { in: 'deforme', dx: '0', dy: '0' });

  f.append(
    el('feFlood', { 'flood-color': 'rgb(128,128,128)', 'flood-opacity': '1', result: 'neutre' }),
    puits,
    el('feComposite', { in: 'puits', in2: 'neutre', operator: 'over', result: 'carte' }),
    deplacement,
    decalage,
  );
  svg.append(f);
  document.body.append(svg);

  pieces = { image: puits, deplacement, decalage };
  return pieces;
}

/**
 * Pose l'état de l'aspiration sur un nœud, ou le remet d'aplomb avec `null`.
 *
 * Écrit en direct dans le style, sans passer par un état React : l'aspiration
 * change à chaque image pendant une quinzaine de secondes, et re-rendre
 * l'application entière soixante fois par seconde pour une farce serait un
 * comble.
 */
export function appliquerAspiration(noeud: HTMLElement, a: Aspiration | null): void {
  if (!a) {
    noeud.style.opacity = '';
    noeud.style.filter = '';
    noeud.style.maskImage = '';
    noeud.style.webkitMaskImage = '';
    document.documentElement.style.background = '';
    document.body.style.background = '';
    return;
  }

  // Ce qui reste là où l'image est partie : du noir, et non la couleur de la
  // page. Ce n'est pas une pièce derrière — c'est là qu'elle part.
  document.documentElement.style.background = '#000';
  document.body.style.background = '#000';

  const p = parametresLentille(a.force, window.innerWidth, window.innerHeight);
  const pieces = filtre();
  if (!pieces) return;

  pieces.image.setAttribute('x', String(a.x - p.taille / 2));
  pieces.image.setAttribute('y', String(a.y - p.taille / 2));
  pieces.image.setAttribute('width', String(p.taille));
  pieces.image.setAttribute('height', String(p.taille));
  pieces.deplacement.setAttribute('scale', String(p.echelle));
  pieces.decalage.setAttribute('dx', String(-p.biais));
  pieces.decalage.setAttribute('dy', String(-p.biais));
  noeud.style.filter = `url(#${ID_FILTRE})`;
  noeud.style.opacity = String(p.reste);

  const trou =
    `radial-gradient(circle at ${a.x}px ${a.y}px,`
    + ` transparent 0, transparent ${p.rayonTrou}px, #000 ${p.rayonBord}px)`;
  noeud.style.maskImage = trou;
  noeud.style.webkitMaskImage = trou;
}

/** Pour les tests : oublie ce qui a été construit. */
export function oublierLentille(): void {
  document.getElementById(ID_SVG)?.remove();
  document.documentElement.style.background = '';
  document.body.style.background = '';
  pieces = null;
  carte = undefined;
}
