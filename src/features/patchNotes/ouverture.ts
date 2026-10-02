/**
 * Les notes doivent-elles s'ouvrir d'elles-mêmes au démarrage ?
 *
 * Deux informations, et il a fallu se tromper une fois pour comprendre qu'elles
 * étaient distinctes :
 *
 *  - **la version déjà vue** dit « ces notes-là, je les ai lues » ;
 *  - **la préférence** dit « ne me les ouvre plus, jamais ».
 *
 * La première seule ne suffit pas : on la remet à jour à chaque version, donc
 * un « ne plus afficher » ne tenait que jusqu'à la mise à jour suivante. Pour
 * qui change de version souvent, les notes revenaient à chaque démarrage, et
 * le bouton paraissait sans effet.
 *
 * Hors de React, et sans rien lire : c'est une décision, elle se vérifie.
 */
export function doitOuvrirAuDemarrage(
  versionVue: string | null,
  versionCourante: string,
  auto: boolean,
): boolean {
  if (!auto) return false;
  return versionVue !== versionCourante;
}
