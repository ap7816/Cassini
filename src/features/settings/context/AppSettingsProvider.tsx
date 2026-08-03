import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSettings } from '../../types';
import { loadSettings, saveSettings } from '../service/settingsStorage';
import { AppSettingsContext } from './appSettingsContext';

// Fournit les paramètres de l'application à tous les composants enfants et persiste les changements
export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  // Sauvegarde automatique à chaque modification des paramètres
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Met à jour l'image de fond en base64 (compressée côté SettingsPage)
  function setBackgroundImageDataUrl(dataUrl: string) {
    setSettings((prev) => ({ ...prev, backgroundImageDataUrl: dataUrl }));
  }

  // Supprime l'image de fond personnalisée pour revenir au fond par défaut
  function clearBackgroundImage() {
    setSettings((prev) => ({ ...prev, backgroundImageDataUrl: null }));
  }

  // Met à jour la couleur d'accent utilisée dans toute l'interface via la variable CSS --accent
  function setAccentColor(color: string) {
    setSettings((prev) => ({ ...prev, accentColor: color }));
  }

  // Met à jour l'opacité de l'overlay sombre sur l'image de fond (0 = transparent, 1 = opaque)
  function setBgOverlayOpacity(opacity: number) {
    setSettings((prev) => ({ ...prev, bgOverlayOpacity: opacity }));
  }

  // Met à jour la clé API SteamGridDB utilisée pour récupérer les images des jeux non-Steam
  function setSgdbApiKey(key: string) {
    setSettings((prev) => ({ ...prev, sgdbApiKey: key }));
  }

  // Active ou désactive le démarrage automatique de l'application avec Windows
  function setAutostart(enabled: boolean) {
    setSettings((prev) => ({ ...prev, autostart: enabled }));
  }

  // Active ou désactive le mode "continuer en arrière-plan" (fermer = minimiser dans la barre des tâches)
  function setRunInBackground(enabled: boolean) {
    setSettings((prev) => ({ ...prev, runInBackground: enabled }));
  }

  // Active ou désactive les particules de neige sur la page musique
  function setMusicParticles(enabled: boolean) {
    setSettings((prev) => ({ ...prev, musicParticles: enabled }));
  }

  // Mémoïse l'objet de contexte pour éviter des re-rendus inutiles chez tous les consommateurs
  const value = useMemo(
    () => ({
      settings,
      setBackgroundImageDataUrl,
      clearBackgroundImage,
      setAccentColor,
      setBgOverlayOpacity,
      setSgdbApiKey,
      setAutostart,
      setRunInBackground,
      setMusicParticles,
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
