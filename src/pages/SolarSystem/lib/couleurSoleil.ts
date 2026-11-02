import * as THREE from 'three';

/**
 * Couronne d'origine, de l'intérieur vers l'extérieur : du jaune-orangé au
 * rouge. Taillée pour le soleil par défaut, elle jurait autour d'une étoile
 * d'une autre couleur — un cœur vert cerné d'anneaux orange et rouges.
 */
export const COURONNE_DEFAUT: readonly number[] = [0xffaa22, 0xff8800, 0xff5500, 0xff3300];

/** Lumière d'un soleil sans couleur propre : un blanc chaud. */
export const LUMIERE_DEFAUT = 0xfff2d8;

/**
 * Part de la couleur de l'étoile dans la lumière qu'elle projette.
 *
 * Pas toute la couleur : les planètes portent les jaquettes des jeux, qu'une
 * lumière franchement verte ou violette rendrait méconnaissables. Assez pour
 * que le système baigne dans la teinte de son étoile.
 */
const PART_LUMIERE = 0.55;

/**
 * Couleurs des couches de la couronne pour une étoile de couleur donnée.
 *
 * Même logique que la couronne d'origine : chaque couche plus saturée et plus
 * sombre que la précédente, pour que le halo se fonde dans le noir au lieu
 * d'y dessiner des cercles. La teinte, elle, reste celle de l'étoile.
 */
export function couronneDe(couleurPropre: string | null | undefined): number[] {
  if (!couleurPropre) return [...COURONNE_DEFAUT];
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(couleurPropre).getHSL(hsl);
  // Une étoile grise ou blanche n'a pas de teinte à étendre : son halo reste
  // neutre plutôt que de virer au rouge (teinte 0).
  const neutre = hsl.s < 0.08;
  const saturation = neutre ? hsl.s : Math.min(1, Math.max(hsl.s, 0.55) + 0.15);
  return [0.62, 0.52, 0.42, 0.34].map((l, i) =>
    new THREE.Color()
      .setHSL(
        hsl.h,
        neutre ? saturation : Math.min(1, saturation + i * 0.05),
        Math.min(l, 0.2 + hsl.l * l),
      )
      .getHex(),
  );
}

/** Couleur de la lumière qui éclaire les planètes du système. */
export function lumiereDe(couleurPropre: string | null | undefined): THREE.Color {
  const blanc = new THREE.Color(LUMIERE_DEFAUT);
  return couleurPropre ? blanc.lerp(new THREE.Color(couleurPropre), PART_LUMIERE) : blanc;
}
