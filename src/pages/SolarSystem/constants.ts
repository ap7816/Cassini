import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Dimensions du système
// ─────────────────────────────────────────────────────────────────────────────

export const PLN_R = 4.6;
export const ORB_BASE = 38;
/** Écart de base entre deux orbites consécutives — une planète par orbite. */
export const ORB_STEP = 17;

// Bornes de taille des planètes. Absolues (et non dérivées du soleil) pour
// rompre la dépendance circulaire : l'écartement des orbites dépend de la plus
// grosse planète, le rayon du système de l'écartement, et le soleil du système.
export const PLN_R_MIN = PLN_R * 0.45;
export const PLN_R_MAX = PLN_R * 1.9;

export const INIT_LOOK = new THREE.Vector3(0, 0, 0);

// ─────────────────────────────────────────────────────────────────────────────
// Couleurs par plateforme
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_COLOR: Record<string, number> = {
  Steam: 0x5ea7d4,
  Epic: 0x8fa6c2,
  BattleNet: 0x00aeef,
  Riot: 0xd13639,
  Rockstar: 0xc8a84b,
  Ubisoft: 0x4098d4,
  Hytale: 0x37b9a0,
  HoYoPlay: 0xe89ac4,
  GOG: 0x9b59b6,
  Other: 0x7a8a9a,
};

export const PLATFORM_CSS: Record<string, string> = {
  Steam: '#5ea7d4',
  Epic: '#8fa6c2',
  BattleNet: '#00aeef',
  Riot: '#d13639',
  Rockstar: '#c8a84b',
  Ubisoft: '#4098d4',
  Hytale: '#37b9a0',
  HoYoPlay: '#e89ac4',
  GOG: '#9b59b6',
  Other: '#7a8a9a',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types de planètes et palettes
// ─────────────────────────────────────────────────────────────────────────────

export type PlanetType = 'rocky' | 'gas' | 'oceanic' | 'lava' | 'ice';

export const PLANET_TYPES: PlanetType[] = ['rocky', 'gas', 'oceanic', 'lava', 'ice'];

// Palettes volontairement claires : ces planètes sont vues de loin sur fond
// noir, une teinte réaliste sombre les rendrait indiscernables.
export const PALETTES: Record<PlanetType, [string, string, string]> = {
  rocky: ['#B89A72', '#E0CBA4', '#6B4A28'],
  gas: ['#E08F4E', '#FFC078', '#9B5210'],
  oceanic: ['#2A8FC8', '#5FD8FF', '#124878'],
  lava: ['#E24A18', '#FF8C4A', '#A81800'],
  ice: ['#A8D8EC', '#E8F8FF', '#4A8AC0'],
};
