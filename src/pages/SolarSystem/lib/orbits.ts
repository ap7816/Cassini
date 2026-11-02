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
  out.set(x * Math.cos(node) + z2 * Math.sin(node), y, -x * Math.sin(node) + z2 * Math.cos(node));
  return out;
}

/**
 * Inverse d'`orbitPos` : la distance et l'angle d'un point du plan orbital.
 *
 * Sert à poser une planète là où on la lâche. Le point est exprimé dans le
 * repère du système — son soleil à l'origine — et supposé dans le plan de
 * l'orbite, que définissent `inc` et `node` ; hors de ce plan, sa composante
 * normale est ignorée.
 *
 * @returns l'angle en radians, dans [0, 2π[
 */
export function positionSurOrbite(
  p: THREE.Vector3,
  inc: number,
  node: number,
): { distance: number; angle: number } {
  // Ry(-node)
  const x = p.x * Math.cos(node) - p.z * Math.sin(node);
  const z1 = p.x * Math.sin(node) + p.z * Math.cos(node);
  // Rx(-inc) : seule la composante dans le plan compte
  const z = -p.y * Math.sin(inc) + z1 * Math.cos(inc);

  const angle = Math.atan2(z, x);
  return { distance: Math.hypot(x, z), angle: angle < 0 ? angle + Math.PI * 2 : angle };
}

/** Normale au plan d'une orbite : l'axe Y tourné comme dans `orbitPos`. */
export function normaleOrbite(inc: number, node: number, out: THREE.Vector3): THREE.Vector3 {
  const y = Math.cos(inc);
  const z = Math.sin(inc);
  return out.set(z * Math.sin(node), y, z * Math.cos(node));
}

/** Ce qui fait la taille d'une planète. */
export type CritereTaille = 'disque' | 'tempsDeJeu';

let critereCourant: CritereTaille = 'disque';

/**
 * Choisit ce qui fait la taille des planètes pour les prochaines constructions.
 *
 * Un réglage de l'application, lu comme les réglages de la scène au moment de
 * bâtir un système — la page le pose avant la scène, et la reconstruit quand
 * il change (voir `cleScene`).
 */
export function definirCritereTaille(c: CritereTaille): void {
  critereCourant = c;
}

/**
 * Échelle de taille des planètes d'après l'espace disque occupé par le jeu,
 * ou d'après le temps de jeu (voir `CritereTaille`).
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

export function makeRadiusScale(
  games: Game[],
  critere: CritereTaille = critereCourant,
): (g: Game) => number {
  // Au temps de jeu, seulement si ce système en connaît un : un système Epic
  // n'a que l'espace disque, et le garde plutôt que de tout mettre à la même
  // taille. Un jeu Steam jamais lancé retombe alors parmi les petits.
  const parTemps = critere === 'tempsDeJeu' && games.some((g) => (g.playtimeMinutes ?? 0) > 0);
  const mesure = (g: Game) => (parTemps ? g.playtimeMinutes : g.sizeOnDisk) ?? 0;
  const sizes = games.map(mesure).filter((s) => s > 0);

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
    const s = mesure(g);
    // Taille inconnue → petit, sans être le minimum absolu
    if (s <= 0) return PLN_R_MIN * 1.15;
    const t = Math.pow((s - min) / span, courbe);
    return PLN_R_MIN + (PLN_R_MAX - PLN_R_MIN) * t;
  };
}
