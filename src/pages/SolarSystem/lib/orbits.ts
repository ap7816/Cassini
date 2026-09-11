import * as THREE from 'three';
import type { Game } from '../../../features/types';
import { ORB_BASE, PLN_R_MAX, PLN_R_MIN } from '../constants';
import { lireReglages } from '../../../features/debug/tuning';

// Angle d'or (~137,5°). Espacer les planètes de cet angle garantit qu'elles se
// répartissent tout autour du soleil sans jamais s'aligner, quel que soit leur
// nombre — c'est la même propriété qui empêche les graines de tournesol de
// former des rangées. Un tirage purement aléatoire, lui, produit des paquets.
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Rayon de la k-ième orbite. L'écartement s'élargit légèrement vers l'extérieur
 * (façon Titius–Bode) pour que le système intérieur reste compact.
 *
 * `base` est le rayon de la première orbite. Il est paramétrable parce qu'il
 * doit dégager le soleil et sa couronne, dont la taille dépend de celle du
 * système : à valeur fixe, les premières orbites d'une grande bibliothèque se
 * retrouvaient à l'intérieur de la couronne.
 */
export function orbitRadius(k: number, step: number, base: number = ORB_BASE): number {
  return base + step * k * (1 + k * 0.018);
}

/**
 * Position sur une orbite circulaire inclinée.
 *
 * Doit reproduire exactement les rotations appliquées au tore de l'orbite :
 *   orbMesh.rotation.x = PI/2 + inc      → Rx(inc) après mise à plat en XZ
 *   orbMesh.rotateOnWorldAxis(Y, node)   → Ry(node)
 *
 * Conventions standard de three.js :
 *   Rx(θ) : y' = y·cosθ − z·sinθ ,  z' = y·sinθ + z·cosθ
 *   Ry(θ) : x' = x·cosθ + z·sinθ ,  z' = −x·sinθ + z·cosθ
 *
 * Écrire ces rotations avec le signe opposé désaligne la planète de son anneau
 * — l'écart atteignait 284 unités, soit près du double du rayon orbital.
 */
export function orbitPos(
  r: number,
  a: number,
  inc: number,
  node: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;

  // Rx(inc) appliqué à (x, 0, z)
  const y = -z * Math.sin(inc);
  const z2 = z * Math.cos(inc);

  // Ry(node)
  out.set(
    x * Math.cos(node) + z2 * Math.sin(node),
    y,
    -x * Math.sin(node) + z2 * Math.cos(node),
  );
  return out;
}

/**
 * Échelle de taille des planètes d'après l'espace disque occupé par le jeu.
 *
 * La normalisation se fait sur la bibliothèque courante plutôt que sur une
 * échelle absolue : le plus gros jeu occupe toujours le haut de la plage et le
 * plus petit le bas, quelle que soit la bibliothèque.
 *
 * L'exposant 0,7 (au lieu d'une racine carrée) creuse volontairement l'écart :
 * dans une bibliothèque allant jusqu'à 120 Go, un jeu de 50 Go fait environ
 * 0,65× le rayon du plus gros — la différence se voit immédiatement, sans que
 * les petits jeux ne deviennent des points invisibles. L'exposant se règle par
 * `tailleContraste`, dont 0,7 est le défaut.
 */

export function makeRadiusScale(games: Game[]): (g: Game) => number {
  const sizes = games.map((g) => g.sizeOnDisk ?? 0).filter((s) => s > 0);

  if (sizes.length === 0) {
    // Aucune taille connue : tout le monde au même diamètre médian
    const mid = (PLN_R_MIN + PLN_R_MAX) / 2;
    return () => mid;
  }

  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const span = Math.max(max - min, 1);
  const courbe = lireReglages().tailleContraste;

  return (g: Game): number => {
    const s = g.sizeOnDisk ?? 0;
    // Taille inconnue → petit, sans être le minimum absolu
    if (s <= 0) return PLN_R_MIN * 1.15;
    const t = Math.pow((s - min) / span, courbe);
    return PLN_R_MIN + (PLN_R_MAX - PLN_R_MIN) * t;
  };
}
