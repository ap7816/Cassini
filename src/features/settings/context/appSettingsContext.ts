import { createContext } from 'react';
import type { AppSettings, PageRappelable } from '../../types';
import type { ModeTheme } from '../theme';
import type { EvenementMusical } from '../../evenements/musiqueEvenement';

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
  setCielVivant: (enabled: boolean) => void;
  setEvenementsCiel: (enabled: boolean) => void;
  /** Le morceau d'un événement : un fichier de la machine, ou `null` pour le dossier. */
  setMusiqueEvenement: (evenement: EvenementMusical, chemin: string | null) => void;
  setFinesse: (v: number) => void;
  setDebordement: (enabled: boolean) => void;
  setDensiteCiel: (v: number) => void;
  setPlanetSizeByPlaytime: (enabled: boolean) => void;
  setStartSystem: (cle: string) => void;
  setThemeMode: (mode: ModeTheme) => void;
  /** Affiche ou masque l'entrée d'une page dans la barre des launchers. */
  setPageVisible: (page: PageRappelable, visible: boolean) => void;
};

// Contexte React pour les paramètres globaux de l'application (null tant que le provider n'est pas monté)
export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);
