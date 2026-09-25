import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ce qui se passe quand Valve n'a pas d'image.
 *
 * L'adresse d'une jaquette Steam se calcule depuis l'identifiant du jeu, sans
 * rien demander à personne — mais rien ne garantit qu'un fichier s'y trouve :
 * les outils et les sorties récentes n'en ont souvent aucun, et l'adresse
 * répond 404. Le service rendait alors cette même adresse à l'affichage qui
 * venait de la voir échouer, et la fiche gardait un cadre vide.
 */
vi.mock('../../../services/storage', () => ({
  readCoverCacheRaw: () => null,
  writeCoverCacheRaw: () => {},
  removeCoverCache: () => {},
}));

const invoque = vi.fn();
vi.mock('../../../services/tauri', () => ({
  tauriInvoke: (cmd: string, args?: Record<string, unknown>) => invoque(cmd, args),
}));

const { clearCoverCache, fetchCoverArt, steamCdnUrl } = await import('./coverArtService');

const jeu = { title: 'VRCFaceTracking', steamAppId: '3329480', platform: 'Steam' as const, installPath: null };

beforeEach(() => {
  clearCoverCache();
  invoque.mockReset();
});

describe('jaquette d’un jeu Steam', () => {
  it('rend l’adresse du CDN sans rien demander au réseau', async () => {
    await expect(fetchCoverArt(jeu)).resolves.toBe(steamCdnUrl('3329480'));
    expect(invoque).not.toHaveBeenCalled();
  });

  it('cherche ailleurs quand l’appelant dit cette adresse morte', async () => {
    // L'affichage a essayé les deux images de Valve : aucune n'existe.
    await fetchCoverArt(jeu);
    invoque.mockResolvedValue('https://exemple.test/jaquette.png');

    const trouvee = await fetchCoverArt(jeu, { sansSteam: true });
    expect(invoque).toHaveBeenCalledWith('fetch_sgdb_image', { title: 'VRCFaceTracking' });
    expect(trouvee).toBe('https://exemple.test/jaquette.png');
    // Et surtout : jamais l'adresse dont on vient de dire qu'elle ne mène à rien.
    expect(trouvee).not.toBe(steamCdnUrl('3329480'));
  });

  it('garde la jaquette trouvée pour les fois suivantes', async () => {
    invoque.mockResolvedValue('https://exemple.test/jaquette.png');
    await fetchCoverArt(jeu, { sansSteam: true });
    invoque.mockReset();

    await expect(fetchCoverArt(jeu)).resolves.toBe('https://exemple.test/jaquette.png');
    expect(invoque).not.toHaveBeenCalled();
  });

  it('rend « rien » quand le catalogue ne connaît pas le jeu, sans y retourner', async () => {
    invoque.mockResolvedValue(null);
    await expect(fetchCoverArt(jeu, { sansSteam: true })).resolves.toBeNull();
    expect(invoque).toHaveBeenCalledTimes(1);

    await expect(fetchCoverArt(jeu, { sansSteam: true })).resolves.toBeNull();
    expect(invoque).toHaveBeenCalledTimes(1);
  });
});
