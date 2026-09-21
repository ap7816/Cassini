import { describe, expect, it } from 'vitest';
import { appliquerScan } from './libraryScan';
import type { Game, GamePlatform } from '../../types';

/**
 * La règle que ces tests protègent tient en une phrase : **un scan ne perd
 * jamais rien**. Un jeu désinstallé est marqué, pas supprimé ; ses données
 * personnelles survivent ; et un scanner ne touche qu'à sa propre plateforme.
 *
 * C'est la dernière qui compte le plus : sans elle, scanner Steam marquerait
 * désinstallés tous les jeux Epic, puisqu'aucun n'apparaît dans son résultat.
 */

function jeu(partiel: Partial<Game> & { id: string; platform: GamePlatform }): Game {
  return {
    title: partiel.id,
    launchUrl: '',
    installed: true,
    favorite: false,
    lastPlayedAt: null,
    customImageUrl: null,
    ...partiel,
  } as Game;
}

describe('appliquerScan', () => {
  it('marque désinstallé un jeu que son scanner ne rapporte plus', () => {
    const avant = [jeu({ id: 'steam-1', title: 'Portal', platform: 'Steam' })];

    const [g] = appliquerScan(avant, [], 'Steam');
    expect(g.installed).toBe(false);
  });

  it('ne supprime jamais un jeu désinstallé', () => {
    const avant = [jeu({ id: 'steam-1', title: 'Portal', platform: 'Steam' })];

    expect(appliquerScan(avant, [], 'Steam')).toHaveLength(1);
  });

  it('conserve favori, dernière partie et image choisie après désinstallation', () => {
    const avant = [jeu({
      id: 'steam-1', title: 'Portal', platform: 'Steam',
      favorite: true, lastPlayedAt: '2026-04-04T00:00:00.000Z', customImageUrl: 'p.png',
    })];

    const [g] = appliquerScan(avant, [], 'Steam');
    expect(g.favorite).toBe(true);
    expect(g.lastPlayedAt).toBe('2026-04-04T00:00:00.000Z');
    expect(g.customImageUrl).toBe('p.png');
  });

  it('garde les tags posés à la main, même quand le jeu disparaît du scanner', () => {
    const avant = [jeu({ id: 'steam-1', platform: 'Steam', tags: ['En cours', 'Coop'] })];

    const apres = appliquerScan(avant, [], 'Steam');

    expect(apres[0].tags).toEqual(['En cours', 'Coop']);
    expect(apres[0].installed).toBe(false);
  });

  it("ne touche pas aux jeux d'une autre plateforme", () => {
    const avant = [
      jeu({ id: 'steam-1', title: 'Portal', platform: 'Steam' }),
      jeu({ id: 'epic-1', title: 'Fortnite', platform: 'Epic' }),
    ];

    const apres = appliquerScan(avant, [], 'Steam');
    expect(apres.find((g) => g.id === 'epic-1')?.installed).toBe(true);
  });

  it("laisse tranquille une entrée manuelle, qui n'est le domaine d'aucun scanner", () => {
    const avant = [jeu({ id: 'other-godot', title: 'Godot', platform: 'Other' as GamePlatform })];

    const apres = appliquerScan(avant, [], 'Steam');
    expect(apres[0].installed).toBe(true);
  });

  it('remet installé un jeu réapparu', () => {
    const avant = [jeu({ id: 'steam-1', title: 'Portal', platform: 'Steam', installed: false })];
    const detectes = [jeu({ id: 'steam-1', title: 'Portal', platform: 'Steam' })];

    const [g] = appliquerScan(avant, detectes, 'Steam');
    expect(g.installed).toBe(true);
  });

  it('force la plateforme des jeux détectés, quoi que dise le scanner', () => {
    const detectes = [jeu({ id: 'x-1', title: 'Truc', platform: 'Epic' })];

    const [g] = appliquerScan([], detectes, 'Steam');
    expect(g.platform).toBe('Steam');
  });

  it('ajoute un jeu inconnu', () => {
    const detectes = [jeu({ id: 'steam-2', title: 'Half-Life', platform: 'Steam' })];

    expect(appliquerScan([], detectes, 'Steam')).toHaveLength(1);
  });
});
