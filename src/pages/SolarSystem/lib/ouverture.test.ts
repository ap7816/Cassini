import { describe, expect, it } from 'vitest';
import { nouveauSysteme } from './customSystems';
import { OUVERTURE_AUTO, OUVERTURE_DERNIER, systemeOuverture } from './ouverture';

const favoris = nouveauSysteme({
  id: 'fav',
  nom: 'Favoris',
  icone: 'etoile',
  couleur: '#fff',
  jeux: [],
});
const launchers = ['Steam', 'Epic'];

describe('systemeOuverture', () => {
  it('laisse la page choisir en automatique', () => {
    expect(systemeOuverture(OUVERTURE_AUTO, 'Epic', launchers, [favoris])).toBeNull();
  });

  it('rouvre le dernier système visité', () => {
    expect(systemeOuverture(OUVERTURE_DERNIER, 'Epic', launchers, [favoris])).toBe('Epic');
    expect(systemeOuverture(OUVERTURE_DERNIER, 'perso:fav', launchers, [favoris])).toBe(
      'perso:fav',
    );
    expect(systemeOuverture(OUVERTURE_DERNIER, null, launchers, [favoris])).toBeNull();
  });

  it('ouvre le système choisi, launcher ou personnalisé', () => {
    expect(systemeOuverture('Steam', null, launchers, [favoris])).toBe('Steam');
    expect(systemeOuverture('perso:fav', null, launchers, [favoris])).toBe('perso:fav');
  });

  it('retombe sur l’automatique quand le choix ne désigne plus rien', () => {
    expect(systemeOuverture('Riot', null, launchers, [favoris])).toBeNull();
    expect(systemeOuverture('perso:supprime', null, launchers, [favoris])).toBeNull();
    expect(systemeOuverture(OUVERTURE_DERNIER, 'Riot', launchers, [favoris])).toBeNull();
  });
});
