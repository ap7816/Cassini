import type { AppSettings } from '../../types';

const STORAGE_KEY = 'arctive.settings.v1';

const DEFAULT_SETTINGS: AppSettings = {
  backgroundImageDataUrl: null,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_SETTINGS;

    const bg =
      typeof parsed.backgroundImageDataUrl === 'string' ? parsed.backgroundImageDataUrl : null;

    return {
      backgroundImageDataUrl: bg,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
