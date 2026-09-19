import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COURONNE_DEFAUT, LUMIERE_DEFAUT, couronneDe, lumiereDe } from './couleurSoleil';

const hsl = (hex: number) => {
  const o = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(o);
  return o;
};

describe('couronneDe', () => {
  it('garde la couronne d’origine sans couleur propre', () => {
    expect(couronneDe(null)).toEqual(COURONNE_DEFAUT);
  });

  it('reprend la teinte de l’étoile, et s’assombrit vers l’extérieur', () => {
    const couches = couronneDe('#8fd8b4').map(hsl);
    const teinte = hsl(0x8fd8b4).h;
    for (const c of couches) expect(c.h).toBeCloseTo(teinte, 2);
    for (let i = 1; i < couches.length; i++) expect(couches[i].l).toBeLessThan(couches[i - 1].l);
  });

  it('laisse neutre le halo d’une étoile blanche', () => {
    for (const c of couronneDe('#ffffff').map(hsl)) expect(c.s).toBeLessThan(0.1);
  });
});

describe('lumiereDe', () => {
  it('garde le blanc chaud sans couleur propre', () => {
    expect(lumiereDe(null).getHex()).toBe(LUMIERE_DEFAUT);
  });

  it('teinte la lumière sans la saturer autant que l’étoile', () => {
    const lumiere = hsl(lumiereDe('#3060ff').getHex());
    expect(lumiere.h).toBeCloseTo(hsl(0x3060ff).h, 1);
    expect(lumiere.s).toBeLessThan(hsl(0x3060ff).s);
  });
});
