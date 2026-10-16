import { describe, it, expect } from 'vitest';
import { doitSauterImage } from './cadence';

/**
 * Le piège de la limite d'images, et la raison de la demi-milliseconde.
 *
 * Les images arrivent par pas fixes, celui de l'écran. Comparer sans marge
 * revient à exiger que chaque image arrive à l'échéance ou après : à 60 Hz,
 * demander soixante images par seconde fait sauter une image sur deux dès que
 * l'horloge dérive d'un cheveu, et on en obtient trente.
 */
describe('la limite d’images par seconde', () => {
  it('ne saute rien quand il n’y a pas de limite', () => {
    expect(doitSauterImage(1000, 999, 0)).toBe(false);
    expect(doitSauterImage(1000, 1000, 0)).toBe(false);
  });

  it('saute ce qui arrive trop tôt', () => {
    // Trente images par seconde : une toutes les 33,3 ms.
    expect(doitSauterImage(1010, 1000, 30)).toBe(true);
    expect(doitSauterImage(1040, 1000, 30)).toBe(false);
  });

  it('laisse passer l’image qui arrive un cheveu trop tôt', () => {
    // Un écran à 60 Hz, une limite à 60 : l'écart voulu est exactement le pas
    // de l'écran. Sans marge, cette image-là serait sautée et la cadence
    // tomberait de moitié.
    expect(doitSauterImage(1016.6, 1000, 60)).toBe(false);
    expect(doitSauterImage(1016.4, 1000, 60)).toBe(false);
    // Mais une image franchement en avance est bien sautée.
    expect(doitSauterImage(1008, 1000, 60)).toBe(true);
  });

  /**
   * Sauter des images ne peut donner que des sous-multiples de la cadence de
   * l'écran. À 144 Hz, une image sur deux fait 72, une sur trois 48 : demander
   * 60 donne donc 48, et non 60. C'est le prix de la régularité — viser 60 au
   * plus près obligerait à alterner deux et trois images d'écran, et cette
   * alternance se voit bien plus qu'une cadence un peu basse mais stable.
   */
  function compter(hz: number, limite: number): number {
    const pas = 1000 / hz;
    let derniere = 0;
    let dessinees = 0;
    for (let i = 1; i <= hz; i++) {
      const maintenant = i * pas;
      if (doitSauterImage(maintenant, derniere, limite)) continue;
      dessinees++;
      derniere = maintenant;
    }
    return dessinees;
  }

  it('ne dépasse jamais la limite demandée', () => {
    expect(compter(144, 60)).toBeLessThanOrEqual(60);
    expect(compter(60, 30)).toBeLessThanOrEqual(30);
    expect(compter(165, 120)).toBeLessThanOrEqual(120);
  });

  it('tombe sur le sous-multiple de l’écran le plus proche', () => {
    // 144 Hz : une image sur trois.
    expect(compter(144, 60)).toBe(48);
    // 60 Hz : une sur deux, et cette fois le compte tombe juste.
    expect(compter(60, 30)).toBe(30);
    // Une limite au-delà de l'écran ne coûte rien : tout passe.
    expect(compter(60, 144)).toBe(60);
  });
});
