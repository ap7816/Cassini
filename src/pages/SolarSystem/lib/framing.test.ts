import { describe, expect, it } from 'vitest';
import { composerFiche, largeurFicheVoulue } from './framing';
import { REGLAGES_DEFAUT } from '../../../features/debug/tuning';

/**
 * La largeur de la fiche et le décalage de la planète se décident ensemble :
 * c'est ce couplage qu'on vérifie ici, parce que c'est lui qu'une retouche
 * isolée casse sans bruit.
 *
 * Les largeurs voulues sont passées explicitement plutôt que lues dans les
 * réglages : un test qui dépend d'un curseur réglable ne dit plus rien du jour
 * où quelqu'un déplace le curseur.
 */

const VOULUE = 320;
const MINI = 240;

const placer = (bande: number, demiPlanete: number) =>
  composerFiche({ bande, demiPlanete, largeurVoulue: VOULUE, largeurMini: MINI });

describe('largeurFicheVoulue', () => {
  it('rend le plancher pour une bande nulle ou absurde', () => {
    expect(largeurFicheVoulue(0)).toBe(REGLAGES_DEFAUT.ficheMini);
    expect(largeurFicheVoulue(-100)).toBe(REGLAGES_DEFAUT.ficheMini);
  });

  it('grandit avec la bande, sans jamais dépasser le plafond', () => {
    expect(largeurFicheVoulue(1600)).toBeGreaterThan(largeurFicheVoulue(600));
    expect(largeurFicheVoulue(100000)).toBe(REGLAGES_DEFAUT.ficheMaxi);
  });
});

describe('composerFiche', () => {
  it('donne la largeur voulue quand la bande est large', () => {
    expect(placer(1600, 60).largeur).toBe(VOULUE);
  });

  it('ne décale pas la planète quand elle est déjà dégagée', () => {
    const p = placer(2400, 40);

    expect(p.decalage).toBe(0);
    expect(p.degagee).toBe(true);
  });

  it('pousse la planète sur le côté plutôt que de rétrécir la fiche', () => {
    // Sous ~848 px de bande, la fiche ne tient plus d'un seul côté d'une
    // planète centrée ; au-dessus de ~514, elle garde sa largeur voulue.
    const p = placer(700, 60);

    expect(p.largeur).toBe(VOULUE);
    expect(p.decalage).toBeGreaterThan(0);
    expect(p.degagee).toBe(true);
  });

  it('rétrécit la fiche seulement quand la pousser ne suffit plus', () => {
    // 520 px de bande pour une planète de 180 px : il reste 266 px, entre le
    // plancher et la largeur voulue.
    const p = placer(520, 90);

    expect(p.largeur).toBeLessThan(VOULUE);
    expect(p.largeur).toBeGreaterThanOrEqual(MINI);
  });

  it('laisse la fiche déborder plutôt que de descendre sous son plancher', () => {
    const p = placer(360, 90);

    expect(p.largeur).toBe(MINI);
    expect(p.degagee).toBe(false);
  });

  it('ne sort jamais la planète de la bande', () => {
    for (const bande of [200, 400, 800, 1600, 3000]) {
      for (const demi of [10, 60, 200, 600]) {
        const p = placer(bande, demi);
        const maxi = Math.max(0, bande / 2 - demi - 30);

        expect(p.decalage).toBeGreaterThanOrEqual(0);
        expect(p.decalage).toBeLessThanOrEqual(maxi + 1e-9);
      }
    }
  });

  it('tient compte des anneaux : une planète plus large repousse la fiche', () => {
    expect(placer(1000, 200).decalage).toBeGreaterThan(placer(1000, 40).decalage);
  });

  it('ne rend jamais une largeur négative, même pour une bande minuscule', () => {
    expect(placer(0, 0).largeur).toBeGreaterThan(0);
    expect(placer(10, 500).largeur).toBeGreaterThan(0);
  });
});
