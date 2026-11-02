import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../features/types';
import { REGLAGE_DEFAUT } from '../lib/customSystems';
import { appliquerPlacements } from './placements';
import type { PlanetEntry } from './types';

function planete(id: string, changerAnneau?: PlanetEntry['changerAnneau']): PlanetEntry {
  return {
    game: { id, title: id } as Game,
    mesh: new THREE.Mesh(),
    orbitRadius: 40,
    angle: 0,
    speed: 0,
    paused: false,
    radius: 1,
    rayonVisuel: 1.2,
    inc: 0.1,
    node: 0,
    tint: new THREE.Color(),
    orbiteBase: 40,
    rayonBase: 1,
    rayonVisuelBase: 1.2,
    incBase: 0.1,
    orbite: new THREE.Mesh(),
    changerAnneau,
  };
}

describe('appliquerPlacements', () => {
  it('transmet le choix d’anneaux de chaque planète', () => {
    const choix: Array<string | undefined> = [];
    const a = planete('a', (c) => choix.push(c));
    const b = planete('b', (c) => choix.push(c));

    appliquerPlacements([a, b], 5, { ...REGLAGE_DEFAUT, placements: { a: { anneau: '#ff0000' } } });

    expect(choix).toEqual(['#ff0000', undefined]);
  });

  it('écarte du soleil une planète dont les anneaux ont élargi l’étendue', () => {
    const p = planete('a', () => {
      p.rayonVisuelBase = 6;
    });
    const sans = planete('b');

    appliquerPlacements([p, sans], 5, {
      ...REGLAGE_DEFAUT,
      placements: { a: { distance: 1 }, b: { distance: 1 } },
    });

    expect(p.rayonVisuel).toBe(6);
    expect(p.orbitRadius).toBeGreaterThan(sans.orbitRadius);
  });
});
