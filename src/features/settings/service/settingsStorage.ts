import type { AppSettings } from '../../types';
import { readSettingsRaw, writeSettingsRaw } from '../../../services/storage';

// Valeurs par défaut utilisées si le stockage est vide ou corrompu
const DEFAULT_SETTINGS: AppSettings = {
  backgroundImageDataUrl: null,
  accentColor: '#e5e7eb',
  bgOverlayOpacity: 0.55,
  rawgApiKey: '',
  autostart: false,
  runInBackground: false,
  musicParticles: true,
};

// Vérifie qu'une valeur est un objet non-null (guard de type pour le parsing JSON)
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// Charge les paramètres depuis le stockage persistant, en validant chaque champ individuellement
export function loadSettings(): AppSettings {
  const raw = readSettingsRaw();
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_SETTINGS;

    const bg =
      typeof parsed.backgroundImageDataUrl === 'string' ? parsed.backgroundImageDataUrl : null;
    const accentColor =
      typeof parsed.accentColor === 'string' ? parsed.accentColor : DEFAULT_SETTINGS.accentColor;
    const bgOverlayOpacity =
      typeof parsed.bgOverlayOpacity === 'number'
        ? parsed.bgOverlayOpacity
        : DEFAULT_SETTINGS.bgOverlayOpacity;
    const rawgApiKey =
      typeof parsed.rawgApiKey === 'string' ? parsed.rawgApiKey : '';
    const autostart =
      typeof parsed.autostart === 'boolean' ? parsed.autostart : false;
    const runInBackground =
      typeof parsed.runInBackground === 'boolean' ? parsed.runInBackground : false;
    const musicParticles =
      typeof parsed.musicParticles === 'boolean' ? parsed.musicParticles : true;

    return {
      backgroundImageDataUrl: bg,
      accentColor,
      bgOverlayOpacity,
      rawgApiKey,
      autostart,
      runInBackground,
      musicParticles,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Sérialise les paramètres et les écrit dans le stockage persistant
export function saveSettings(settings: AppSettings): void {
  writeSettingsRaw(JSON.stringify(settings));
}
