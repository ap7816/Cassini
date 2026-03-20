import type { Game } from '../../types';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';

export type LaunchResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_INSTALLED' | 'NO_LAUNCH_URL' | 'OPEN_FAILED'; message: string };

function isUrlTarget(target: string): boolean {
  // ex: steam://..., https://..., file://...
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(target);
}

function isLocalWindowsPath(input: string): boolean {
  // ex: C:\... or \\server\share\...
  return /^[a-zA-Z]:\\/.test(input) || input.startsWith('\\\\');
}

async function openExternal(target: string): Promise<void> {
  // Desktop (Tauri)
  if (isTauri()) {
    // Battle.net : lancer via Battle.net.exe --game=<uid>
    const battlenetMatch = target.match(/^battlenet:\/\/([^/]+)$/);
    if (battlenetMatch) {
      await invoke('launch_battlenet_game', { uid: battlenetMatch[1] });
      return;
    }

    if (isUrlTarget(target)) {
      await openUrl(target);
      return;
    }

    // support "path" direct (C:\...) ou autre
    await openPath(target);
    return;
  }

  // Web fallback
  if (isUrlTarget(target)) {
    // steam:// ne marchera pas en web preview → ça va souvent être bloqué
    window.location.assign(target);
    return;
  }

  // chemin local en web preview => impossible
  throw new Error('Local paths can only be opened in the desktop app.');
}

export async function launchGame(game: Game): Promise<LaunchResult> {
  if (!game.installed) {
    return { ok: false, reason: 'NOT_INSTALLED', message: 'Game is not installed.' };
  }

  if (!game.launchUrl) {
    return {
      ok: false,
      reason: 'NO_LAUNCH_URL',
      message: 'No launch target configured for this game.',
    };
  }

  try {
    // Si quelqu’un met un path Windows dans launchUrl, on l’accepte aussi
    // (ex: raccourci ajouté manuellement)
    const target = game.launchUrl;

    // petite sécurité : en web preview, un path local ne peut pas marcher
    if (!isTauri() && isLocalWindowsPath(target)) {
      return {
        ok: false,
        reason: 'OPEN_FAILED',
        message: 'Launching local executables is only available in the desktop app (Tauri).',
      };
    }

    await openExternal(target);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to open launch target.';
    return { ok: false, reason: 'OPEN_FAILED', message: msg };
  }
}
