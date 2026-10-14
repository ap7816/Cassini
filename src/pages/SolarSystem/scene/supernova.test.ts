import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSupernova } from './supernova';

/**
 * Une explosion ne s'arrête pas avant de disparaître.
 *
 * La loi de Sedov seule sature : entre les deux tiers et la fin, le rayon ne
 * gagnait plus que quinze pour cent, ce qui ne se voit pas. Le dernier tiers
 * de l'événement était un grand cercle rouge arrêté qui attendait de
 * s'éteindre — et c'est exactement ce qu'on reproche à une explosion.
 *
 * On vérifie donc que la coquille grandit encore, et nettement, jusqu'au
 * dernier instant.
 */
const RAYON = 100;

/** Le rayon dessiné de l'onde de choc à cet âge, en unités du monde. */
function rayonDuChoc(age: number): number {
  const sn = createSupernova(RAYON);
  const camera = new THREE.PerspectiveCamera(60, 1.6, 1, 20000);
  camera.position.set(0, 0, 500);
  camera.updateMatrixWorld(true);
  sn.regler(1, age, 0, camera);
  const choc = sn.objet.children[0];
  const r = choc.scale.x * RAYON;
  sn.dispose();
  return r;
}

describe('la supernova s’étend jusqu’au bout', () => {
  it('part d’un point', () => {
    expect(rayonDuChoc(0)).toBeLessThan(RAYON * 0.05);
  });

  it('est déjà bien ouverte le temps de tourner la tête', () => {
    // Un vingtième de sa durée, soit trois secondes : le quart de sa taille au
    // moins, sinon ce n'est pas une explosion mais une lampe.
    expect(rayonDuChoc(0.05)).toBeGreaterThan(RAYON * 0.25);
  });

  it('grandit encore nettement dans son dernier tiers', () => {
    const avant = rayonDuChoc(0.66);
    const apres = rayonDuChoc(1);
    expect(apres / avant).toBeGreaterThan(1.3);
  });

  it('ne recule jamais', () => {
    let precedent = -1;
    for (let a = 0; a <= 1.0001; a += 0.05) {
      const r = rayonDuChoc(a);
      expect(r).toBeGreaterThan(precedent);
      precedent = r;
    }
  });
});
