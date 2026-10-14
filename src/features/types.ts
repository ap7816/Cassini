import type { ModeTheme } from './settings/theme';
import type { MusiquesEvenements } from './evenements/musiqueEvenement';
// Plateformes de jeu supportées par Cassini
export type GamePlatform = 'Steam' | 'Epic' | 'BattleNet' | 'Riot' | 'Rockstar' | 'Ubisoft' | 'Hytale' | 'HoYoPlay' | 'Xbox' | 'GOG' | 'Other';

// Représentation d'un jeu dans la bibliothèque — lastPlayedAt est une date ISO 8601
export type Game = {
  id: string;
  title: string;
  platform: GamePlatform;
  installed?: boolean;
  lastPlayedAt?: string | null;
  launchUrl?: string | null;
  favorite?: boolean;
  customImageUrl?: string | null;
  steamAppId?: string | null;
  sizeOnDisk?: number | null;
  installPath?: string | null;
  /** Temps de jeu en minutes, quand le launcher le tient (Steam seulement). */
  playtimeMinutes?: number | null;
  /**
   * Tags posés à la main : état d'avancement, genre, envie. Données de
   * l'utilisateur — un scan ne les touche jamais (voir `services/tags.ts`).
   */
  tags?: string[];
};

// Paramètres de personnalisation et de comportement de l'application
export type AppSettings = {
  backgroundImageDataUrl: string | null;
  accentColor: string;
  bgOverlayOpacity: number;
  // La clé SteamGridDB elle-même n'est jamais exposée au frontend : elle vit
  // dans le gestionnaire d'identifiants Windows. On ne garde ici que
  // l'information « une clé est configurée », suffisante pour l'interface.
  sgdbKeySet: boolean;
  autostart: boolean;
  runInBackground: boolean;
  /** Aurores, tempêtes et passages dans le ciel du système solaire. */
  cielVivant: boolean;
  /**
   * Les événements du ciel : étoiles filantes, comètes, supernova, trou noir.
   *
   * Distinct de `cielVivant`, qui ne gouverne que le rideau de gaz : on peut
   * vouloir le ciel vivant sans que rien ne vienne traverser le regard pendant
   * qu'on range sa bibliothèque.
   */
  evenementsCiel: boolean;
  /**
   * La musique de chaque gros événement : supernova, comète bleue, trou noir.
   *
   * Un fichier choisi sur la machine, ou `null` — auquel cas un morceau du
   * dossier `features/evenements/pistes` est tiré au sort.
   */
  musiquesEvenements: MusiquesEvenements;
  /**
   * Finesse de l'image : 1 ne dessine qu'un pixel par point d'écran, 2 en
   * dessine quatre sur un écran dense.
   *
   * C'est le réglage qui pèse le plus lourd sur une machine modeste — le coût
   * d'une scène en trois dimensions suit la surface, donc le carré de ce
   * nombre.
   */
  finesse: number;
  /** Débordement lumineux autour des étoiles et des soleils. */
  debordement: boolean;
  /** Densité du ciel : étoiles du fond et nuages des systèmes. */
  densiteCiel: number;
  /**
   * Pages encore atteignables depuis la barre des launchers.
   *
   * Le système solaire absorbe peu à peu ce que ces pages faisaient — la
   * galaxie est la bibliothèque, la barre est la liste des launchers. Leurs
   * entrées sont donc masquées, et ces réglages les rappellent le temps que
   * tout ait trouvé sa place dans la vue.
   */
  showLibrary: boolean;
  showLaunchers: boolean;
  /**
   * Taille des planètes d'après le temps de jeu plutôt que l'espace disque.
   * Seul Steam le connaît : les autres systèmes gardent l'espace disque.
   */
  planetSizeByPlaytime: boolean;
  /**
   * Système devant lequel s'ouvre la vue : `auto` (le launcher le plus
   * fourni), `dernier` (le dernier visité), ou la clé d'un système.
   */
  startSystem: string;
  /** Thème de l'interface : sombre, clair, ou celui de Windows. */
  themeMode: ModeTheme;
};

/** Les pages qu'on peut rappeler dans la barre. */
export type PageRappelable = 'showLibrary' | 'showLaunchers';
