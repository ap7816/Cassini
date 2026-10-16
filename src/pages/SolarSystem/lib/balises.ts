/**
 * Où dessiner la balise d'un soleil lointain.
 *
 * Le plan lointain de la caméra est à vingt mille unités : au-delà, plus rien
 * n'existe. Une galaxie un peu grande a ses systèmes les plus éloignés
 * là-dessous dès qu'on prend du recul — et ils s'éteignaient alors un à un,
 * justement au moment où l'on reculait pour les embrasser tous.
 *
 * La balise est donc **rapportée sur une sphère autour de l'œil** quand elle
 * est trop loin : même direction, donc même place dans le ciel, mais à une
 * distance que la caméra sait voir. C'est ce que fait déjà `ciel.ts` pour ses
 * événements, et pour la même raison.
 *
 * En deçà, elle reste exactement sur son soleil : c'est lui qu'on vise pour
 * s'y rendre, et un repère décalé mentirait.
 */

export type Point = { x: number; y: number; z: number };

/**
 * Rayon de la sphère sur laquelle on rapporte ce qui est trop loin.
 *
 * Confortablement en deçà du plan lointain : ce qui est posé là ne doit pas se
 * faire trancher au premier mouvement de caméra.
 */
export const RAYON_BALISE = 12000;

/** La place à donner à la balise d'un soleil, vu d'ici. */
export function placerBalise(centre: Point, oeil: Point, rayon = RAYON_BALISE): Point {
  const dx = centre.x - oeil.x;
  const dy = centre.y - oeil.y;
  const dz = centre.z - oeil.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= rayon || d === 0) return centre;
  const k = rayon / d;
  return {
    x: oeil.x + dx * k,
    y: oeil.y + dy * k,
    z: oeil.z + dz * k,
  };
}

/**
 * Diamètre en pixels d'une balise, selon la distance **vraie** de son soleil.
 *
 * Une taille fixe sauvait la balise de la disparition, mais en faisait une
 * grosse boule de vingt-six pixels suspendue dans le vide dès qu'on prenait du
 * recul : sept ballons lumineux au milieu d'un champ d'étoiles fines. Une
 * atténuation ordinaire ferait l'inverse et les effacerait.
 *
 * D'où une décroissance en `1/d`, celle de la perspective, mais bornée aux
 * deux bouts : jamais plus grosse que ce que vaut la balise de près, jamais
 * plus fine qu'une étoile du fond. Entre les deux, elle rapetisse comme tout
 * le reste, et c'est ce qui la fait passer pour une étoile.
 *
 * La distance de référence est celle du soleil, et non celle du point dessiné
 * — qui, au-delà de `RAYON_BALISE`, est rapporté près de l'œil et ne dirait
 * plus rien de l'éloignement réel.
 */

/** Plus petite qu'une étoile du fond, elle ne se verrait plus. */
export const BALISE_MIN_PX = 3.2;

/**
 * Distance à laquelle la balise vaudrait un pixel, si rien ne la retenait.
 *
 * Réglée sur ce qu'on veut voir, et non sur une formule : à deux mille unités
 * elle fait dix-sept pixels — on est encore dans le système, le soleil la
 * couvre —, à quatre mille huit, et au-delà de onze mille elle touche son
 * plancher. Autrement dit, dès que le système cesse de se lire comme un
 * système, sa balise est une étoile.
 */
export const BALISE_REFERENCE = 35000;

/** Le diamètre à donner, en pixels d'interface. */
export function tailleBalise(distance: number, maxPx: number): number {
  if (distance <= 0) return maxPx;
  return Math.min(maxPx, Math.max(BALISE_MIN_PX, BALISE_REFERENCE / distance));
}
