import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCiel } from './ciel';
import { estDecroche, reinitialiserSucces } from '../../../features/succes/succes';
import type { EvenementCiel } from '../../../features/debug/evenementsCiel';

/**
 * Les événements doivent se voir de partout.
 *
 * Posés à leur vraie place, ils étaient condamnés deux fois : le plan lointain
 * de la caméra les tranchait dès qu'on s'en éloignait, et ils rapetissaient à
 * mesure. Chacun est donc rapporté sur une sphère autour de l'œil — même
 * direction, distance fixe. C'est cette distance fixe que l'on vérifie ici,
 * d'abord sur place, puis une fois parti très loin.
 *
 * La valeur attendue est celle de `RAYON_CIEL`, qui n'est pas exportée : ce
 * n'est pas un réglage que quelqu'un d'autre a à connaître.
 */
const RAYON_CIEL = 2200;

/** Le plan lointain de la caméra de la scène : au-delà, plus rien n'existe. */
const PLAN_LOINTAIN = 20000;

const SOLEIL = new THREE.Vector3(0, 0, 0);

function ciel() {
  return createCiel(600, new THREE.Color(0x8899ff));
}

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 1.6, 1, PLAN_LOINTAIN);
  c.position.set(0, 300, 1800);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
}

/** Où la chose est réellement dessinée, qu'elle soit un objet ou un sommet. */
function placeDessinee(groupe: THREE.Object3D, nom: string): THREE.Vector3 {
  const objet = groupe.getObjectByName(nom);
  if (!objet) throw new Error(`objet introuvable : ${nom}`);
  if (objet instanceof THREE.Points) {
    const p = objet.geometry.attributes.position as THREE.BufferAttribute;
    return new THREE.Vector3().fromBufferAttribute(p, 0).add(objet.position);
  }
  return objet.position.clone();
}

/**
 * Pour chaque événement : l'objet qui le porte, et l'instant de sa course où
 * `declencher` dit de regarder.
 *
 * Ce point de visée est pris au milieu du trajet, et non au départ — c'est là
 * que la caméra doit se tourner. On avance donc l'horloge jusque-là avant de
 * comparer : partout ailleurs, la chose a bougé et la comparaison ne voudrait
 * rien dire.
 */
const EVENEMENTS: Array<{ cle: EvenementCiel; nom: string; instant: number }> = [
  { cle: 'trainee', nom: 'trainee', instant: 1.1 * 0.5 },
  { cle: 'comete', nom: 'noyauComete', instant: 80 * 0.35 },
  { cle: 'vaisseau', nom: 'vaisseau', instant: 42 * 0.4 },
  { cle: 'supernova', nom: 'nova', instant: 0.016 },
  { cle: 'trouNoir', nom: 'trouNoir', instant: 0.016 },
];

