import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, PageRappelable } from '../../types';
import { loadSettings, saveSettings, migrateAndCheckKey } from '../services/settingsStorage';
import { AppSettingsContext } from './appSettingsContext';
import { accentPourTheme, resoudreTheme, type ModeTheme } from '../theme';
import type { EvenementMusical } from '../../evenements/musiqueEvenement';

// Fournit les paramètres de l'application à tous les composants enfants et persiste les changements
export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  // Au démarrage : migre une éventuelle clé stockée en clair vers le coffre
  // système, puis reflète sa présence dans l'état (jamais sa valeur).
  useEffect(() => {
    let cancelled = false;
    void migrateAndCheckKey().then((present) => {
      if (!cancelled) setSettings((prev) => ({ ...prev, sgdbKeySet: present }));
    });
    return () => { cancelled = true; };
  }, []);

  // Au démarrage : demande à Windows ce qu'il en est vraiment du démarrage
  // automatique.
  //
  // L'interrupteur affichait ce que les réglages avaient enregistré, et rien
  // d'autre. Or l'entrée de démarrage vit dans le registre, où le Gestionnaire
  // des tâches et Windows lui-même peuvent la désactiver : Cassini annonçait
  // alors « activé » pour quelque chose qui ne se produisait plus.
  useEffect(() => {
    let annule = false;
    void invoke<boolean>('get_autostart')
      .then((reel) => {
        if (annule) return;
        setSettings((prev) => (prev.autostart === reel ? prev : { ...prev, autostart: reel }));
      })
      // Hors Tauri : il n'y a pas de démarrage automatique à refléter.
      .catch(() => {});
    return () => { annule = true; };
  }, []);

  // Thème : posé sur <html> avant la peinture, pour qu'aucune image ne sorte
  // dans l'autre thème. En mode système, suit Windows à chaud.
  //
  // L'accent est posé au même endroit, ajusté au thème : les panneaux rendus
  // hors de la coque — réglages, musique, dialogues — le reçoivent aussi.
  const [systemeSombre, setSystemeSombre] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  );
  useEffect(() => {
    const requete = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!requete) return;
    const suivre = () => setSystemeSombre(requete.matches);
    requete.addEventListener('change', suivre);
    return () => requete.removeEventListener('change', suivre);
  }, []);
  const theme = resoudreTheme(settings.themeMode, systemeSombre);
  useLayoutEffect(() => {
    const racine = document.documentElement;
    racine.dataset.theme = theme;
    racine.style.setProperty('--accent', accentPourTheme(settings.accentColor, theme));
  }, [theme, settings.accentColor]);

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

  // Enregistre la clé SteamGridDB dans le coffre système (chiffré par Windows).
  // La valeur ne transite que jusqu'à Rust : elle n'est jamais conservée dans
  // l'état React ni écrite dans le stockage applicatif.
  async function setSgdbApiKey(key: string) {
    await invoke('set_sgdb_key', { key });
    const present = await invoke<boolean>('has_sgdb_key');
    setSettings((prev) => ({ ...prev, sgdbKeySet: present }));
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
  // Aurores, tempêtes et passages dans le ciel du système solaire
  function setCielVivant(enabled: boolean) {
    setSettings((prev) => ({ ...prev, cielVivant: enabled }));
  }

  // Les événements du ciel, et la musique qui les accompagne
  function setEvenementsCiel(enabled: boolean) {
    setSettings((prev) => ({ ...prev, evenementsCiel: enabled }));
  }

  function setMusiqueEvenement(evenement: EvenementMusical, chemin: string | null) {
    setSettings((prev) => ({
      ...prev,
      musiquesEvenements: { ...prev.musiquesEvenements, [evenement]: chemin },
    }));
  }

  function setVolumeEvenement(evenement: EvenementMusical, volume: number) {
    const borne = Math.max(0, Math.min(1, volume));
    setSettings((prev) => ({
      ...prev,
      volumesEvenements: { ...prev.volumesEvenements, [evenement]: borne },
    }));
  }

  // Échelle de rendu, limite d'images, compteur, débordement, densité du ciel
  function setEchelleRendu(v: number) {
    setSettings((prev) => ({ ...prev, echelleRendu: v }));
  }

  function setLimiteIPS(v: number) {
    setSettings((prev) => ({ ...prev, limiteIPS: v }));
  }

  function setAfficherIPS(v: boolean) {
    setSettings((prev) => ({ ...prev, afficherIPS: v }));
  }

  function setDebordement(enabled: boolean) {
    setSettings((prev) => ({ ...prev, debordement: enabled }));
  }

  function setDensiteCiel(v: number) {
    setSettings((prev) => ({ ...prev, densiteCiel: v }));
  }

  // Taille des planètes d'après le temps de jeu plutôt que l'espace disque
  function setPlanetSizeByPlaytime(enabled: boolean) {
    setSettings((prev) => ({ ...prev, planetSizeByPlaytime: enabled }));
  }

  // Thème de l'interface
  function setThemeMode(mode: ModeTheme) {
    setSettings((prev) => ({ ...prev, themeMode: mode }));
  }

  // Système devant lequel s'ouvre la vue
  function setStartSystem(cle: string) {
    setSettings((prev) => ({ ...prev, startSystem: cle }));
  }

  // Rappelle ou masque l'entrée d'une page dans la barre des launchers
  function setPageVisible(page: PageRappelable, visible: boolean) {
    setSettings((prev) => ({ ...prev, [page]: visible }));
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
      setCielVivant,
      setEvenementsCiel,
      setMusiqueEvenement,
      setVolumeEvenement,
      setEchelleRendu,
      setLimiteIPS,
      setAfficherIPS,
      setDebordement,
      setDensiteCiel,
      setPlanetSizeByPlaytime,
      setStartSystem,
      setThemeMode,
      setPageVisible,
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}
