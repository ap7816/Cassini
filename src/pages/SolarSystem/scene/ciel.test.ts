import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCiel } from './ciel';
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
      c.update(0.016, true, false, cam, SOLEIL);

      const vraie = c.declencher(cle);
      expect(vraie).not.toBeNull();
      c.update(instant, true, false, cam, SOLEIL);

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
      c.update(0.016, true, false, cam, SOLEIL);
      c.declencher(cle);
      c.update(0.016, true, false, cam, SOLEIL);

      // Trois fois le plan lointain : à sa vraie place, la chose serait
      // découpée par la caméra et n'existerait plus.
      cam.position.set(0, 4000, PLAN_LOINTAIN * 3);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld(true);
      c.update(0.5, true, false, cam, SOLEIL);

      const dessinee = placeDessinee(c.objet, nom);
      expect(dessinee.distanceTo(cam.position)).toBeCloseTo(RAYON_CIEL, 0);
      expect(dessinee.distanceTo(cam.position)).toBeLessThan(PLAN_LOINTAIN);

      c.dispose();
    });
  }

  it('la comète bleue garde le même traitement', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, false, cam, SOLEIL);
    c.declencher('cometeBleue');
    c.update(0.016, true, false, cam, SOLEIL);

    cam.position.set(0, 4000, PLAN_LOINTAIN * 3);
    cam.updateMatrixWorld(true);
    c.update(0.5, true, false, cam, SOLEIL);

    const tete = c.teteCometeBleue();
    expect(tete).not.toBeNull();
    expect(tete!.distanceTo(cam.position)).toBeCloseTo(RAYON_CIEL, 0);
  });

  it('le rémanent de la supernova suit l’œil jusqu’à la fin de la session', () => {
    const c = ciel();
    const cam = camera();
    c.update(0.016, true, false, cam, SOLEIL);
    c.declencher('supernova');

    // Bien après son extinction : il ne reste que la lueur, qui doit rester
    // visible de partout elle aussi.
    for (let i = 0; i < 40; i++) c.update(2, true, false, cam, SOLEIL);

    cam.position.set(PLAN_LOINTAIN * 2, 0, 0);
    cam.updateMatrixWorld(true);
    c.update(0.5, true, false, cam, SOLEIL);

    expect(placeDessinee(c.objet, 'nova').distanceTo(cam.position)).toBeCloseTo(RAYON_CIEL, 0);
    c.dispose();
  });
});
