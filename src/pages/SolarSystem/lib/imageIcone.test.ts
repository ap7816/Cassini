import { describe, expect, it } from 'vitest';
import {
  COTE_ICONE,
  REGLES_IMAGE,
  boiteVisible,
  estDetouree,
  estImageIconeValide,
  planDessin,
  verifierFichier,
} from './imageIcone';

/** Image RGBA de test : fond transparent, un rectangle opaque. */
function imageAvecRectangle(l: number, h: number, r: { x: number; y: number; l: number; h: number }) {
  const px = new Uint8ClampedArray(l * h * 4);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.l; x++) px[(y * l + x) * 4 + 3] = 255;
  }
  return px;
}

describe('verifierFichier', () => {
  it('accepte les formats courants', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']) {
      expect(verifierFichier({ type, size: 1000 })).toBeNull();
    }
  });

  it('refuse ce qui n’est pas une image', () => {
    expect(verifierFichier({ type: 'application/pdf', size: 1000 })).toBe('type');
    expect(verifierFichier({ type: '', size: 1000 })).toBe('type');
  });

  it('refuse un fichier trop lourd', () => {
    expect(verifierFichier({ type: 'image/png', size: REGLES_IMAGE.poidsMax + 1 })).toBe('poids');
  });
});

describe('boiteVisible', () => {
  it('trouve le dessin au milieu de ses marges vides', () => {
    const px = imageAvecRectangle(100, 80, { x: 20, y: 10, l: 30, h: 50 });

    expect(boiteVisible(px, 100, 80)).toEqual({ x: 20, y: 10, largeur: 30, hauteur: 50 });
  });

  it('rend null pour une image entièrement vide', () => {
    expect(boiteVisible(new Uint8ClampedArray(10 * 10 * 4), 10, 10)).toBeNull();
  });
});

describe('estDetouree', () => {
  it('distingue une image transparente d’une image pleine', () => {
    const pleine = new Uint8ClampedArray(16).fill(255);
    const trouee = new Uint8ClampedArray(16).fill(255);
    trouee[7] = 0;

    expect(estDetouree(pleine)).toBe(false);
    expect(estDetouree(trouee)).toBe(true);
  });
});

describe('planDessin', () => {
  it('recadre une grande photo au centre pour remplir le carré', () => {
    const p = planDessin(4000, 2000, null);

    expect(p.source).toEqual({ x: 1000, y: 0, largeur: 2000, hauteur: 2000 });
    expect(p.cible).toEqual({ x: 0, y: 0, largeur: COTE_ICONE, hauteur: COTE_ICONE });
    expect(p.lisser).toBe(true);
  });

  it('garde un logo détouré entier, centré, avec de l’air autour', () => {
    const p = planDessin(1000, 1000, { x: 100, y: 300, largeur: 800, hauteur: 400 });

    // Le plus grand côté occupe le carré moins ses marges ; rien n'est coupé.
    expect(p.source).toEqual({ x: 100, y: 300, largeur: 800, hauteur: 400 });
    expect(p.cible.largeur).toBeLessThan(COTE_ICONE);
    expect(p.cible.x).toBeGreaterThan(0);
    expect(p.cible.x + p.cible.largeur).toBeCloseTo(COTE_ICONE - p.cible.x);
    expect(p.cible.y + p.cible.hauteur / 2).toBeCloseTo(COTE_ICONE / 2);
  });

  it('agrandit le pixel art d’un facteur entier, sans lissage', () => {
    const p = planDessin(16, 16, null);

    expect(p.lisser).toBe(false);
    expect(p.cible.largeur).toBe(128);
    expect(p.cible.largeur % 16).toBe(0);
  });

  it('centre un pixel art qui ne remplit pas le carré exactement', () => {
    const p = planDessin(24, 24, null);

    // 128 / 24 = 5,33 → facteur 5, soit 120 px centrés.
    expect(p.cible.largeur).toBe(120);
    expect(p.cible.x).toBe(4);
  });

  it('ne sort jamais du carré, quelle que soit la forme de l’image', () => {
    for (const [l, h] of [[3000, 200], [200, 3000], [48, 12], [900, 901]]) {
      const p = planDessin(l, h, null);

      expect(p.cible.x).toBeGreaterThanOrEqual(0);
      expect(p.cible.y).toBeGreaterThanOrEqual(0);
      expect(p.cible.x + p.cible.largeur).toBeLessThanOrEqual(COTE_ICONE + 1e-9);
      expect(p.cible.y + p.cible.hauteur).toBeLessThanOrEqual(COTE_ICONE + 1e-9);
    }
  });
});

describe('estImageIconeValide', () => {
  it('accepte une image produite par la préparation', () => {
    expect(estImageIconeValide('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(estImageIconeValide('data:image/webp;base64,UklGRg==')).toBe(true);
  });

  it('refuse un SVG, une URL distante ou du texte arbitraire', () => {
    expect(estImageIconeValide('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(estImageIconeValide('https://exemple.com/icone.png')).toBe(false);
    expect(estImageIconeValide('data:image/png;base64,<script>')).toBe(false);
    expect(estImageIconeValide(42)).toBe(false);
  });

  it('refuse une image démesurée, qui gonflerait le stockage', () => {
    expect(estImageIconeValide('data:image/png;base64,' + 'A'.repeat(300_000))).toBe(false);
  });
});
