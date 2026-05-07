import { createContext } from 'react';
import type { AppSettings } from '../../types';

// Forme du contexte exposé par AppSettingsProvider à tous les composants enfants
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

// Contexte React pour les paramètres globaux de l'application (null tant que le provider n'est pas monté)
export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);
