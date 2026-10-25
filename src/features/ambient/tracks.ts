// Liste des pistes d'ambiance, partagée entre le préchargeur et le lecteur.
//
// Le préchargeur démarre la musique pendant l'écran de démarrage, bien avant
// React ; le lecteur adopte ensuite le même élément audio. Les deux doivent
// donc s'accorder sur la liste et savoir retrouver la piste en cours, sans
// quoi la première transition sauterait à un morceau arbitraire.
//
// Crédits — licence Pixabay (aucune attribution requise) :
//   ambiant1 : "Space Galaxy Universe Music" — viacheslavstarostin (ID 473849)
//   ambiant2 : à compléter
//   ambiant3 : à compléter
//   ambiant4 : à compléter — origine et licence à confirmer avant publication

/**
 * Servies depuis `public/`, donc résolues à la racine de l'application.
 *
 * L'ordre est celui de l'enchaînement : la première est tirée au sort, les
 * suivantes viennent dans la foulée, en boucle. La quatrième dure quatorze
 * minutes à elle seule, contre deux pour les autres — elle tiendra donc
 * l'essentiel d'une longue session, ce qui est plutôt ce qu'on demande à une
 * ambiance.
 */
export const AMBIENT_TRACKS = [
  './ambiant1.mp3',
  './ambiant2.mp3',
  './ambiant3.mp3',
  './ambiant4.mp3',
] as const;

/** Piste de départ, tirée au sort à chaque lancement. */
export function randomAmbientIndex(): number {
  return Math.floor(Math.random() * AMBIENT_TRACKS.length);
}

/**
 * Retrouve l'index d'une piste depuis l'URL portée par l'élément audio.
 *
 * Comparaison sur la fin du chemin : le navigateur remplace le `./` relatif
 * par une URL absolue (`http://tauri.localhost/ambiant1.mp3`), une égalité
 * stricte échouerait donc toujours.
 *
 * Renvoie -1 si l'URL ne correspond à aucune piste connue.
 */
export function ambientIndexOf(src: string): number {
  if (!src) return -1;
  return AMBIENT_TRACKS.findIndex((t) => src.endsWith(t.slice(1)));
}
