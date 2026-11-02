import { describe, expect, it } from 'vitest';
import { rayonSysteme } from './etendue';
import { nouveauSysteme } from './customSystems';

/**
 * La page reconstruit la galaxie quand ce rayon change : il doit grandir avec
 * ce qui élargit vraiment un système, et rester stable sinon.
 */
describe('rayonSysteme', () => {
  const base = nouveauSysteme({
    id: 's',
    nom: 'S',
    icone: 'etoile',
    couleur: '#fff',
    jeux: ['a', 'b', 'c'],
  });

  it('ne bouge pas sans placement', () => {
    expect(rayonSysteme(3, base)).toBe(rayonSysteme(3, null));
  });

  it('grandit quand une planète est écartée au-delà des orbites', () => {
    const ecarte = { ...base, placements: { a: { distance: 5000 } } };

    expect(rayonSysteme(3, ecarte)).toBeGreaterThan(rayonSysteme(3, base));
  });

  it('grandit quand le soleil est agrandi', () => {
    expect(rayonSysteme(3, { ...base, soleil: 3 })).toBeGreaterThan(rayonSysteme(3, base));
  });

  it('ne rétrécit jamais sous la place prévue pour le nombre de jeux', () => {
    const rapproche = { ...base, placements: { a: { distance: 1 } } };

    expect(rayonSysteme(3, rapproche)).toBeGreaterThanOrEqual(rayonSysteme(3, null));
  });
});
