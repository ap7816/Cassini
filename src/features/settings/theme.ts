/**
 * Thème de l'interface : sombre, clair, ou celui de Windows.
 *
 * Le thème se pose en `data-theme` sur `<html>` ; `App.css` y redéfinit les
 * jetons de couleur. La scène 3D n'en dépend pas : l'espace reste noir.
 */
export type ModeTheme = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';

export const MODES_THEME: readonly ModeTheme[] = ['dark', 'light', 'system'];

export function estModeTheme(v: unknown): v is ModeTheme {
  return typeof v === 'string' && (MODES_THEME as readonly string[]).includes(v);
}

/** Le thème effectif, `system` résolu d'après la préférence de Windows. */
export function resoudreTheme(mode: ModeTheme, systemeSombre: boolean): Theme {
  if (mode === 'system') return systemeSombre ? 'dark' : 'light';
  return mode;
}

/** Bleu de la structure en thème clair, repli d'un accent sans couleur. */
const ACCENT_CLAIR_DEFAUT = '#00628e';

/**
 * L'accent tel qu'il se lit sur le thème.
 *
 * L'accent par défaut est un blanc cassé, choisi pour le sombre : sur une
 * vitre claire, il disparaît. En thème clair, un accent sans teinte prend le
 * bleu de la structure, et un accent trop clair est assombri en gardant sa
 * teinte — un orange reste orange, lisible.
 */
export function accentPourTheme(accent: string, theme: Theme): string {
  if (theme === 'dark') return accent;
  const rgb = lireHex(accent);
  if (!rgb) return accent;
  const [h, s, l] = versHsl(rgb);
  if (s < 0.2) return ACCENT_CLAIR_DEFAUT;
  if (luminance(rgb) <= LUMINANCE_MAX) return accent;
  // Assombri par petits pas jusqu'à se lire sur une vitre claire.
  let clarte = l;
  let sortie = rgb;
  while (clarte > 0.1 && luminance(sortie) > LUMINANCE_MAX) {
    clarte -= 0.02;
    sortie = depuisHsl(h, Math.max(s, 0.55), clarte);
  }
  return versHex(sortie);
}

/**
 * Luminance au-delà de laquelle un accent ne se lit plus sur la vitre claire :
 * 0,18 donne un contraste d'environ 4,5 sur le blanc, le seuil AA.
 */
const LUMINANCE_MAX = 0.18;

/** Luminance relative, au sens des contrastes WCAG. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function lireHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function versHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h / 6, s, l];
}

function depuisHsl(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [canal(h + 1 / 3), canal(h), canal(h - 1 / 3)].map((c) => Math.round(c * 255)) as [
    number,
    number,
    number,
  ];
}

function versHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}
