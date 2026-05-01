import type { AppSettings } from '../../types';
import { readSettingsRaw, writeSettingsRaw } from '../../../services/storage';

const DEFAULT_SETTINGS: AppSettings = {
  backgroundImageDataUrl: null,
  accentColor: '#e5e7eb',
  bgOverlayOpacity: 0.55,
  rawgApiKey: '',
  autostart: false,
  runInBackground: false,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

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

    return {
      backgroundImageDataUrl: bg,
      accentColor,
      bgOverlayOpacity,
      rawgApiKey,
      autostart,
      runInBackground,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  writeSettingsRaw(JSON.stringify(settings));
}
