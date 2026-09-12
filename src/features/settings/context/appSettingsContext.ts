import { createContext } from 'react';
import type { AppSettings, PageRappelable } from '../../types';

// Forme du contexte exposé par AppSettingsProvider à tous les composants enfants
export type AppSettingsContextValue = {
  settings: AppSettings;
  setBackgroundImageDataUrl: (dataUrl: string) => void;
  clearBackgroundImage: () => void;
  setAccentColor: (color: string) => void;
  setBgOverlayOpacity: (opacity: number) => void;
  setSgdbApiKey: (key: string) => Promise<void>;
  setAutostart: (enabled: boolean) => void;
  setRunInBackground: (enabled: boolean) => void;
  setMusicParticles: (enabled: boolean) => void;
  /** Affiche ou masque l'entrée d'une page dans la barre des launchers. */
  setPageVisible: (page: PageRappelable, visible: boolean) => void;
};

// Contexte React pour les paramètres globaux de l'application (null tant que le provider n'est pas monté)
export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);
