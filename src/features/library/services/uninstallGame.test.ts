import { describe, it, expect } from 'vitest';
import { memeNom } from './uninstallGame';

/**
 * Ce qui va s'ouvrir doit être nommé quand ce n'est pas le jeu.
 *
 * Le désinstalleur était cherché avant d'agir précisément pour l'annoncer, et
 * la confirmation reprenait tout de même le titre du jeu : on lisait donc
 * « Désinstaller Fortnite ? » alors que le programme sur le point de s'ouvrir
 * était le lanceur Epic. C'est cette comparaison qui décide désormais entre
 * les deux phrases.
 */
describe('la comparaison des deux noms', () => {
  it('ne s’arrête pas à la ponctuation ni à la casse', () => {
    expect(memeNom('Battle.net', 'battle net')).toBe(true);
    expect(memeNom('Marvel’s Spider-Man', 'Marvel s Spider Man')).toBe(true);
    expect(memeNom('PAYDAY 3', 'payday 3')).toBe(true);
    // Les espaces en trop ne comptent pas davantage.
    expect(memeNom('  Hades  ', 'Hades')).toBe(true);
  });

  it('distingue le jeu de ce qui s’installe au-dessus de lui', () => {
    expect(memeNom('Epic Games Launcher', 'Fortnite')).toBe(false);
    expect(memeNom('Ubisoft Connect', 'Far Cry 6')).toBe(false);
    // Et deux jeux d'une même série restent deux jeux.
    expect(memeNom('Portal', 'Portal 2')).toBe(false);
  });

  it('garde les lettres accentuées, et ne les confond pas avec rien', () => {
    expect(memeNom('Pokémon Écarlate', 'Pokémon  Écarlate')).toBe(true);
    expect(memeNom('Pokémon', 'Pokemon')).toBe(false);
  });
});
