import { describe, expect, it } from 'vitest';
import { normaliserSystemes, nouveauSysteme, trierJeux } from './customSystems';
import type { Game } from '../../../features/types';

const jeu = (id: string, title: string, extra: Partial<Game> = {}): Game => ({
  id, title, platform: 'Steam', launchUrl: '', installed: true,
  favorite: false, lastPlayedAt: null, customImageUrl: null, ...extra,
} as Game);

const systeme = (jeux: string[]) =>
  nouveauSysteme({ id: 's1', nom: 'Favoris', icone: 'etoile', couleur: '#f0c040', jeux });

const parId = new Map<string, Game>([
  ['a', jeu('a', 'Zelda', { sizeOnDisk: 10, lastPlayedAt: '2026-01-01T00:00:00.000Z' })],
  ['b', jeu('b', 'apex', { sizeOnDisk: 300, lastPlayedAt: '2026-05-05T00:00:00.000Z' })],
  ['c', jeu('c', 'Minecraft', { sizeOnDisk: 50 })],
]);

describe('trierJeux', () => {
  it('range de A à Z sans se laisser tromper par la casse', () => {
    expect(trierJeux(systeme(['a', 'b', 'c']), parId, 'az').jeux).toEqual(['b', 'c', 'a']);
  });

  it('range de Z à A', () => {
    expect(trierJeux(systeme(['a', 'b', 'c']), parId, 'za').jeux).toEqual(['a', 'c', 'b']);
  });

  it('met la plus grosse au plus près du soleil', () => {
    expect(trierJeux(systeme(['a', 'b', 'c']), parId, 'taille').jeux).toEqual(['b', 'c', 'a']);
  });

  it('met la plus récemment jouée en premier, et les jamais jouées en dernier', () => {
    expect(trierJeux(systeme(['a', 'b', 'c']), parId, 'recent').jeux).toEqual(['b', 'a', 'c']);
  });

  it('garde en fin de liste un jeu absent de la bibliothèque plutôt que de le perdre', () => {
    const sortie = trierJeux(systeme(['a', 'fantome', 'b']), parId, 'az');

    expect(sortie.jeux).toEqual(['b', 'a', 'fantome']);
  });

  it('ne touche pas aux placements choisis', () => {
    const s = { ...systeme(['a', 'b']), placements: { a: { distance: 42 } } };

    expect(trierJeux(s, parId, 'az').placements).toEqual({ a: { distance: 42 } });
  });
});

describe('normaliserSystemes', () => {
  it('accepte une couleur d’étoile valide et rejette le reste', () => {
    const [ok] = normaliserSystemes([{ id: '1', nom: 'A', couleurSoleil: '#FF8800' }]);
    const [ko] = normaliserSystemes([{ id: '2', nom: 'B', couleurSoleil: 'rouge' }]);

    expect(ok.couleurSoleil).toBe('#ff8800');
    expect(ko.couleurSoleil).toBeNull();
  });

  it('laisse null pour un système écrit avant que le réglage existe', () => {
    const [s] = normaliserSystemes([{ id: '1', nom: 'A' }]);

    expect(s.couleurSoleil).toBeNull();
  });

  it('écarte un système sans identifiant ni nom', () => {
    expect(normaliserSystemes([{ nom: 'A' }, { id: '1' }, null, 'x'])).toHaveLength(0);
  });
});
