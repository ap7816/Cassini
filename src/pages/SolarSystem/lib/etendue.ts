import type { ReglageSysteme } from './customSystems';
import type { TailleSysteme } from './systemSize';

/**
 * Distance minimale entre une planète et le centre de son soleil.
 *
 * Au plus près, la surface de la planète dégage la couronne. Sans ce plancher,
 * agrandir le soleil ou rapprocher une planète la ferait disparaître à
 * l'intérieur de l'astre.
 */
export function distanceMini(sunR: number, soleil: number, rayonVisuel: number): number {
  return sunR * soleil * 2.2 + rayonVisuel;
}

/** Distance maximale proposée, en multiples de l'orbite externe calculée. */
export const ETENDUE_MAX = 2.5;

/**
 * Encombrement d'un système une fois ses placements appliqués.
 *
 * La galaxie dispose ses systèmes d'après leur rayon : une planète écartée
 * au-delà de l'orbite externe calculée, ou un soleil agrandi, doivent élargir
 * ce rayon, sans quoi le système empiéterait sur ses voisins. Rien ne
 * rétrécit : un système ramassé garde la place prévue pour son nombre de jeux.
 *
 * @param rayonMax rayon visuel le plus grand possible pour une planète
 */
export function etendreTaille(
  t: TailleSysteme,
  reglage: ReglageSysteme | null,
  rayonMax: number,
): TailleSysteme {
  if (!reglage) return t;

  const sunR = t.sunR * reglage.soleil;
  let outerR = Math.max(t.outerR, distanceMini(t.sunR, reglage.soleil, rayonMax));
  for (const p of Object.values(reglage.placements)) {
    if (p.distance !== undefined) outerR = Math.max(outerR, p.distance + rayonMax * (p.taille ?? 1));
  }

  return {
    ...t,
    sunR,
    outerR,
    // Même formule que `dimensionnerSysteme`, ceinture comprise.
    systemR: outerR * 1.55 + sunR * 2,
  };
}
