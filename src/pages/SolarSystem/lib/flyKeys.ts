import type { TFunction } from 'i18next';
import { readSolarFlyKeys, writeSolarFlyKeys } from '../../../services/storage';

/**
 * Touches de déplacement libre dans le système solaire.
 *
 * Les affectations portent sur `KeyboardEvent.code`, c'est-à-dire l'**emplacement
 * physique** de la touche, et non sur le caractère qu'elle produit. C'est ce qui
 * fait que WASD et ZQSD sont la même chose sans configuration : sur un clavier
 * AZERTY, la touche placée là où QWERTY a son W émet bien `KeyW` tout en tapant
 * « z ». Se fier à `event.key` aurait imposé deux jeux d'affectations, et laissé
 * de côté toutes les autres dispositions.
 */

export type FlyAction =
  | 'avancer'
  | 'reculer'
  | 'gauche'
  | 'droite'
  | 'monter'
  | 'descendre'
  | 'accelerer';

export type FlyKeys = Record<FlyAction, string>;

/** Affectations et sensibilité de la souris, réglées ensemble. */
export type FlySettings = {
  keys: FlyKeys;
  /** Multiplicateur de la vitesse de rotation. 1 = réglage d'origine. */
  sensibilite: number;
};

export const SENSIBILITE_MIN = 0.25;
export const SENSIBILITE_MAX = 2.5;
export const SENSIBILITE_DEFAUT = 1;

/**
 * Ordre d'affichage dans le panneau de configuration. Le libellé de chaque
 * action vient des traductions (`flyKeys.actions.<action>`).
 */
export const FLY_ACTIONS: readonly FlyAction[] = [
  'avancer',
  'reculer',
  'gauche',
  'droite',
  'monter',
  'descendre',
  'accelerer',
];

export const DEFAULT_FLY_KEYS: FlyKeys = {
  avancer: 'KeyW',
  reculer: 'KeyS',
  gauche: 'KeyA',
  droite: 'KeyD',
  monter: 'Space',
  // `KeyC` et non `ControlLeft` : les touches modificatrices seules servent
  // déjà aux raccourcis du système et de la fenêtre.
  descendre: 'KeyC',
  accelerer: 'ShiftLeft',
};

/**
 * Touches désignées par un nom plutôt que par un caractère. Leur libellé vient
 * des traductions (`flyKeys.keys.<code>`) : « Maj gauche » ici, « Left Shift »
 * ailleurs.
 */
export const TOUCHES_NOMMEES = [
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'Tab',
  'Enter',
  'Escape',
] as const;

const FLECHES: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

/**
 * Caractère produit par chaque emplacement de touche sur le clavier de
 * l'utilisateur, ou `null` quand le navigateur ne sait pas le dire.
 */
export type DispositionClavier = ReadonlyMap<string, string> | null;

type NavigateurAvecClavier = Navigator & {
  keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> };
};

/**
 * Lit la disposition du clavier.
 *
 * L'API n'existe que dans les navigateurs Chromium — la WebView de Windows en
 * est un — et peut rendre une table vide, par exemple quand la fenêtre n'a pas
 * le focus. Vide ou absente, `flyKeyLabel` retombe sur le libellé double.
 */
export async function lireDispositionClavier(): Promise<DispositionClavier> {
  try {
    const table = await (navigator as NavigateurAvecClavier).keyboard?.getLayoutMap?.();
    return table && table.size > 0 ? table : null;
  } catch {
    return null;
  }
}

/**
 * Nom lisible d'un code de touche.
 *
 * L'utilisateur cherche la touche qu'il voit, pas son nom dans la norme. Quand
 * la disposition est connue, on affiche donc la lettre que porte réellement la
 * touche — « Z » sur un clavier AZERTY là où `code` dit `KeyW`. À défaut, la
 * lettre QWERTY suivie de son équivalent AZERTY quand il diffère : un
 * utilisateur AZERTY lirait sinon des lettres qui ne correspondent à rien sur
 * son clavier.
 */
export function flyKeyLabel(code: string, t: TFunction, disposition: DispositionClavier): string {
  if ((TOUCHES_NOMMEES as readonly string[]).includes(code)) return t(`flyKeys.keys.${code}`);
  if (FLECHES[code]) return FLECHES[code];

  const produit = disposition?.get(code);
  if (produit && produit.trim()) return produit.toUpperCase();

  const azerty: Record<string, string> = { KeyA: 'Q', KeyQ: 'A', KeyW: 'Z', KeyZ: 'W', KeyM: ',' };
  const lettre = code.startsWith('Key') ? code.slice(3) : null;
  if (lettre) return azerty[code] ? `${lettre} / ${azerty[code]}` : lettre;

  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function estValide(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length < 32;
}

/**
 * Relit les affectations, en complétant champ par champ.
 *
 * Une entrée corrompue ou incomplète ne doit pas priver l'utilisateur des
 * commandes : chaque action absente retombe sur sa valeur par défaut.
 */
export function loadFlySettings(): FlySettings {
  const defaut: FlySettings = {
    keys: { ...DEFAULT_FLY_KEYS },
    sensibilite: SENSIBILITE_DEFAUT,
  };

  const raw = readSolarFlyKeys();
  if (!raw) return defaut;

  try {
    const lu = JSON.parse(raw) as Record<string, unknown>;
    for (const action of FLY_ACTIONS) {
      if (estValide(lu[action])) defaut.keys[action] = lu[action];
    }
    const s = lu.sensibilite;
    if (typeof s === 'number' && Number.isFinite(s)) {
      defaut.sensibilite = Math.min(SENSIBILITE_MAX, Math.max(SENSIBILITE_MIN, s));
    }
    return defaut;
  } catch {
    return defaut;
  }
}

/**
 * Écrit tout à plat, la sensibilité aux côtés des touches.
 *
 * Le format est resté celui d'origine, où l'objet ne contenait que les
 * affectations : une entrée écrite avant l'ajout de ce réglage se relit donc
 * telle quelle, la sensibilité absente retombant sur sa valeur par défaut.
 */
export function saveFlySettings(s: FlySettings): void {
  writeSolarFlyKeys(JSON.stringify({ ...s.keys, sensibilite: s.sensibilite }));
}
