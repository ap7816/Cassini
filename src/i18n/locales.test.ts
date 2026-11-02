import { describe, expect, it } from 'vitest';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { CHANGELOG } from '../features/patchNotes/changelog';

/**
 * Les deux langues disent-elles la même chose ?
 *
 * Une clé oubliée d'un côté ne casse rien : i18next rend la clé elle-même, et
 * l'application affiche `settings.ambientTitle` au milieu d'une phrase. Cela ne
 * se voit qu'en passant l'interface dans l'autre langue, ce qu'on ne fait pas à
 * chaque commit — d'où ce test.
 *
 * Les notes de version sont vérifiées à part : leurs clés vivent dans du code
 * (`changelog.ts`) et rien ne garantissait qu'elles aient un texte. Une version
 * publiée avec une ligne manquante afficherait son identifiant aux joueurs.
 */

/** Aplatit l'arbre en chemins pointés : `tray.open`, `changelog.v5_0_0.new_0`… */
function clefs(objet: unknown, prefixe = ''): string[] {
  if (!objet || typeof objet !== 'object') return [prefixe];
  return Object.entries(objet as Record<string, unknown>).flatMap(([cle, valeur]) =>
    clefs(valeur, prefixe ? `${prefixe}.${cle}` : cle),
  );
}

describe('catalogues de traduction', () => {
  it('ont exactement les mêmes clés', () => {
    const cotesFr = new Set(clefs(fr));
    const cotesEn = new Set(clefs(en));

    expect([...cotesFr].filter((c) => !cotesEn.has(c))).toEqual([]);
    expect([...cotesEn].filter((c) => !cotesFr.has(c))).toEqual([]);
  });

  it('ne laissent aucun texte vide', () => {
    for (const [langue, catalogue] of [
      ['fr', fr],
      ['en', en],
    ] as const) {
      const vides = clefs(catalogue).filter((chemin) => {
        const valeur = chemin
          .split('.')
          .reduce<unknown>(
            (courant, part) => (courant as Record<string, unknown>)?.[part],
            catalogue,
          );
        return typeof valeur === 'string' && valeur.trim() === '';
      });
      expect(vides, `textes vides en ${langue}`).toEqual([]);
    }
  });
});

describe('notes de version', () => {
  const attendues = CHANGELOG.flatMap((entree) =>
    entree.sections.flatMap((section) => section.itemKeys),
  );

  it('ont un texte dans les deux langues', () => {
    for (const [langue, catalogue] of [
      ['fr', fr],
      ['en', en],
    ] as const) {
      const manquantes = attendues.filter((chemin) => {
        const valeur = chemin
          .split('.')
          .reduce<unknown>(
            (courant, part) => (courant as Record<string, unknown>)?.[part],
            catalogue,
          );
        return typeof valeur !== 'string' || valeur.trim() === '';
      });
      expect(manquantes, `lignes sans texte en ${langue}`).toEqual([]);
    }
  });

  it('vont de la version la plus récente à la plus ancienne', () => {
    // Comparaison chiffre à chiffre : « 10.0.0 » vient après « 9.0.0 », ce que
    // l'ordre alphabétique dirait le contraire.
    const rang = (v: string) => v.split('.').map(Number);
    const plusRecente = (a: number[], b: number[]) => {
      const differe = a.findIndex((n, i) => n !== b[i]);
      return differe !== -1 && a[differe] > b[differe];
    };

    for (let i = 1; i < CHANGELOG.length; i++) {
      const avant = rang(CHANGELOG[i - 1].version);
      const apres = rang(CHANGELOG[i].version);
      expect(
        plusRecente(avant, apres),
        `${CHANGELOG[i - 1].version} avant ${CHANGELOG[i].version}`,
      ).toBe(true);
    }
  });
});
