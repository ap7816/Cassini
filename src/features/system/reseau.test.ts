import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { estEnLigne, surEtatReseau, _simulerReseau, _oublierAvisNatif } from './reseau';

/**
 * Le réseau, et ce que l'application en fait.
 *
 * Le défaut qu'on répare ici ne tenait pas à la détection, mais à ce qu'on
 * faisait de l'échec : sans wifi, chaque jaquette manquée était retenue comme
 * « ce jeu n'a pas d'image », et au retour du réseau plus rien ne se
 * rechargeait — même en actualisant la bibliothèque. La seule porte de sortie
 * était de relancer l'application.
 */
describe('état du réseau', () => {
  const vraiNavigateur = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: vraiNavigateur,
      configurable: true,
    });
  });

  function simulerNavigateur(onLine: boolean | undefined) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine },
      configurable: true,
    });
  }

  it('croit le navigateur tant que le natif n’a pas parlé', () => {
    _oublierAvisNatif();
    simulerNavigateur(false);
    expect(estEnLigne()).toBe(false);
  });

  it('se tait quand il n’en sait rien', () => {
    _oublierAvisNatif();
    // Un moteur sans `onLine` ne doit pas faire croire à une panne : un faux
    // négatif couperait les jaquettes sans raison.
    simulerNavigateur(undefined);
    expect(estEnLigne()).toBe(true);
  });

  it('prévient ses abonnés, et tout de suite de l’état courant', () => {
    simulerNavigateur(true);
    _simulerReseau(true);
    const vus: boolean[] = [];
    const retirer = surEtatReseau((e) => vus.push(e));

    _simulerReseau(false);
    _simulerReseau(true);
    retirer();
    _simulerReseau(false);

    expect(vus).toEqual([true, false, true]);
  });
});

/**
 * Et le service de jaquettes, qui est l'endroit où le défaut faisait mal.
 */
vi.mock('../../services/storage', () => ({
  readCoverCacheRaw: () => null,
  writeCoverCacheRaw: () => {},
  removeCoverCache: () => {},
}));

// Le mock distingue les commandes : la sonde de réseau et la recherche de
// jaquette passent toutes deux par `tauriInvoke`, et les confondre faisait
// compter la sonde comme une demande d'image.
const invoque = vi.fn();
vi.mock('../../services/tauri', () => ({
  tauriInvoke: (cmd: string, args?: Record<string, unknown>) =>
    cmd === 'reseau_joignable' ? Promise.resolve(true) : invoque(cmd, args),
}));

const { clearCoverCache, fetchCoverArt } = await import(
  '../library/services/coverArtService'
);

const jeuSansSteam = {
  title: 'Un jeu sans identifiant',
  steamAppId: null,
  platform: 'Other' as const,
  installPath: null,
};

describe('les jaquettes et le réseau', () => {
  beforeEach(() => {
    clearCoverCache();
    invoque.mockReset();
    _simulerReseau(true);
  });

  it('ne demande rien quand il n’y a pas de réseau', async () => {
    _simulerReseau(false);

    await expect(fetchCoverArt(jeuSansSteam)).resolves.toBeNull();
    expect(invoque).not.toHaveBeenCalled();

    // Et surtout : rien n'a été retenu. Le réseau revenu, on redemande.
    _simulerReseau(true);
    invoque.mockResolvedValue('https://exemple/jaquette.png');
    await expect(fetchCoverArt(jeuSansSteam)).resolves.toBe('https://exemple/jaquette.png');
  });

  it('ne retient pas un fournisseur injoignable comme une absence d’image', async () => {
    invoque.mockRejectedValueOnce(new Error('réseau injoignable'));
    await expect(fetchCoverArt(jeuSansSteam)).resolves.toBeNull();

    // La deuxième demande repart : l'échec n'était pas un verdict.
    invoque.mockResolvedValue('https://exemple/jaquette.png');
    await expect(fetchCoverArt(jeuSansSteam)).resolves.toBe('https://exemple/jaquette.png');
    expect(invoque).toHaveBeenCalledTimes(2);
  });

  it('retient en revanche une vraie absence, et cesse de demander', async () => {
    invoque.mockResolvedValue(null);
    await expect(fetchCoverArt(jeuSansSteam)).resolves.toBeNull();
    await expect(fetchCoverArt(jeuSansSteam)).resolves.toBeNull();
    expect(invoque).toHaveBeenCalledTimes(1);
  });

  it('oublie ces absences au retour du réseau', async () => {
    invoque.mockResolvedValue(null);
    await fetchCoverArt(jeuSansSteam);

    // Un vrai aller-retour : sans coupure, il n'y a rien à annoncer, donc rien
    // à oublier — et c'est bien ainsi.
    _simulerReseau(false);
    _simulerReseau(true);

    invoque.mockResolvedValue('https://exemple/jaquette.png');
    await expect(fetchCoverArt(jeuSansSteam)).resolves.toBe('https://exemple/jaquette.png');
  });
});
