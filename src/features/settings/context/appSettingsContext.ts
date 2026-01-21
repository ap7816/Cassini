import { createContext } from 'react';
import type { AppSettings } from '../../types';

export type AppSettingsContextValue = {
  settings: AppSettings;
  setBackgroundImageDataUrl: (dataUrl: string) => void;
  clearBackgroundImage: () => void;
};

export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);
