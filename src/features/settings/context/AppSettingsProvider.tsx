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

  function setRawgApiKey(key: string) {
    setSettings((prev) => ({ ...prev, rawgApiKey: key }));
  }

  function setAutostart(enabled: boolean) {
    setSettings((prev) => ({ ...prev, autostart: enabled }));
  }

  function setRunInBackground(enabled: boolean) {
    setSettings((prev) => ({ ...prev, runInBackground: enabled }));
  }

  const value = useMemo(
    () => ({
      settings,
      setBackgroundImageDataUrl,
      clearBackgroundImage,
      setAccentColor,
      setBgOverlayOpacity,
      setRawgApiKey,
      setAutostart,
      setRunInBackground,
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
