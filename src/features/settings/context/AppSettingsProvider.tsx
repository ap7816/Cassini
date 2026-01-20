import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppSettings } from "../../types";
import { loadSettings, saveSettings } from '../service/settingsStorage';

type AppSettingsContextValue = {
  settings: AppSettings;
  setBackgroundImageDataUrl: (dataUrl: string) => void;
  clearBackgroundImage: () => void;
};

export const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  function setBackgroundImageDataUrl(dataUrl: string) {
    setSettings((prev) => ({ ...prev, backgroundImageDataUrl: dataUrl }));
  }

  function clearBackgroundImage() {
    setSettings((prev) => ({ ...prev, backgroundImageDataUrl: null }));
  }

  const value = useMemo(
    () => ({ settings, setBackgroundImageDataUrl, clearBackgroundImage }),
    [settings]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
