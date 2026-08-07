import type { AppSettings } from '../../types';
import { readSettingsRaw, writeSettingsRaw, STORAGE_KEYS } from '../../../services/storage';
import { invoke } from '@tauri-apps/api/core';

// Valeurs par défaut utilisées si le stockage est vide ou corrompu
const DEFAULT_SETTINGS: AppSettings = {
  backgroundImageDataUrl: null,
  accentColor: '#e5e7eb',
  bgOverlayOpacity: 0.55,
  sgdbKeySet: false,
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
      // Renseigné après coup par migrateAndCheckKey()
      sgdbKeySet: false,
      autostart,
      runInBackground,
      musicParticles,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Sérialise les paramètres et les écrit dans le stockage persistant.
// `sgdbKeySet` est un état dérivé du coffre système : on ne le persiste pas,
// pour qu'il ne puisse jamais diverger de la réalité.
export function saveSettings(settings: AppSettings): void {
  const { sgdbKeySet: _omit, ...persisted } = settings;
  void _omit;
  writeSettingsRaw(JSON.stringify(persisted));
}

// Déplace une éventuelle clé stockée en clair (versions ≤ 1.2.0) vers le
// coffre système, puis l'efface définitivement du stockage applicatif.
// Retourne true si une clé est disponible après l'opération.
export async function migrateAndCheckKey(): Promise<boolean> {
  const raw = readSettingsRaw();

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed)) {
        // `rawgApiKey` est le nom qu'avait ce champ avant le passage à
        // SteamGridDB. Il est relu tel quel : renommer la lecture ferait
        // perdre sa clé à toute installation antérieure à ce changement.
        const legacy =
          typeof parsed.sgdbApiKey === 'string' ? parsed.sgdbApiKey :
          typeof parsed.rawgApiKey === 'string' ? parsed.rawgApiKey : '';

        if (legacy.trim()) {
          await invoke('set_sgdb_key', { key: legacy.trim() });
          // Réécrit les réglages sans la clé — plus aucune trace en clair
          delete parsed.sgdbApiKey;
          delete parsed.rawgApiKey;
          writeSettingsRaw(JSON.stringify(parsed));
          // Purge aussi les copies miroir de localStorage, sous les deux
          // nommages : une installation ancienne peut n'avoir que l'ancien.
          try {
            window.localStorage?.removeItem(STORAGE_KEYS.settings);
            window.localStorage?.removeItem('arctive.settings.v1');
          } catch { /* quota ou mode privé : sans conséquence ici */ }
        }
      }
    } catch { /* réglages illisibles : rien à migrer */ }
  }

  try {
    return await invoke<boolean>('has_sgdb_key');
  } catch {
    return false;
  }
}
