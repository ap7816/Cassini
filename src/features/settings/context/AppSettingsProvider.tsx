import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSettings } from '../../types';
import { loadSettings, saveSettings } from '../service/settingsStorage';
import { AppSettingsContext } from './appSettingsContext';

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

  function setAccentColor(color: string) {
    setSettings((prev) => ({ ...prev, accentColor: color }));
  }

  function setBgOverlayOpacity(opacity: number) {
    setSettings((prev) => ({ ...prev, bgOverlayOpacity: opacity }));
  }

  const value = useMemo(
    () => ({
      settings,
      setBackgroundImageDataUrl,
      clearBackgroundImage,
      setAccentColor,
      setBgOverlayOpacity,
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
