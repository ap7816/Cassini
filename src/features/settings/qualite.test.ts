import { describe, it, expect } from 'vitest';
import {
  DENSITES,
  ECHELLES,
  ORDRE_PRESETS,
  PRESETS,
  densiteLaPlusProche,
  presetDe,
} from './qualite';

/**
 * Le préréglage se **déduit** des valeurs, il n'est jamais stocké.
 *
 * C'est tout l'intérêt : rien à tenir à jour, donc rien qui puisse mentir.
 * L'étiquette ne peut pas dire « Élevé » pendant que les réglages disent autre
 * chose, et c'est ce qu'on vérifie ici.
 */
describe('les préréglages de qualité', () => {
  it('se reconnaissent eux-mêmes', () => {
    for (const nom of ORDRE_PRESETS) {
      expect(presetDe(PRESETS[nom])).toBe(nom);
    }
  });

  it('tombent sur « personnalisé » dès qu’une seule valeur bouge', () => {
    expect(presetDe({ ...PRESETS.eleve, debordement: false })).toBe('perso');
    expect(presetDe({ ...PRESETS.eleve, echelleRendu: 1.25 })).toBe('perso');
    expect(presetDe({ ...PRESETS.ultra, cielVivant: false })).toBe('perso');
    expect(presetDe({ ...PRESETS.bas, densiteCiel: 1 })).toBe('perso');
  });

  it('vont du plus économe au plus gourmand, sans palier à l’envers', () => {
    for (let i = 1; i < ORDRE_PRESETS.length; i++) {
      const avant = PRESETS[ORDRE_PRESETS[i - 1]];
      const apres = PRESETS[ORDRE_PRESETS[i]];
      expect(apres.echelleRendu).toBeGreaterThan(avant.echelleRendu);
      expect(apres.densiteCiel).toBeGreaterThan(avant.densiteCiel);
    }
  });

  it('n’offrent que des valeurs que les listes proposent', () => {
    for (const nom of ORDRE_PRESETS) {
      expect(ECHELLES).toContain(PRESETS[nom].echelleRendu);
      expect(DENSITES.map((d) => d.valeur)).toContain(PRESETS[nom].densiteCiel);
    }
  });

  /**
   * La densité stockée peut valoir n'importe quoi : elle était réglée au
   * curseur, au dixième près, et les anciennes installations en gardent la
   * trace. La liste déroulée doit tout de même montrer un cran.
   */
  it('ramènent une densité quelconque au cran le plus proche', () => {
    expect(densiteLaPlusProche(1)).toBe(1);
    expect(densiteLaPlusProche(0.9)).toBe(0.8);
    expect(densiteLaPlusProche(1.6)).toBe(1.4);
    expect(densiteLaPlusProche(0.3)).toBe(0.5);
  });
});
