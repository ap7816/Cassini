import { describe, expect, it } from 'vitest';
import { MARGIN, placePopup } from './popup';

/**
 * Le placement de la carte de détail a des cas limites — planète contre un
 * bord, carte plus haute que le cadre — qu'on ne voit pas en regardant une
 * capture d'écran, et qu'on ne remarque qu'en tombant dessus.
 */

const LARGEUR = 300;
const HAUTEUR = 280;
const CADRE_L = 1200;
const CADRE_H = 800;

describe('placePopup', () => {
  it('se pose à droite de la planète quand la place y est', () => {
    const p = placePopup(400, 400, 40, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);

    expect(p.side).toBe('right');
    expect(p.x).toBeGreaterThan(400 + 40);
  });

  it('bascule à gauche quand la carte déborderait à droite', () => {
    const p = placePopup(CADRE_L - 80, 400, 40, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);

    expect(p.side).toBe('left');
  });

  it('ne sort jamais du cadre, même pour une planète collée au bord', () => {
    for (const cx of [0, 10, CADRE_L / 2, CADRE_L - 10, CADRE_L]) {
      for (const cy of [0, 10, CADRE_H / 2, CADRE_H - 10, CADRE_H]) {
        const p = placePopup(cx, cy, 40, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);

        expect(p.x).toBeGreaterThanOrEqual(MARGIN);
        expect(p.x + LARGEUR).toBeLessThanOrEqual(CADRE_L - MARGIN);
        expect(p.y).toBeGreaterThanOrEqual(MARGIN);
        expect(p.y + HAUTEUR).toBeLessThanOrEqual(CADRE_H - MARGIN);
      }
    }
  });

  it('garde la marge qui dégage les bords de la zone 3D', () => {
    const p = placePopup(5, 5, 10, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);

    expect(p.x).toBe(MARGIN);
    expect(p.y).toBe(MARGIN);
  });

  it("retient l'ergot dans la carte, loin de ses coins", () => {
    for (const cy of [-500, 0, 400, CADRE_H, 5000]) {
      const p = placePopup(400, cy, 40, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);

      expect(p.arrowY).toBeGreaterThanOrEqual(0);
      expect(p.arrowY).toBeLessThanOrEqual(HAUTEUR);
    }
  });

  it('pointe vers la planète quand elle est en face de la carte', () => {
    const p = placePopup(400, 400, 40, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);

    // L'ergot désigne bien l'ordonnée de la planète, à l'arrondi près.
    expect(p.y + p.arrowY).toBeCloseTo(400, 0);
  });

  it('recadre plutôt que de déborder quand la carte est plus haute que le cadre', () => {
    const p = placePopup(400, 400, 40, LARGEUR, 2000, CADRE_L, CADRE_H);

    expect(p.y).toBe(MARGIN);
  });

  it("écarte la carte d'autant que la planète est grosse", () => {
    const petite = placePopup(400, 400, 20, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);
    const grosse = placePopup(400, 400, 120, LARGEUR, HAUTEUR, CADRE_L, CADRE_H);

    expect(grosse.x - petite.x).toBe(100);
  });
});
