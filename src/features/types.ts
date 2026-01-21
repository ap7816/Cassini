export type GamePlatform = 'Steam' | 'Epic' | 'GOG' | 'Other';

export type Game = {
  id: string;
  title: string;
  platform: GamePlatform;
  coverUrl?: string | null;
  installed?: boolean;
  lastPlayedAt?: string | null; // ISO date string

  // Nouveau: URL/URI à ouvrir pour lancer le jeu (steam://..., epic://..., etc.)
  launchUrl?: string | null;
};

export type AppSettings = {
  backgroundImageDataUrl: string | null;
};
