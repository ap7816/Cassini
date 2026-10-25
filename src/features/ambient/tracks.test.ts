import { describe, it, expect } from 'vitest';
import { AMBIENT_TRACKS, ambientIndexOf, randomAmbientIndex } from './tracks';

/**
 * Le contenu réel de `public/`, relevé par Vite au moment de la transformation.
 *
 * Et non `node:fs` : la configuration de TypeScript de ce dépôt ne connaît que
 * le navigateur — pas de `@types/node` —, et en installer un jeu entier pour
 * lister quatre fichiers dans un test serait un drôle de prix. Seules les clés
 * sont lues ; les chargeurs ne sont jamais appelés, ce qui laisse les fichiers
 * de `public/` hors du graphe des modules, là où ils doivent rester.
 */
const DANS_PUBLIC = new Set(
  Object.keys(import.meta.glob('../../../public/*.mp3')).map((p) => p.split('/').pop()),
);

/**
 * La liste des pistes d'ambiance n'est qu'un tableau de chaînes, et c'est ce
 * qui la rend fragile : rien, dans le langage, ne dit qu'une de ces chaînes
 * désigne un fichier qui existe. Une entrée en trop, et l'ambiance s'arrête au
 * bout du morceau en cours — le lecteur enchaîne vers un fichier absent,
 * compte un échec, et ne reprend qu'au suivant.
 *
 * D'où ces trois vérifications, qui tiennent chacune un maillon de la chaîne :
 * le fichier est là, on sait le reconnaître à l'URL qu'il portera, et le
 * tirage du démarrage peut l'atteindre.
 */
describe('les pistes d’ambiance', () => {
  it('existent toutes dans `public/`', () => {
    // Que le relevé ait bien eu lieu : un glob qui ne trouverait plus rien —
    // dossier déplacé, chemin changé — rendrait la boucle ci-dessous muette.
    expect(DANS_PUBLIC.size).toBeGreaterThanOrEqual(AMBIENT_TRACKS.length);

    // `./ambiant1.mp3` est résolu à la racine de l'application servie, soit le
    // dossier `public/` du dépôt.
    for (const piste of AMBIENT_TRACKS) {
      expect(DANS_PUBLIC.has(piste.slice(2)), piste).toBe(true);
    }
  });

  it('se retrouvent depuis l’URL absolue que porte l’élément audio', () => {
    // Le navigateur remplace le `./` relatif par une URL complète : c'est sous
    // cette forme, et non celle de la liste, que la piste en cours se relit.
    AMBIENT_TRACKS.forEach((piste, i) => {
      expect(ambientIndexOf(`http://tauri.localhost${piste.slice(1)}`)).toBe(i);
    });

    expect(ambientIndexOf('')).toBe(-1);
    // Et la musique du lecteur n'est pas une piste d'ambiance : l'enchaînement
    // ne doit pas croire la reconnaître.
    expect(ambientIndexOf('http://tauri.localhost/une-piste-du-joueur.mp3')).toBe(-1);
  });

  it('sont toutes tirables au démarrage', () => {
    const vus = new Set<number>();
    for (let i = 0; i < 400; i += 1) vus.add(randomAmbientIndex());
    expect([...vus].sort((a, b) => a - b)).toEqual(AMBIENT_TRACKS.map((_, i) => i));
  });
});
