import { createContext } from 'react';
import type { AppSettings } from '../../types';

export type AppSettingsContextValue = {
  settings: AppSettings;
  setBackgroundImageDataUrl: (dataUrl: string) => void;
  clearBackgroundImage: () => void;
  setAccentColor: (color: string) => void;
  setBgOverlayOpacity: (opacity: number) => void;
  setRawgApiKey: (key: string) => void;
  setAutostart: (enabled: boolean) => void;
  setRunInBackground: (enabled: boolean) => void;
};

export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);
