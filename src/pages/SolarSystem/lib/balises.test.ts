import { describe, it, expect } from 'vitest';
import { BALISE_MIN_PX, RAYON_BALISE, placerBalise, tailleBalise } from './balises';

/**
 * Ce qu'on voit d'un système quand on en est très loin.
 *
 * Le défaut : on reculait pour embrasser la galaxie entière, et les systèmes
 * s'éteignaient un à un à mesure qu'ils passaient sous le plan lointain de la
 * caméra — à vingt mille unités, au-delà desquelles plus rien n'existe. Il ne
 * restait qu'un vide étoilé, alors que c'est précisément le moment où l'on
 * veut voir où sont les choses.
 */
describe('la balise d’un soleil lointain', () => {
  const oeil = { x: 100, y: 50, z: -200 };

  it('reste sur son soleil tant qu’on peut le voir', () => {
    const centre = { x: 400, y: 50, z: -200 };
    expect(placerBalise(centre, oeil)).toEqual(centre);
  });

  it('est rapportée autour de l’œil quand elle passe au-delà', () => {
    const centre = { x: 100 + 90000, y: 50, z: -200 };
    const p = placerBalise(centre, oeil);
    const d = Math.hypot(p.x - oeil.x, p.y - oeil.y, p.z - oeil.z);
    expect(d).toBeCloseTo(RAYON_BALISE, 6);
  });

  it('garde exactement la direction du soleil qu’elle signale', () => {
    const centre = { x: 100 + 30000, y: 50 + 44000, z: -200 - 12000 };
    const p = placerBalise(centre, oeil);

    const vers = (q: { x: number; y: number; z: number }) => {
      const dx = q.x - oeil.x,
        dy = q.y - oeil.y,
        dz = q.z - oeil.z;
      const n = Math.hypot(dx, dy, dz);
      return [dx / n, dy / n, dz / n];
    };
    const [ax, ay, az] = vers(centre);
    const [bx, by, bz] = vers(p);
    // Produit scalaire des deux directions : un, au millionième près.
    expect(ax * bx + ay * by + az * bz).toBeCloseTo(1, 6);
  });

  it('se tient en deçà du plan lointain de la caméra', () => {
    // La scène voit jusqu'à vingt mille unités. Rapporter une balise pile à
    // cette distance la ferait trancher au premier mouvement.
    expect(RAYON_BALISE).toBeLessThan(20000 * 0.8);
  });

  it('ne divise pas par zéro quand l’œil est sur le soleil', () => {
    expect(placerBalise(oeil, oeil)).toEqual(oeil);
  });
});

/**
 * Et sa taille.
 *
 * Une taille fixe la sauvait de la disparition, mais en faisait une grosse
 * boule de vingt-six pixels dès qu'on prenait du recul : sept ballons
 * lumineux au milieu d'un champ d'étoiles fines. Une atténuation ordinaire
 * ferait l'inverse et les effacerait. Il faut les deux : qu'elle rapetisse, et
 * qu'elle ne disparaisse pas.
 */
describe('la taille d’une balise', () => {
  const MAX = 26;

  it('rapetisse quand on s’éloigne, jusqu’à son plancher', () => {
    const proche = tailleBalise(2000, MAX);
    const moyen = tailleBalise(5000, MAX);
    const loin = tailleBalise(9000, MAX);
    expect(moyen).toBeLessThan(proche);
    expect(loin).toBeLessThan(moyen);
    // Et au-delà, elle ne bouge plus : c'est le plancher qui la tient.
    expect(tailleBalise(20000, MAX)).toBe(tailleBalise(60000, MAX));
  });

  it('ne dépasse jamais sa taille de près', () => {
    expect(tailleBalise(10, MAX)).toBe(MAX);
    expect(tailleBalise(0, MAX)).toBe(MAX);
  });

  it('ne descend jamais sous le seuil où on la verrait plus', () => {
    expect(tailleBalise(1e9, MAX)).toBe(BALISE_MIN_PX);
    expect(BALISE_MIN_PX).toBeGreaterThan(2);
  });

  it('est une étoile dès que le système cesse d’en être un', () => {
    // À quatre mille, le système n'est plus qu'une tache : moins de dix pixels.
    expect(tailleBalise(4000, MAX)).toBeLessThan(10);
    // Au recul d'où l'on embrasse la galaxie, elle est au plancher.
    expect(tailleBalise(15000, MAX)).toBe(BALISE_MIN_PX);
  });
});
