export type GamePlatform = 'Steam' | 'Epic' | 'GOG' | 'Other';

export type Game = {
  id: string;
  title: string;
  platform: GamePlatform;
  coverUrl?: string | null;
  installed?: boolean;
  lastPlayedAt?: string | null; // ISO date string
  launchUrl?: string | null;

  // NEW
  favorite?: boolean;
};

export type AppSettings = {
  backgroundImageDataUrl: string | null;
};
