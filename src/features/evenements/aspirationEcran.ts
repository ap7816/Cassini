/**
 * Quand le trou noir avale l'écran lui-même.
 *
 * La scène sait où il est et où il en est ; l'interface, elle, est du HTML qui
 * n'en sait rien. Ce registre est le fil entre les deux : la scène y dépose un
 * point d'écran et une force, et la coque de l'application s'y abonne pour se
 * déformer.
 *
 * Rien n'est calculé ici. C'est volontaire — le jour où l'on voudra que la
 * déformation vienne d'autre chose, il n'y aura rien à défaire.
 */

export type Aspiration = {
  /** Centre de l'aspiration, en pixels de la fenêtre. */
  x: number;
  y: number;
  /** De 0 (rien) à 1 (tout a disparu dans le point). */
  force: number;
};

const abonnes = new Set<(a: Aspiration | null) => void>();
let courante: Aspiration | null = null;

/** La scène annonce l'état ; `null` remet l'interface d'aplomb. */
export function definirAspiration(a: Aspiration | null): void {
  // Rien n'a changé : on ne réveille personne. Appelée à chaque image, cette
  // garde évite d'écrire un style soixante fois par seconde pour rien.
  if (a === null && courante === null) return;
  courante = a;
  abonnes.forEach((fn) => fn(a));
}

export function abonnerAspiration(fn: (a: Aspiration | null) => void): () => void {
  abonnes.add(fn);
  fn(courante);
  return () => {
    abonnes.delete(fn);
  };
}
