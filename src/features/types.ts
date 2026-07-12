// Plateformes de jeu supportées par ArcHive
export type GamePlatform = 'Steam' | 'Epic' | 'BattleNet' | 'Riot' | 'Rockstar' | 'Ubisoft' | 'GOG' | 'Other';

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
};

// Paramètres de personnalisation et de comportement de l'application
export type AppSettings = {
  backgroundImageDataUrl: string | null;
  accentColor: string;
  bgOverlayOpacity: number;
  rawgApiKey: string;
  autostart: boolean;
  runInBackground: boolean;
  musicParticles: boolean;
};
