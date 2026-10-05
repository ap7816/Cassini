import { describe, it, expect } from 'vitest';
import { amplitudeMax, attraction, parametresLentille, vissage } from './lentilleEcran';

const L = 1920;
const H = 1080;
const DIAGONALE = Math.hypot(L, H);

describe('le glissement vers le trou', () => {
  it('croît avec la distance : c’est ce qui empêche le milieu de se creuser', () => {
    expect(attraction(0)).toBe(0);
    expect(attraction(0.1)).toBeLessThan(attraction(0.3));
    expect(attraction(0.3)).toBeLessThan(attraction(0.6));
    expect(attraction(0.6)).toBeLessThan(attraction(1));
  });

  it('porte partout : aucun endroit de l’écran n’est immobile', () => {
    for (let r = 0.02; r <= 1; r += 0.02) expect(attraction(r)).toBeGreaterThan(0);
  });

  it('ne s’emballe pas au-delà de la carte', () => {
    expect(attraction(1.4)).toBe(attraction(1));
  });

  it('reste assez proche d’un simple resserrement pour ne pas se replier', () => {
    // Si le lointain rentrait beaucoup plus vite que le proche, il le
    // rattraperait : l'image se replierait sur elle-même.
    for (let r = 0.05; r < 1; r += 0.05) {
      const pente = (attraction(r + 0.01) - attraction(r)) / 0.01;
      expect(pente).toBeLessThan(2);
    }
  });
});

describe('le vissage', () => {
  it('se resserre en approchant : spirale près, glissement loin', () => {
    const angle = (r: number) => vissage(r) / r;
    expect(angle(0.05)).toBeGreaterThan(angle(0.2));
    expect(angle(0.2)).toBeGreaterThan(angle(0.6));
  });

  it('reste second derrière le glissement sur la plus grande part de la carte', () => {
    expect(vissage(0.5)).toBeLessThan(attraction(0.5));
    expect(vissage(1)).toBeLessThan(attraction(1));
  });
});

describe('amplitudeMax', () => {
  it('normalise sur ce que la carte porte vraiment', () => {
    const a = amplitudeMax();
    for (let r = 0; r <= 1; r += 0.01) {
      expect(Math.hypot(attraction(r), vissage(r)) / a).toBeLessThanOrEqual(1);
    }
    expect(a).toBeGreaterThan(0.9);
  });
});

describe('parametresLentille', () => {
  it('n’attire rien au repos, et ne montre pas de trou', () => {
    const p = parametresLentille(0, L, H);
    expect(p.portee).toBe(0);
    expect(p.echelle).toBe(0);
    expect(p.rayonTrou).toBe(0);
    expect(p.reste).toBe(1);
  });

  it('couvre tout l’écran de sa carte, où que soit l’objet', () => {
    const p = parametresLentille(0.5, L, H);
    expect(p.taille / 2).toBeGreaterThan(DIAGONALE);
    // Et sa taille ne dépend pas de la force.
    expect(parametresLentille(1, L, H).taille).toBe(p.taille);
  });

  it('va chercher de plus en plus loin à mesure que la force monte', () => {
    const a = parametresLentille(0.25, L, H).portee;
    const b = parametresLentille(0.6, L, H).portee;
    const c = parametresLentille(1, L, H).portee;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it('ne dépasse pas ce que huit bits de carte peuvent porter', () => {
    const p = parametresLentille(1, L, H);
    // Deux niveaux voisins de la carte valent `echelle / 255` pixels d'écart.
    // Au-delà de quelques pixels, l'image ne glisse plus : elle se gaufre.
    expect(p.echelle / 255).toBeLessThan(10);
  });

  it('ne fait pas grossir le trou : il paraît, puis il tient sa taille', () => {
    const tot = parametresLentille(1, L, H).rayonTrou;
    expect(tot).toBeLessThan(DIAGONALE * 0.04);
    // Posé dès le quart de la course, et plus un pixel ensuite.
    expect(parametresLentille(0.25, L, H).rayonTrou).toBe(tot);
    expect(parametresLentille(0.6, L, H).rayonTrou).toBe(tot);
    expect(parametresLentille(0.12, L, H).rayonTrou).toBeLessThan(tot);
  });

  it('éteint ce qui reste sur le dernier quart, et pas avant', () => {
    expect(parametresLentille(0.7, L, H).reste).toBe(1);
    expect(parametresLentille(0.88, L, H).reste).toBeLessThan(0.9);
    expect(parametresLentille(0.88, L, H).reste).toBeGreaterThan(0.1);
    expect(parametresLentille(1, L, H).reste).toBe(0);
  });

  it('reprend le biais de l’encodage, proportionnel à l’échelle', () => {
    const p = parametresLentille(1, L, H);
    expect(p.biais).toBeCloseTo(p.echelle * (128 / 255 - 0.5), 6);
    expect(p.biais).toBeGreaterThan(2);
  });

  it('borne la force hors de [0, 1]', () => {
    expect(parametresLentille(-3, L, H).portee).toBe(0);
    expect(parametresLentille(9, L, H)).toEqual(parametresLentille(1, L, H));
  });

  it('suit la taille de la fenêtre', () => {
    expect(parametresLentille(0.5, 800, 600).portee)
      .toBeLessThan(parametresLentille(0.5, L, H).portee);
  });

  it('ne divise pas par zéro sur une fenêtre sans surface', () => {
    const p = parametresLentille(0.5, 0, 0);
    expect(Number.isFinite(p.taille)).toBe(true);
    expect(Number.isFinite(p.echelle)).toBe(true);
  });
});