describe('les événements du ciel se voient de loin', () => {
  for (const { cle, nom, instant } of EVENEMENTS) {
    it(`${cle} : dessiné à distance fixe de l’œil, dans sa vraie direction`, () => {
      const c = ciel();
      const cam = camera();
      c.update(0.016, true, true, false, cam, SOLEIL);

      const vraie = c.declencher(cle);
      expect(vraie).not.toBeNull();
      c.update(instant, true, true, false, cam, SOLEIL);

      const dessinee = placeDessinee(c.objet, nom);
      expect(dessinee.distanceTo(cam.position)).toBeCloseTo(RAYON_CIEL, 0);

      // Et dans la direction où la chose se trouve vraiment : c'est tout ce
      // qu'on garde de sa place, et c'est ce qui fait qu'une caméra tournée
      // vers le point de visée la trouve.
      const versDessinee = dessinee.clone().sub(cam.position).normalize();
      const versVraie = vraie!.clone().sub(cam.position).normalize();
      expect(versDessinee.dot(versVraie)).toBeCloseTo(1, 5);

      c.dispose();
    });

    it(`${cle} : toujours là après être parti au bout de la galaxie`, () => {
      const c = ciel();
      const cam = camera();
      c.update(0.016, true, true, false, cam, SOLEIL);
      c.declencher(cle);
      c.update(0.016, true, true, false, cam, SOLEIL);

      // Trois fois le plan lointain : à sa vraie place, la chose serait
      // découpée par la caméra et n'existerait plus.
      cam.position.set(0, 4000, PLAN_LOINTAIN * 3);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld(true);
      c.update(0.5, true, true, false, cam, SOLEIL);

      const dessinee = placeDessinee(c.objet, nom);
      expect(dessinee.distanceTo(cam.position)).toBeCloseTo(RAYON_CIEL, 0);
      expect(dessinee.distanceTo(cam.position)).toBeLessThan(PLAN_LOINTAIN);

      c.dispose();
    });
  }

  it('la comète bleue garde le même traitement', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, true, false, cam, SOLEIL);
    c.declencher('cometeBleue');
    c.update(0.016, true, true, false, cam, SOLEIL);

    cam.position.set(0, 4000, PLAN_LOINTAIN * 3);
    cam.updateMatrixWorld(true);
    c.update(0.5, true, true, false, cam, SOLEIL);

    const tete = c.teteCometeBleue();
    expect(tete).not.toBeNull();
    expect(tete!.distanceTo(cam.position)).toBeCloseTo(RAYON_CIEL, 0);
  });

  /**
   * Le ciel n'a pas de scène.
   *
   * Les événements naissaient dans un cône autour du regard, pour qu'on ait une
   * chance de les voir. Une étoile filante qui tombe toujours devant celui qui
   * regarde n'est pas un ciel, c'est un spectacle — et depuis qu'un succès les
   * récompense, celui-ci ne vaudrait rien, puisqu'on ne pouvait pas les
   * manquer. On vérifie donc qu'ils tombent partout, le dos compris.
   */
  it('les événements tombent n’importe où, et pas devant la caméra', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, true, false, cam, SOLEIL);

    const avant = new THREE.Vector3();
    cam.getWorldDirection(avant);

    const produits = [];
    for (let i = 0; i < 60; i++) {
      const place = c.declencher('supernova');
      expect(place).not.toBeNull();
      produits.push(place!.clone().sub(cam.position).normalize().dot(avant));
    }
    c.dispose();

    // Le produit scalaire avec l'axe du regard va de -1 (dans le dos) à +1
    // (droit devant). Tiré uniformément, il se répartit à plat sur l'intervalle
    // — donc une bonne part derrière, et une moyenne proche de zéro.
    const derriere = produits.filter((d) => d < 0).length;
    expect(derriere).toBeGreaterThan(15);
    expect(produits.filter((d) => d > 0.9).length).toBeLessThan(15);
    const moyenne = produits.reduce((a, b) => a + b, 0) / produits.length;
    expect(Math.abs(moyenne)).toBeLessThan(0.3);
  });

  /**
   * Et puisqu'ils tombent n'importe où, le succès ne tombe que si l'on
   * regardait dans la bonne direction, et assez longtemps. C'est tout
   * l'intérêt de l'un et de l'autre : rater un événement doit être possible, et
   * un événement passé dans un coin de l'écran sans qu'on le remarque n'est pas
   * un événement qu'on a vu.
   */
  it('le succès demande de regarder l’événement, et pas de le croiser', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, true, false, cam, SOLEIL);

    /** Laisse filer le temps par pas d'un dixième, comme la vraie scène. */
    function laisserCourir(secondes: number) {
      for (let i = 0; i < Math.round(secondes / 0.1); i++) {
        c.update(0.1, true, true, false, cam, SOLEIL);
      }
    }

    reinitialiserSucces();
    const place = c.declencher('trouNoir');
    expect(place).not.toBeNull();

    // Le dos tourné, tout le temps qu'on veut : rien.
    const dos = place!.clone().sub(cam.position).normalize().multiplyScalar(-1);
    cam.lookAt(cam.position.clone().add(dos));
    cam.updateMatrixWorld(true);
    laisserCourir(8);
    expect(estDecroche('trouNoir')).toBe(false);

    // Les yeux dessus, mais une seconde seulement : pas encore.
    cam.lookAt(place!);
    cam.updateMatrixWorld(true);
    laisserCourir(1);
    expect(estDecroche('trouNoir')).toBe(false);

    // Le temps de le voir : décroché.
    laisserCourir(2.5);
    expect(estDecroche('trouNoir')).toBe(true);

    reinitialiserSucces();
    c.dispose();
  });

  /**
   * La tempête aussi se regarde.
   *
   * Son rideau n'est pas tout autour : c'est un arc de cent vingt degrés posé
   * dans une direction fixe du monde. Elle était pourtant décrochée tant
   * qu'elle durait, où que l'on regarde — autant dire offerte à qui se trouvait
   * là au bon moment.
   */
  it('la tempête se décroche en regardant l’aurore, et pas ailleurs', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, true, false, cam, SOLEIL);

    function laisserCourir(secondes: number) {
      for (let i = 0; i < Math.round(secondes / 0.1); i++) {
        c.update(0.1, true, true, false, cam, SOLEIL);
      }
    }

    reinitialiserSucces();
    c.declencher('tempete');

    // L'arc est centré sur cette direction du monde — le milieu de celui que
    // dessine `ciel.ts`, à quatorze degrés du +Z.
    const milieu = new THREE.Vector3(Math.sin(Math.PI * 0.08), 0, Math.cos(Math.PI * 0.08));

    // Le dos tourné à l'aurore : rien, quelle que soit la patience.
    cam.lookAt(cam.position.clone().addScaledVector(milieu, -1000));
    cam.updateMatrixWorld(true);
    laisserCourir(10);
    expect(estDecroche('tempete')).toBe(false);

    // Les yeux dessus : décrochée au bout des trois secondes.
    cam.lookAt(cam.position.clone().addScaledVector(milieu, 1000));
    cam.updateMatrixWorld(true);
    laisserCourir(1);
    expect(estDecroche('tempete')).toBe(false);
    laisserCourir(2.5);
    expect(estDecroche('tempete')).toBe(true);

    reinitialiserSucces();
    c.dispose();
  });

  /**
   * Une étoile filante ne dure qu'une seconde : lui demander d'être regardée
   * trois secondes la rendrait impossible à décrocher. Son seuil est plafonné à
   * ce que dure sa chute.
   */
  it('ce qui dure moins de trois secondes reste décrochable', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, true, false, cam, SOLEIL);

    reinitialiserSucces();
    const place = c.declencher('trainee');
    expect(place).not.toBeNull();
    cam.lookAt(place!);
    cam.updateMatrixWorld(true);

    // Toute la chute, par pas d'un dixième.
    for (let i = 0; i < 11; i++) c.update(0.1, true, true, false, cam, SOLEIL);
    expect(estDecroche('trainee')).toBe(true);

    reinitialiserSucces();
    c.dispose();
  });

  it('la supernova ne laisse rien derrière elle', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, true, false, cam, SOLEIL);
    c.declencher('supernova');

    // En plein milieu : elle est là, et bien là.
    for (let i = 0; i < 10; i++) c.update(2, true, true, false, cam, SOLEIL);
    expect(c.objet.getObjectByName('nova')?.visible).toBe(true);

    // Bien après son extinction : plus rien.
    for (let i = 0; i < 40; i++) c.update(2, true, true, false, cam, SOLEIL);
    expect(c.objet.getObjectByName('nova')?.visible).toBe(false);
    c.dispose();
  });
});
