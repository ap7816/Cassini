import * as THREE from 'three';

/**
 * Le trou noir : l'événement qui défait la galaxie, puis la rend.
 *
 * Il ne se dessine pas. Un disque noir avec un anneau peint autour serait une
 * illustration ; ici, c'est le ciel lui-même qui est courbé. La lumière des
 * étoiles situées derrière l'objet ne va plus droit : elle contourne la masse
 * et nous parvient quand même, d'un côté ou de l'autre. Chaque étoile cachée
 * réapparaît donc **étalée en anneau** autour de l'ombre — c'est l'anneau
 * d'Einstein, et c'est la seule chose qu'on verrait vraiment d'un trou noir,
 * puisqu'il n'émet rien.
 *
 * Le calcul tient en deux lignes dans le shader du fond : on mesure l'angle
 * entre le regard et l'objet, et on en retranche une déviation inversement
 * proportionnelle à cet angle. Au-dessous d'un certain angle, plus rien ne
 * ressort : c'est l'ombre.
 *
 * Le reste est une chorégraphie. Les systèmes sont happés **un par un**, du
 * plus proche au plus lointain, chacun en spirale et en rapetissant. Puis
 * l'objet s'évapore et tout revient — ce qui n'a aucun sens physique, et c'est
 * assumé : on ne va pas détruire la bibliothèque de quelqu'un pour la beauté du
 * geste.
 */

/** Les quatre temps de l'événement, et leur durée en secondes. */
const APPARITION = 7;
/** Durée totale de l'aspiration, quel que soit le nombre d'objets. */
const ASPIRATION = 20;
/** Temps que met un objet, une fois son tour venu, à disparaître. */
const CHUTE = 3;
const EVAPORATION = 5;
const RETOUR = 4;

export type EtatTrouNoir = {
  /** L'événement est-il en cours ? */
  actif: boolean;
  /** Position dans le monde. */
  position: THREE.Vector3;
  /** Rayon angulaire de l'ombre, en radians. */
  ombre: number;
  /** Force de la déviation : monte à l'apparition, retombe à l'évaporation. */
  force: number;
};

export type TrouNoir = {
  /** Déclenche l'événement devant la caméra. Sans effet s'il est déjà en cours. */
  declencher: (camera: THREE.Camera) => THREE.Vector3 | null;
  update: (dt: number) => void;
  etat: () => EtatTrouNoir;
  /**
   * Part du trajet parcourue par l'objet de ce rang : 0 tant qu'il n'est pas
   * touché, 1 quand il a disparu.
   *
   * Le rang vient de sa distance à l'objet — le plus proche tombe le premier.
   * Chaque chose part pour son compte : un système entier qui s'évanouirait
   * d'un bloc ne ressemblerait à rien, puisque sa planète extérieure est cent
   * fois plus loin que son étoile.
   */
  partDe: (rang: number, total: number) => number;
  /** Tirage périodique. Rend vrai si l'événement vient d'être déclenché. */
  peutSurvenir: (dt: number) => boolean;
};

export function createTrouNoir(distance: number): TrouNoir {
  const position = new THREE.Vector3();
  let temps = 0;
  let actif = false;

  // Beaucoup plus rare que la supernova : pas avant vingt minutes, puis un
  // tirage par minute avec une chance sur neuf cents — de l'ordre d'une fois
  // toutes les quinze heures passées devant la galaxie. Et une seule par
  // session : la deuxième ne surprendrait plus personne.
  let avantTirage = 1200;
  let deja = false;

  const DUREE = APPARITION + ASPIRATION + CHUTE + EVAPORATION + RETOUR;

  function declencher(camera: THREE.Camera): THREE.Vector3 | null {
    if (actif) return null;

    // Devant l'œil, et à bonne distance : assez loin pour qu'on le voie en
    // entier, assez près pour qu'il domine le ciel.
    const avant = new THREE.Vector3();
    camera.getWorldDirection(avant);
    position.copy(camera.position).addScaledVector(avant, distance * 0.55);

    temps = 0;
    actif = true;
    deja = true;
    return position.clone();
  }

  function update(dt: number): void {
    if (!actif) return;
    temps += dt;
    if (temps >= DUREE) actif = false;
  }

  function partDe(rang: number, total: number): number {
    if (!actif || total <= 0) return 0;

    const finAspiration = APPARITION + ASPIRATION + CHUTE;

    // Le retour : tout remonte ensemble, à l'envers.
    if (temps > finAspiration + EVAPORATION) {
      const retour = (temps - finAspiration - EVAPORATION) / RETOUR;
      return Math.max(0, 1 - retour);
    }

    const debut = APPARITION + (rang / total) * ASPIRATION;
    return THREE.MathUtils.clamp((temps - debut) / CHUTE, 0, 1);
  }

  function etat(): EtatTrouNoir {
    if (!actif) return { actif: false, position, ombre: 0, force: 0 };

    const finAspiration = APPARITION + ASPIRATION + CHUTE;
    let force: number;
    if (temps < APPARITION) {
      // Il se forme : la courbure s'installe progressivement.
      force = (temps / APPARITION) ** 1.6;
    } else if (temps < finAspiration + EVAPORATION) {
      force = 1;
    } else {
      // Il s'évapore, et la lumière reprend son chemin droit.
      force = Math.max(0, 1 - (temps - finAspiration - EVAPORATION) / (EVAPORATION * 0.8));
    }

    return { actif: true, position, ombre: 0.085 * force, force };
  }

  function peutSurvenir(dt: number): boolean {
    if (actif || deja) return false;
    avantTirage -= dt;
    if (avantTirage > 0) return false;
    avantTirage = 60;
    return Math.random() < 1 / 900;
  }

  return { declencher, update, etat, partDe, peutSurvenir };
}
