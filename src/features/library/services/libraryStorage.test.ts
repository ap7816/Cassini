import { describe, expect, it } from 'vitest';
import { normalizeGames } from './libraryStorage';

/**
 * Ce que la bibliothèque accepte de relire.
 *
 * Un fichier de bibliothèque peut venir de l'extérieur : ces règles décident
 * ce qui a le droit d'être lancé ou affiché. Trop strictes, elles effacent une
 * cible valable — c'est ce qui est arrivé aux jeux Xbox, dont le bouton
 * « Jouer » n'avait plus rien à lancer.
 */
const base = { id: 'x', title: 'Jeu', platform: 'Xbox' };

const cible = (launchUrl: unknown) => normalizeGames([{ ...base, launchUrl }])[0]?.launchUrl ?? null;

describe('normalizeGames : cible de lancement', () => {
  it('garde une application de paquet Xbox', () => {
    const t = 'shell:AppsFolder\\Microsoft.MinecraftUWP_8wekyb3d8bbwe!Game';
    expect(cible(t)).toBe(t);
    expect(cible('shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft')).not.toBeNull();
  });

  it('écarte une adresse de paquet mal formée', () => {
    expect(cible('shell:AppsFolder\\famille')).toBeNull();
    expect(cible('shell:AppsFolder\\famille!')).toBeNull();
    expect(cible('shell:AppsFolder\\fam ille!App')).toBeNull();
    expect(cible('shell:AppsFolder\\..\\..\\Windows!App')).toBeNull();
    expect(cible('shell:Startup')).toBeNull();
  });

  it('garde les schémas des autres launchers et les chemins locaux', () => {
    expect(cible('steam://rungameid/440')).toBe('steam://rungameid/440');
    expect(cible('C:\\Jeux\\jeu.exe')).toBe('C:\\Jeux\\jeu.exe');
  });

  it('écarte ce qui viendrait d’ailleurs', () => {
    expect(cible('\\\\serveur\\partage\\charge.exe')).toBeNull();
    expect(cible('http://exemple.test/charge.exe')).toBeNull();
    expect(cible('C:\\Jeux\\..\\Windows\\system32\\cmd.exe')).toBeNull();
  });
});
