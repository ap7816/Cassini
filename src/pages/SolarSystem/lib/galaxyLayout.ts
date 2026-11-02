/**
 * Disposition des systèmes solaires dans la galaxie.
 *
 * Pure et sans dépendance à Three.js : c'est la partie qui décide de l'allure
 * d'ensemble, et elle se vérifie ainsi sans faire tourner de rendu.
 *
 * Les systèmes gardent leur taille réelle — celle qui découle du nombre de
 * jeux — et ce sont les écarts qui s'adaptent. Un système d'un seul jeu voisine
 * donc un système de cent sans que l'un écrase l'autre : ils sont simplement
 * loin l'un de l'autre.
 */

/** Écart minimal entre deux systèmes, en multiples de la somme de leurs rayons. */
const MARGE = 2.6;

/** Épaisseur du disque, en fraction de la distance au centre. */
const EPAISSEUR = 0.14;

/** Angle d'or — répartit les positions sans jamais reformer de rangée. */
const ANGLE_OR = Math.PI * (3 - Math.sqrt(5));

/** Pas de la spirale de recherche, en fraction du rayon du système placé. */
const PAS = 0.45;

export type Astre = {
  platform: string;
  /** Rayon encombré par le système, couronne solaire comprise. */
  rayon: number;
};

export type Position = { x: number; y: number; z: number };

/**
 * Place chaque système sur un disque, du plus grand au plus petit.
 *
 * Recherche gloutonne le long d'une spirale : on avance jusqu'à trouver un
 * emplacement qui dégage tous les systèmes déjà posés. Une formule fermée
 * serait plus élégante mais ne garantirait rien — les rayons varient d'un
 * facteur cent entre une bibliothèque d'un jeu et une de cent cinquante, et
 * c'est précisément le chevauchement qu'il faut exclure.
 *
 * Le plus grand est posé au centre : c'est autour de lui qu'il reste le plus
 * de place, et c'est aussi le système où l'on passe le plus de temps.
 */
export function placerSystemes(
  astres: Astre[],
  alea: () => number = Math.random,
): Map<string, Position> {
  const positions = new Map<string, Position>();
  if (astres.length === 0) return positions;

  // Du plus grand au plus petit, le nom départageant les ex æquo.
  //
  // Ce départage n'est pas cosmétique : sans lui, l'ordre de la liste d'entrée
  // décidait de la place des systèmes de même taille. Or cette liste est
  // ordonnée par nombre de jeux, et l'ordre des ex æquo y dépend de celui de la
  // bibliothèque — la galaxie se serait reconfigurée à chaque rescan, et on
  // aurait perdu à chaque fois le repère de l'endroit où se trouve un launcher.
  const ordonnes = [...astres].sort(
    (a, b) => b.rayon - a.rayon || a.platform.localeCompare(b.platform),
  );
  const poses: Array<{ p: Position; rayon: number }> = [];

  ordonnes.forEach((astre, index) => {
    if (index === 0) {
      const p = { x: 0, y: 0, z: 0 };
      positions.set(astre.platform, p);
      poses.push({ p, rayon: astre.rayon });
      return;
    }

    // Départ au bord du système déjà le plus éloigné : inutile de sonder
    // l'intérieur du disque, il est occupé.
    const occupe = poses.reduce((m, q) => Math.max(m, Math.hypot(q.p.x, q.p.z) + q.rayon), 0);

    let k = 0;
    for (;;) {
      const angle = index * ANGLE_OR + k * ANGLE_OR;
      const rayon = occupe + astre.rayon * (1 + k * PAS);
      const p: Position = {
        x: Math.cos(angle) * rayon,
        // Léger relief : un disque parfaitement plat se lit comme une ligne dès
        // qu'on le regarde par la tranche.
        y: (alea() - 0.5) * 2 * rayon * EPAISSEUR,
        z: Math.sin(angle) * rayon,
      };

      const degage = poses.every((q) => distance(p, q.p) >= (astre.rayon + q.rayon) * MARGE);
      if (degage) {
        positions.set(astre.platform, p);
        poses.push({ p, rayon: astre.rayon });
        return;
      }

      k += 1;
      // Garde-fou : la spirale s'éloigne indéfiniment, la condition finit
      // toujours par être vraie. Mais mieux vaut une position imparfaite qu'une
      // boucle infinie si une invariante changeait.
      if (k > 400) {
        positions.set(astre.platform, p);
        poses.push({ p, rayon: astre.rayon });
        return;
      }
    }
  });

  return positions;
}

function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Rayon englobant toute la galaxie, systèmes compris. */
export function rayonGalaxie(astres: Astre[], positions: Map<string, Position>): number {
  let max = 0;
  for (const a of astres) {
    const p = positions.get(a.platform);
    if (!p) continue;
    max = Math.max(max, Math.hypot(p.x, p.y, p.z) + a.rayon);
  }
  return max;
}
