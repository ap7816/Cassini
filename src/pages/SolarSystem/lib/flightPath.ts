import { lireReglages } from '../../../features/debug/tuning';

/**
 * Trajet de la caméra d'un système solaire à un autre.
 *
 * Pur et sans dépendance à la scène : c'est ce qui décide de l'allure du
 * voyage, et un arc qui traverse la galaxie doit être vérifié — rien
 * n'empêcherait autrement de passer au travers d'un soleil en chemin.
 *
 * **Le regard a son propre trajet, et c'est tout le sujet.** La caméra seule
 * suivait un arc qui montait haut au-dessus du disque, pendant que le point
 * visé, lui, allait tout droit d'un centre de système à l'autre sans jamais
 * s'élever. À mi-parcours, la caméra se retrouvait très au-dessus d'une cible
 * restée en bas, presque à sa verticale : elle regardait le sol. On traversait
 * la galaxie en contemplant le vide.
 *
 * Ce qu'on veut à la place est ce que fait n'importe quel plan de survol :
 * prendre de l'altitude **en regardant où l'on va**. Le regard monte donc lui
 * aussi, un peu moins haut que la caméra — ce qui laisse une inclinaison douce
 * vers le bas —, et surtout il **devance** : son point de contrôle est placé
 * aux trois quarts du chemin, de sorte qu'à mi-parcours il a déjà fait 61 % de
 * la route quand la caméra n'en est qu'à la moitié. On survole la galaxie en
 * regardant devant, et le système d'arrivée est dans le champ bien avant d'y
 * être.
 */

export type Point = { x: number; y: number; z: number };

/** Un obstacle à éviter : le soleil d'un système, avec sa couronne. */
export type Obstacle = { centre: Point; rayon: number };

/**
 * Élévation de l'arc, en fractions de la distance parcourue et du rayon de la
 * galaxie. On retient la plus grande des deux : de quoi embrasser la galaxie
 * même pour un saut entre deux voisins proches, et de quoi rester proportionné
 * sur un long trajet.
 *
 * Abaissées depuis 0,45 et 0,55 : un arc qui s'élève de près de la moitié de
 * la distance est une montagne, et on la gravissait en deux secondes.
 */
const RECUL_TRAJET = 0.3;
const RECUL_GALAXIE = 0.38;

/**
 * Part du recul de la caméra que prend le regard, et avance qu'il garde sur
 * elle.
 *
 * Le regard monte presque autant que la caméra : la différence est exactement
 * ce qui fait l'inclinaison vers le bas, et sans elle on volerait à plat sans
 * jamais voir la galaxie qu'on survole. Il devance en revanche largement, et
 * c'est ce qui empêche de regarder ses pieds au sommet de l'arc.
 *
 * Les deux valeurs sont réglées sur une mesure, et non à l'estime : avec
 * elles, l'angle de plongée ne s'écarte jamais de plus d'un degré de celui du
 * cadrage d'arrivée sur toute la traversée — autrement dit, l'inclinaison ne
 * change pour ainsi dire pas, et le voyage se regarde comme un survol. Avant,
 * elle atteignait soixante-trois degrés au milieu du trajet.
 */
const REGARD_HAUTEUR = 0.88;
const REGARD_AVANCE = 0.8;

// Bornes de durée, en secondes : `volDureeMin` et `volDureeMax` dans les réglages.

/** Distance de référence : un trajet du rayon de la galaxie dure ~1,8 s. */
const DUREE_REF = 0.55;

export type Trajet = {
  /** Point de contrôle de la courbe que suit la caméra. */
  controle: Point;
  /** Point de contrôle de la courbe que suit le regard. */
  controleRegard: Point;
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
 *
 * `regardDepart` et `regardArrivee` sont les deux points que la caméra vise au
 * départ et à l'arrivée : les centres des deux systèmes.
 */
export function composerTrajet(
  depart: Point,
  arrivee: Point,
  rayonGalaxie: number,
  regardDepart: Point,
  regardArrivee: Point,
): Trajet {
  const distance = Math.hypot(arrivee.x - depart.x, arrivee.y - depart.y, arrivee.z - depart.z);
  const recul = Math.max(distance * RECUL_TRAJET, rayonGalaxie * RECUL_GALAXIE);

  return {
    controle: {
      x: (depart.x + arrivee.x) / 2,
      // L'élévation est verticale : les systèmes reposent sur un disque, s'en
      // écarter par le haut les découvre tous d'un coup.
      y: (depart.y + arrivee.y) / 2 + recul,
      z: (depart.z + arrivee.z) / 2,
    },
    controleRegard: {
      x: regardDepart.x + (regardArrivee.x - regardDepart.x) * REGARD_AVANCE,
      y:
        regardDepart.y +
        (regardArrivee.y - regardDepart.y) * REGARD_AVANCE +
        recul * REGARD_HAUTEUR,
      z: regardDepart.z + (regardArrivee.z - regardDepart.z) * REGARD_AVANCE,
    },
    duree: Math.min(
      lireReglages().volDureeMax,
      Math.max(lireReglages().volDureeMin, distance / Math.max(1, rayonGalaxie * DUREE_REF)),
    ),
  };
}

/** Position sur le trajet, `t` allant de 0 à 1. Bézier quadratique. */
export function pointDuTrajet(depart: Point, controle: Point, arrivee: Point, t: number): Point {
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
 * De combien le regard plonge sous l'horizon, en degrés, à cet instant du
 * trajet.
 *
 * Zéro veut dire qu'on regarde droit devant, quatre-vingt-dix qu'on regarde
 * ses pieds — ce que faisait la version précédente au sommet de l'arc. Mesuré
 * ici plutôt que deviné : c'est le seul chiffre qui dise si un survol est
 * regardable.
 */
export function plongee(
  depart: Point,
  controle: Point,
  arrivee: Point,
  regardDepart: Point,
  controleRegard: Point,
  regardArrivee: Point,
  t: number,
): number {
  const oeil = pointDuTrajet(depart, controle, arrivee, t);
  const vise = pointDuTrajet(regardDepart, controleRegard, regardArrivee, t);
  const dx = vise.x - oeil.x;
  const dy = vise.y - oeil.y;
  const dz = vise.z - oeil.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-9) return dy < 0 ? 90 : -90;
  return (-Math.atan2(dy, horizontal) * 180) / Math.PI;
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
    const d = Math.hypot(p.x - obstacle.centre.x, p.y - obstacle.centre.y, p.z - obstacle.centre.z);
    mini = Math.min(mini, d / Math.max(1e-9, obstacle.rayon));
  }
  return mini;
}
