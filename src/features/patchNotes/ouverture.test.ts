import { describe, expect, it } from 'vitest';
import { doitOuvrirAuDemarrage } from './ouverture';

/**
 * Quand les notes s'ouvrent toutes seules.
 *
 * Le défaut d'origine : « ne plus afficher » n'écrivait que la version lue, si
 * bien que la version suivante rouvrait les notes. Pour qui change de version
 * souvent, le bouton paraissait sans effet — c'est exactement ce qui a été
 * signalé.
 */
describe('ouverture des notes au démarrage', () => {
  it('s’ouvre sur une version jamais vue', () => {
    expect(doitOuvrirAuDemarrage(null, '5.2.0', true)).toBe(true);
    expect(doitOuvrirAuDemarrage('5.1.0', '5.2.0', true)).toBe(true);
  });

  it('se tait sur une version déjà lue', () => {
    expect(doitOuvrirAuDemarrage('5.2.0', '5.2.0', true)).toBe(false);
  });

  it('se tait pour toujours quand on le lui a demandé', () => {
    // Le point du correctif : même sur une version neuve.
    expect(doitOuvrirAuDemarrage('5.1.0', '5.2.0', false)).toBe(false);
    expect(doitOuvrirAuDemarrage(null, '9.9.9', false)).toBe(false);
  });
});
