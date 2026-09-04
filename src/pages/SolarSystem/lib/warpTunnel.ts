/**
 * Tunnel de particules de la traversée d'un portail.
 *
 * Isolé du composant et sans dépendance au DOM au-delà du contexte de dessin :
 * c'est la partie qui décide de l'allure de l'effet, et elle se vérifie ainsi
 * sans faire tourner de navigateur — une animation ne se relit pas, elle se
 * mesure.
 */

/** Particules simultanées. Au-delà, les traits se fondent en un aplat. */
export const NOMBRE = 300;

/** Fraction des particules prenant la teinte du launcher. */
const PART_TEINTEES = 0.22;

/** Au-delà de cette distance, rapportée à la demi-diagonale, on cesse de dessiner. */
const PORTEE_MAX = 1.6;

export type Particule = {
  /** Direction, en radians. */
  angle: number;
  /** Distance de départ au centre, en pixels. */
  rayon0: number;
  /** Vivacité de la fuite — l'éloignement est exponentiel. */
  k: number;
  teintee: boolean;
  /** Épaisseur relative du trait. */
  poids: number;
};

export function semerParticules(alea: () => number = Math.random): Particule[] {
  return Array.from({ length: NOMBRE }, () => ({
    angle: alea() * Math.PI * 2,
    // Jamais exactement au centre : une particule née sur le point de fuite
    // partirait dans une direction indiscernable et clignoterait sur place.
    rayon0: 6 + alea() * 34,
    k: 4 + alea() * 2.4,
    teintee: alea() < PART_TEINTEES,
    poids: 0.6 + alea() * 1.6,
  }));
}

/**
 * Intensité d'ensemble à l'instant `u` (0 au départ, 1 à l'arrivée).
 *
 * Montée franche puis extinction : les traits ne doivent pas persister alors
 * que le voile s'est déjà levé sur le nouveau système.
 */
export function intensiteA(u: number): number {
  return Math.max(0, Math.min(1, u * 7) * Math.min(1, (1 - u) * 3.2));
}

/** Distance au centre d'une particule à l'instant `u`. */
export function rayonA(p: Particule, u: number): number {
  return p.rayon0 * Math.exp(p.k * u);
}

type Cible = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'arc' | 'fill'
  | 'createRadialGradient'
> & {
  globalCompositeOperation: string;
  globalAlpha: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
};

export type OptionsTunnel = {
  largeur: number;
  hauteur: number;
  /** Avancement de la traversée, de 0 à 1. */
  u: number;
  particules: Particule[];
  tint: string;
};

/**
 * Dessine une image du tunnel. Renvoie le nombre de traits tracés, ce qui
 * permet de constater de l'extérieur que l'effet vit et s'éteint.
 */
export function dessinerTunnel(ctx: Cible, o: OptionsTunnel): number {
  const { largeur: w, hauteur: h, u, particules, tint } = o;
  ctx.clearRect(0, 0, w, h);

  const intensite = intensiteA(u);
  if (intensite <= 0) return 0;

  const cx = w / 2;
  const cy = h / 2;
  const portee = Math.hypot(cx, cy);

  // Additif : les traits qui se croisent s'éclaircissent au lieu de se
  // recouvrir, ce qui donne au centre sa densité lumineuse.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  let traces = 0;
  for (const p of particules) {
    const r = rayonA(p, u);
    if (r > portee * PORTEE_MAX) continue;

    // Queue du trait : la position qu'occupait la particule un instant plus
    // tôt, selon la même loi. La traînée s'allonge donc d'elle-même à mesure
    // que la particule accélère — c'est ce qui donne la vitesse.
    const rq = r * Math.exp(-p.k * 0.028);

    const cos = Math.cos(p.angle);
    const sin = Math.sin(p.angle);

    // Les particules proches du centre restent discrètes : c'est le point de
    // fuite qui doit y briller, pas la mêlée des traits.
    const proximite = Math.min(1, r / (portee * 0.35));

    ctx.strokeStyle = p.teintee ? tint : '#ffffff';
    ctx.globalAlpha = intensite * (0.25 + 0.75 * proximite);
    ctx.lineWidth = p.poids * (0.5 + proximite * 1.6);

    ctx.beginPath();
    ctx.moveTo(cx + cos * rq, cy + sin * rq);
    ctx.lineTo(cx + cos * r, cy + sin * r);
    ctx.stroke();
    traces += 1;
  }

  // Point de fuite. Il enfle à l'approche du basculement puis se résorbe :
  // c'est le repère fixe qui donne son sens au reste du mouvement.
  const rayon = Math.max(1, 8 + 96 * Math.sin(Math.PI * u));
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, rayon);
  halo.addColorStop(0, '#ffffff');
  halo.addColorStop(0.35, tint);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = intensite;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return traces;
}
