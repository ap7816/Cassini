export type GamePlatform = 'Steam' | 'Epic' | 'BattleNet' | 'GOG' | 'Other';

export type Game = {
  id: string;
  title: string;
  platform: GamePlatform;
  installed?: boolean;
  lastPlayedAt?: string | null; // ISO date string
  launchUrl?: string | null;

  // NEW
  favorite?: boolean;
  customImageUrl?: string | null;
  steamAppId?: string | null;
};

export type AppSettings = {
  backgroundImageDataUrl: string | null;
  accentColor: string;
  bgOverlayOpacity: number;
  rawgApiKey: string;
  autostart: boolean;
  runInBackground: boolean;
};
