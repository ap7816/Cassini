import { describe, expect, it } from 'vitest';
import { deduplicateGames, mergeById, plusRecente } from './mergeGames';
import type { Game, GamePlatform } from '../../types';

/**
 * Ces règles décident de ce que l'utilisateur retrouve après un rescan. Une
 * régression ici ne se voit pas : elle efface un favori, ou fait réapparaître
 * un doublon, et personne ne relie cela au scan de la veille.
 */

function jeu(partiel: Partial<Game> & { title: string; platform: GamePlatform }): Game {
  return {
    id: `${partiel.platform.toLowerCase()}-${partiel.title.toLowerCase().replace(/\s+/g, '')}`,
    launchUrl: '',
    installed: true,
    favorite: false,
    lastPlayedAt: null,
    customImageUrl: null,
    ...partiel,
  } as Game;
}

describe('deduplicateGames', () => {
  it('garde la plateforme prioritaire quand un jeu est sur plusieurs launchers', () => {
    const sortie = deduplicateGames([
      jeu({ title: 'Overwatch 2', platform: 'BattleNet' }),
      jeu({ title: 'Overwatch 2', platform: 'Steam' }),
    ]);

    expect(sortie).toHaveLength(1);
    expect(sortie[0].platform).toBe('Steam');
  });

  it('rapproche deux titres que seule la casse ou la ponctuation sépare', () => {
    const sortie = deduplicateGames([
      jeu({ title: "Baldur's Gate 3", platform: 'Steam' }),
      jeu({ title: 'BALDURS GATE 3', platform: 'Epic' }),
    ]);

    expect(sortie).toHaveLength(1);
  });

  /**
   * Limite connue, consignée pour qu'elle ne surprenne pas deux fois : le trait
   * d'union est **supprimé** et non remplacé par une espace, si bien que
   * « Spider-Man » devient « spiderman » et ne rejoint pas « Spider Man ». Les
   * deux stores écrivant le plus souvent le titre de la même façon, le cas est
   * rare — mais le jour où on voudra le traiter, c'est ici qu'il faudra venir.
   */
  it('ne rapproche pas un trait d’union et une espace', () => {
    const sortie = deduplicateGames([
      jeu({ title: 'Spider-Man', platform: 'Steam' }),
      jeu({ title: 'Spider Man', platform: 'Epic' }),
    ]);

    expect(sortie).toHaveLength(2);
  });

  it('ne confond pas deux jeux dont les titres diffèrent vraiment', () => {
    const sortie = deduplicateGames([
      jeu({ title: 'Portal', platform: 'Steam' }),
      jeu({ title: 'Portal 2', platform: 'Steam' }),
    ]);

    expect(sortie).toHaveLength(2);
  });

  it('remonte le favori et la dernière partie depuis la copie écartée', () => {
    const sortie = deduplicateGames([
      jeu({ title: 'Diablo IV', platform: 'Steam' }),
      jeu({
        title: 'Diablo IV',
        platform: 'BattleNet',
        favorite: true,
        lastPlayedAt: '2026-01-02T10:00:00.000Z',
        customImageUrl: 'perso.png',
      }),
    ]);

    expect(sortie[0].platform).toBe('Steam');
    expect(sortie[0].favorite).toBe(true);
    expect(sortie[0].lastPlayedAt).toBe('2026-01-02T10:00:00.000Z');
    expect(sortie[0].customImageUrl).toBe('perso.png');
  });

  it("n'écrase pas les données du gagnant par celles de la copie écartée", () => {
    const sortie = deduplicateGames([
      jeu({ title: 'Hades', platform: 'Steam', lastPlayedAt: '2026-03-03T00:00:00.000Z' }),
      jeu({ title: 'Hades', platform: 'Epic', lastPlayedAt: '2020-01-01T00:00:00.000Z' }),
    ]);

    expect(sortie[0].lastPlayedAt).toBe('2026-03-03T00:00:00.000Z');
  });

  it('classe une plateforme inconnue après toutes les connues', () => {
    const sortie = deduplicateGames([
      jeu({ title: 'Godot', platform: 'Other' as GamePlatform }),
      jeu({ title: 'Godot', platform: 'Ubisoft' }),
    ]);

    expect(sortie[0].platform).toBe('Ubisoft');
  });
});

describe('mergeById', () => {
  it('préserve les données utilisateur quand un scan renvoie le même jeu', () => {
    const avant = [jeu({
      title: 'Elden Ring', platform: 'Steam',
      favorite: true, lastPlayedAt: '2026-02-02T00:00:00.000Z', customImageUrl: 'a.png',
    })];
    const scan = [jeu({ title: 'Elden Ring', platform: 'Steam' })];

    const [g] = mergeById(avant, scan);
    expect(g.favorite).toBe(true);
    expect(g.lastPlayedAt).toBe('2026-02-02T00:00:00.000Z');
    expect(g.customImageUrl).toBe('a.png');
  });

  it('retient la partie la plus récente, que Cassini ou le launcher la connaisse', () => {
    const avant = [jeu({ title: 'Portal 2', platform: 'Steam', lastPlayedAt: '2026-01-01T00:00:00.000Z' })];
    // Steam sait qu'on y a rejoué depuis, sans passer par Cassini.
    const scan = [jeu({ title: 'Portal 2', platform: 'Steam', lastPlayedAt: '2026-09-01T00:00:00.000Z' })];

    expect(mergeById(avant, scan)[0].lastPlayedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('ne recule pas la date quand le launcher en connaît une plus ancienne', () => {
    const avant = [jeu({ title: 'Portal 2', platform: 'Steam', lastPlayedAt: '2026-09-18T12:00:00.000Z' })];
    const scan = [jeu({ title: 'Portal 2', platform: 'Steam', lastPlayedAt: '2026-01-01T00:00:00.000Z' })];

    expect(mergeById(avant, scan)[0].lastPlayedAt).toBe('2026-09-18T12:00:00.000Z');
  });

  it('ajoute un jeu inconnu sans toucher aux autres', () => {
    const avant = [jeu({ title: 'Elden Ring', platform: 'Steam' })];
    const scan = [jeu({ title: 'Sekiro', platform: 'Steam' })];

    expect(mergeById(avant, scan)).toHaveLength(2);
  });
});

describe('plusRecente', () => {
  it('rend la plus récente des deux', () => {
    expect(plusRecente('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')).toBe('2026-02-01T00:00:00Z');
    expect(plusRecente('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe('2026-02-01T00:00:00Z');
  });

  it('se contente de celle qui existe, et ignore une date illisible', () => {
    expect(plusRecente(null, '2026-02-01T00:00:00Z')).toBe('2026-02-01T00:00:00Z');
    expect(plusRecente('2026-02-01T00:00:00Z', undefined)).toBe('2026-02-01T00:00:00Z');
    expect(plusRecente('n’importe quoi', '2026-02-01T00:00:00Z')).toBe('2026-02-01T00:00:00Z');
    expect(plusRecente(null, null)).toBeNull();
  });
});
