import * as THREE from 'three';

/**
 * Le trou noir : il se forme, il tord le ciel, puis il emporte l'image.
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
 * Il happait auparavant les systèmes un par un, du plus proche au plus
 * lointain, chacun en spirale et en rapetissant — une trentaine de secondes de
 * cérémonie pendant lesquelles la galaxie se défaisait pièce par pièce. C'est
 * retiré : l'effet tenait la scène en otage, remuait tout ce qu'elle porte, et
 * la seule chose qu'on voulait voir était ailleurs. Reste ce qui se regarde :
 * la courbure, et l'image qui part dedans d'un seul mouvement (voir
 * `features/evenements`) — d'abord si lentement qu'on la croit immobile, puis
 * tout d'un coup. Et tout revient, ce qui n'a aucun sens physique, et c'est
 * assumé.
 */

/** Les temps de l'événement, et leur durée en secondes. */
/** Il se forme : la courbure du ciel s'installe et l'anneau se referme. */
const APPARITION = 8;
/**
 * Et l'image se creuse, du premier instant au dernier.
 *
 * Elle attendait auparavant que l'objet soit formé, puis posé : il y avait un
 * avant et un après, et l'aspiration arrivait comme un deuxième événement.
 * C'est le même : elle commence avec lui, imperceptible, et s'emballe. La
 * puissance de l'avancement s'en charge : au tiers du temps, un cinquième du
 * chemin seulement. Le reste vient après, et de plus en plus vite — mais sans
 * l'à-coup qu'un exposant plus franc donnait à la fin, où le noir s'ouvrait
 * d'un seul tenant au lieu de grandir.
 */
const ASPIRATION = 14;
/**
 * Et plus rien, le temps d'un battement.
 *
 * Sans ce temps mort, l'écran n'était noir qu'à un instant — il touchait le
 * fond et repartait dans la même image. On ne voyait pas la disparition, on
 * voyait un clignement.
 */
const NOIR = 0.7;
/** Puis tout revient d'un coup : c'est la détente qui fait la blague. */
const DETENTE = 1.6;

export type EtatTrouNoir = {
  /** L'événement est-il en cours ? */
  actif: boolean;
  /** Position dans le monde. */
  position: THREE.Vector3;
  /** Rayon angulaire de l'ombre, en radians. */
  ombre: number;
  /** Force de la déviation : monte à l'apparition, retombe à la détente. */
  force: number;
  /**
   * Et pour finir, l'écran lui-même.
   *
   * De 0 à 1 une fois l'objet installé : il ne prend rien à la galaxie, il
   * prend l'image qu'on en a — interface comprise — avant de tout rendre. Ce
   * n'est évidemment pas sérieux.
   */
  ecran: number;
};

export type TrouNoir = {
  /** Déclenche l'événement devant la caméra. Sans effet s'il est déjà en cours. */
  declencher: (camera: THREE.Camera) => THREE.Vector3 | null;
  update: (dt: number) => void;
  etat: () => EtatTrouNoir;
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

  const FIN_NOIR = ASPIRATION + NOIR;
  const DUREE = FIN_NOIR + DETENTE;

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

  function etat(): EtatTrouNoir {
    if (!actif) return { actif: false, position, ombre: 0, force: 0, ecran: 0 };

    let force: number;
    if (temps < APPARITION) {
      // Il se forme : la courbure s'installe progressivement.
      force = (temps / APPARITION) ** 1.6;
    } else if (temps < FIN_NOIR) {
      force = 1;
    } else {
      // Il s'évapore, et la lumière reprend son chemin droit.
      force = Math.max(0, 1 - (temps - FIN_NOIR) / DETENTE);
    }

    // L'aspiration de l'image : elle s'enfonce de plus en plus vite, le noir
    // se tient, puis tout revient d'un coup.
    let ecran: number;
    if (temps < ASPIRATION) ecran = (temps / ASPIRATION) ** 1.6;
    else if (temps < FIN_NOIR) ecran = 1;
    else ecran = Math.max(0, 1 - (temps - FIN_NOIR) / DETENTE) ** 0.6;

    return { actif: true, position, ombre: 0.085 * force, force, ecran };
  }

  function peutSurvenir(dt: number): boolean {
    if (actif || deja) return false;
    avantTirage -= dt;
    if (avantTirage > 0) return false;
    avantTirage = 60;
    return Math.random() < 1 / 900;
  }

  return { declencher, update, etat, peutSurvenir };
}
