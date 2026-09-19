import { describe, expect, it } from 'vitest';
import { accentPourTheme, estModeTheme, resoudreTheme } from './theme';

describe('resoudreTheme', () => {
  it('suit Windows en mode système', () => {
    expect(resoudreTheme('system', true)).toBe('dark');
    expect(resoudreTheme('system', false)).toBe('light');
  });

  it('garde un choix explicite quelle que soit la préférence de Windows', () => {
    expect(resoudreTheme('light', true)).toBe('light');
    expect(resoudreTheme('dark', false)).toBe('dark');
  });
});

describe('accentPourTheme', () => {
  it('ne touche à rien en thème sombre', () => {
    expect(accentPourTheme('#e5e7eb', 'dark')).toBe('#e5e7eb');
  });

  it('remplace un accent sans teinte par le bleu de la structure en clair', () => {
    expect(accentPourTheme('#e5e7eb', 'light')).toBe('#00628e');
  });

  it('assombrit un accent trop clair en gardant sa teinte', () => {
    const orange = accentPourTheme('#ffb347', 'light');
    expect(orange).not.toBe('#ffb347');
    // Rouge dominant, puis vert, puis bleu : toujours un orange.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(orange.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeLessThan(230);
  });

  it('garde un accent déjà assez foncé', () => {
    expect(accentPourTheme('#7c3aed', 'light')).toBe('#7c3aed');
  });
});

describe('estModeTheme', () => {
  it('reconnaît les trois modes et rien d’autre', () => {
    expect(estModeTheme('dark')).toBe(true);
    expect(estModeTheme('light')).toBe(true);
    expect(estModeTheme('system')).toBe(true);
    expect(estModeTheme('auto')).toBe(false);
    expect(estModeTheme(1)).toBe(false);
  });
});
