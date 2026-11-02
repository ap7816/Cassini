import { describe, expect, it } from 'vitest';
import type { Game } from '../../../features/types';
import { PLN_R_MAX, PLN_R_MIN } from '../constants';
import * as THREE from 'three';
import { makeRadiusScale, normaleOrbite, orbitPos, positionSurOrbite } from './orbits';

const jeu = (id: string, champs: Partial<Game>): Game => ({
  id,
  title: id,
  platform: 'Steam',
  ...champs,
});

describe('makeRadiusScale', () => {
  const jeux = [
    jeu('lourd', { sizeOnDisk: 100e9, playtimeMinutes: 30 }),
    jeu('leger', { sizeOnDisk: 1e9, playtimeMinutes: 6000 }),
  ];

  it('suit l’espace disque par défaut', () => {
    const r = makeRadiusScale(jeux, 'disque');
    expect(r(jeux[0])).toBeCloseTo(PLN_R_MAX);
    expect(r(jeux[1])).toBeCloseTo(PLN_R_MIN);
  });

  it('suit le temps de jeu quand on le demande', () => {
    const r = makeRadiusScale(jeux, 'tempsDeJeu');
    expect(r(jeux[1])).toBeCloseTo(PLN_R_MAX);
    expect(r(jeux[0])).toBeCloseTo(PLN_R_MIN);
  });

  it('garde l’espace disque pour un système sans temps de jeu', () => {
    const epic = [
      jeu('a', { platform: 'Epic', sizeOnDisk: 50e9 }),
      jeu('b', { platform: 'Epic', sizeOnDisk: 5e9 }),
    ];
    const r = makeRadiusScale(epic, 'tempsDeJeu');
    expect(r(epic[0])).toBeGreaterThan(r(epic[1]));
  });

  it('met un jeu jamais lancé parmi les petits', () => {
    const avecInconnu = [...jeux, jeu('neuf', { sizeOnDisk: 200e9 })];
    const r = makeRadiusScale(avecInconnu, 'tempsDeJeu');
    expect(r(avecInconnu[2])).toBeLessThan(r(avecInconnu[1]));
  });
});

describe('positionSurOrbite', () => {
  it('retrouve la distance et l’angle d’un point posé par orbitPos', () => {
    for (const [r, a, inc, node] of [
      [40, 0.3, 0, 0],
      [55, 2.4, 0.12, 1.1],
      [12, 5.9, -0.14, 4.2],
    ]) {
      const p = orbitPos(r, a, inc, node, new THREE.Vector3());
      const { distance, angle } = positionSurOrbite(p, inc, node);
      expect(distance).toBeCloseTo(r, 6);
      expect(angle).toBeCloseTo(a, 6);
    }
  });

  it('place la normale perpendiculaire au plan de l’orbite', () => {
    const inc = 0.13;
    const node = 2.2;
    const n = normaleOrbite(inc, node, new THREE.Vector3());
    const p = orbitPos(30, 1.7, inc, node, new THREE.Vector3());
    expect(n.dot(p)).toBeCloseTo(0, 6);
    expect(n.length()).toBeCloseTo(1, 6);
  });
});
