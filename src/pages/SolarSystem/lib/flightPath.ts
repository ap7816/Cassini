/**
 * Trajet de la caméra d'un système solaire à un autre.
 *
 * Pur et sans dépendance à la scène : c'est ce qui décide de l'allure du
 * voyage, et un arc qui traverse la galaxie doit être vérifié — rien
 * n'empêcherait autrement de passer au travers d'un soleil en chemin.
 */

export type Point = { x: number; y: number; z: number };

/** Un obstacle à éviter : le soleil d'un système, avec sa couronne. */
export type Obstacle = { centre: Point; rayon: number };

/**
 * Élévation de l'arc, en fractions de la distance parcourue et du rayon de la
 * galaxie. On retient la plus grande des deux : de quoi embrasser la galaxie
 * même pour un saut entre deux voisins proches, et de quoi rester proportionné
 * sur un long trajet.
 */
const RECUL_TRAJET = 0.45;
const RECUL_GALAXIE = 0.55;

/** Bornes de durée, en secondes. */
const DUREE_MIN = 1.6;
const DUREE_MAX = 3.4;

/** Distance de référence : un trajet du rayon de la galaxie dure ~1,8 s. */
const DUREE_REF = 0.55;

export type Trajet = {
  /** Point de contrôle de la courbe de Bézier quadratique. */
  controle: Point;
  /** Durée du trajet, en secondes. */
  duree: number;
};

/**
 * Compose le trajet entre deux points de vue.
 *
 * En ligne droite, on traverse un vide étoilé sans repère : rien ne dit qu'on a
 * parcouru une distance, et l'on croit avoir été téléporté. En prenant de
 * l'altitude, on découvre les autres systèmes au passage — le recul dit le
 * trajet mieux que la vitesse.
 */
export function composerTrajet(
  depart: Point,
  arrivee: Point,
  rayonGalaxie: number,
): Trajet {
  const distance = Math.hypot(
    arrivee.x - depart.x,
    arrivee.y - depart.y,
    arrivee.z - depart.z,
  );
  const recul = Math.max(distance * RECUL_TRAJET, rayonGalaxie * RECUL_GALAXIE);

  return {
    controle: {
      x: (depart.x + arrivee.x) / 2,
      // L'élévation est verticale : les systèmes reposent sur un disque, s'en
      // écarter par le haut les découvre tous d'un coup.
      y: (depart.y + arrivee.y) / 2 + recul,
      z: (depart.z + arrivee.z) / 2,
    },
    duree: Math.min(
      DUREE_MAX,
      Math.max(DUREE_MIN, distance / Math.max(1, rayonGalaxie * DUREE_REF)),
    ),
  };
}

/** Position sur le trajet, `t` allant de 0 à 1. Bézier quadratique. */
export function pointDuTrajet(
  depart: Point,
  controle: Point,
  arrivee: Point,
  t: number,
): Point {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  return {
    x: depart.x * a + controle.x * b + arrivee.x * c,
    y: depart.y * a + controle.y * b + arrivee.y * c,
    z: depart.z * a + controle.z * b + arrivee.z * c,
  };
}

/**
 * Distance minimale entre le trajet et un obstacle, en fractions de son rayon.
 *
 * Sous 1, le trajet traverse l'obstacle. Échantillonnée plutôt que résolue
 * analytiquement : la courbe est de degré deux, la distance à un point de
 * degré quatre, et cent points suffisent largement à l'échelle où l'on joue.
 */
export function degagement(
  depart: Point,
  controle: Point,
  arrivee: Point,
  obstacle: Obstacle,
  echantillons = 100,
): number {
  let mini = Infinity;
  for (let i = 0; i <= echantillons; i += 1) {
    const p = pointDuTrajet(depart, controle, arrivee, i / echantillons);
    const d = Math.hypot(
      p.x - obstacle.centre.x,
      p.y - obstacle.centre.y,
      p.z - obstacle.centre.z,
    );
    mini = Math.min(mini, d / Math.max(1e-9, obstacle.rayon));
  }
  return mini;
}
