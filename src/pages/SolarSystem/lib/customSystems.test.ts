import { describe, expect, it } from 'vitest';
import {
  ANNEAU_AUCUN,
  estReglageDefaut,
  normaliserReglagesLaunchers,
  normaliserSystemes,
  nouveauSysteme,
  trierJeux,
} from './customSystems';
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

  it('garde une image préparée et écarte tout le reste', () => {
    const [ok] = normaliserSystemes([{ id: '1', nom: 'A', image: 'data:image/png;base64,iVBORw0KGgo=' }]);
    const [svg] = normaliserSystemes([{ id: '2', nom: 'B', image: 'data:image/svg+xml;base64,PHN2Zz4=' }]);
    const [url] = normaliserSystemes([{ id: '3', nom: 'C', image: 'https://exemple.com/a.png' }]);

    expect(ok.image).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(svg.image).toBeNull();
    expect(url.image).toBeNull();
  });

  it('borne la densité d’étoiles, et la laisse à zéro par défaut', () => {
    const [defaut] = normaliserSystemes([{ id: '1', nom: 'A' }]);
    const [trop] = normaliserSystemes([{ id: '2', nom: 'B', etoiles: 12 }]);
    const [negatif] = normaliserSystemes([{ id: '3', nom: 'C', etoiles: -1 }]);

    expect(defaut.etoiles).toBe(0);
    expect(trop.etoiles).toBe(3);
    expect(negatif.etoiles).toBe(0);
  });

  it('garde une couleur d’anneaux valide ou leur retrait, et rien d’autre', () => {
    const [s] = normaliserSystemes([
      {
        id: '1',
        nom: 'A',
        jeux: ['a', 'b', 'c'],
        placements: { a: { anneau: '#FF8800' }, b: { anneau: ANNEAU_AUCUN }, c: { anneau: 'rouge' } },
      },
    ]);

    expect(s.placements.a).toEqual({ anneau: '#ff8800' });
    expect(s.placements.b).toEqual({ anneau: ANNEAU_AUCUN });
    expect(s.placements.c).toBeUndefined();
  });

  it('écarte un système sans identifiant ni nom', () => {
    expect(normaliserSystemes([{ nom: 'A' }, { id: '1' }, null, 'x'])).toHaveLength(0);
  });
});

describe('normaliserReglagesLaunchers', () => {
  it('relit les réglages d’un launcher, placements compris', () => {
    const r = normaliserReglagesLaunchers({
      Steam: { soleil: 2, couleurSoleil: '#FFAA00', etoiles: 1, placements: { '620': { taille: 2 } } },
    });

    expect(r.Steam.soleil).toBe(2);
    expect(r.Steam.couleurSoleil).toBe('#ffaa00');
    expect(r.Steam.etoiles).toBe(1);
    expect(r.Steam.placements['620']).toEqual({ taille: 2 });
  });

  it('borne les valeurs et ignore ce qui n’est pas un launcher', () => {
    const r = normaliserReglagesLaunchers({ Epic: { soleil: 99 }, 'perso:x': { soleil: 2 }, Riot: 'n’importe quoi' });

    expect(r.Epic.soleil).toBe(3);
    expect(Object.keys(r)).toEqual(['Epic']);
  });

  it('rend un objet vide pour un stockage illisible', () => {
    expect(normaliserReglagesLaunchers(null)).toEqual({});
    expect(normaliserReglagesLaunchers([1, 2])).toEqual({});
  });

  it('reconnaît un réglage laissé par défaut', () => {
    const [s] = normaliserSystemes([{ id: '1', nom: 'A' }]);
    expect(estReglageDefaut(s)).toBe(true);
    expect(estReglageDefaut({ ...s, etoiles: 1 })).toBe(false);
  });
});
