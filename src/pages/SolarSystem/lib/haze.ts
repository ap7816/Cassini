/**
 * Densité de la brume qui noie les planètes lointaines.
 *
 * Pure et sans dépendance à Three.js : ce qu'elle décide se vérifie par le
 * calcul, et le réglage a peu de marge — trop faible, on voit les planètes
 * apparaître d'un coup ; trop forte, elle mange le système qu'on regarde.
 */

/**
 * Distances de référence, en multiples du rayon du système regardé.
 *
 * `PROCHE` est la distance de la caméra au repos : à cette distance, le système
 * doit rester net.
 *
 * `LOIN` est le seuil auquel la galaxie **construit** ses planètes, et non
 * celui auquel elle les libère. C'est le plus exigeant des deux : une planète
 * qui apparaît se remarque bien davantage qu'une qui s'efface, et régler la
 * brume sur la libération laissait la construction visible à un cinquième.
 * Satisfaire le seuil de construction satisfait l'autre par construction,
 * puisqu'il est plus lointain.
 */
const PROCHE = 0.9;
const LOIN = 4.5;

/** Ce qu'il doit rester de visible à ces deux distances. */
const NETTETE_PROCHE = 0.9;
const NETTETE_LOIN = 0.08;

/**
 * Densité de brume exponentielle pour un système de rayon donné.
 *
 * `FogExp2` atténue selon `exp(−(densité · distance)²)`. On retient la plus
 * faible des deux densités : celle qui noie la construction, et celle qui
 * préserve la netteté au repos. Le compromis penche du côté de la seconde —
 * une planète un peu voilée se pardonne, une planète qui surgit non.
 */
export function densiteBrume(rayonSysteme: number): number {
  if (!(rayonSysteme > 0)) return 0;

  const pourLoin = Math.sqrt(-Math.log(NETTETE_LOIN)) / (LOIN * rayonSysteme);
  const pourProche = Math.sqrt(-Math.log(NETTETE_PROCHE)) / (PROCHE * rayonSysteme);

  return Math.min(pourLoin, pourProche);
}

/** Part de lumière qui traverse la brume à cette distance. */
export function nettete(densite: number, distance: number): number {
  const t = densite * distance;
  return Math.exp(-(t * t));
}
