import type { Game } from '../../types';

export type LaunchResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_INSTALLED' | 'NO_LAUNCH_URL' | 'OPEN_FAILED'; message: string };

async function openExternal(target: string): Promise<void> {
  const tauriOpen = window.__TAURI__?.shell?.open;
  if (tauriOpen) {
    await tauriOpen(target);
    return;
  }

  window.location.assign(target);
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
    await openExternal(game.launchUrl);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'OPEN_FAILED', message: 'Failed to open launch target.' };
  }
}
