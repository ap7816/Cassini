import type { Game } from '../../types';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';

export type LaunchResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_INSTALLED' | 'NO_LAUNCH_URL' | 'OPEN_FAILED'; message: string };

// Détecte si la cible est une URL avec protocole (steam://, https://, file://, etc.)
function isUrlTarget(target: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(target);
}

// Détecte si la cible est un chemin Windows local (C:\... ou \\server\share\...)
function isLocalWindowsPath(input: string): boolean {
  return /^[a-zA-Z]:\\/.test(input) || input.startsWith('\\\\');
}

// Ouvre la cible en choisissant la méthode appropriée selon le type d'URL et la plateforme
// Gère les protocoles spéciaux : battlenet://, riotclient://, uplay://
async function openExternal(target: string): Promise<void> {
  if (isTauri()) {
    // Battle.net : délègue au commande Tauri qui invoque Battle.net.exe --exec=launch <uid>
    const battlenetMatch = target.match(/^battlenet:\/\/([^/]+)$/);
    if (battlenetMatch) {
      await invoke('launch_battlenet_game', { uid: battlenetMatch[1] });
      return;
    }

    // Riot Client : délègue au commande Tauri qui invoque RiotClientServices.exe --launch-product=<product>
    const riotMatch = target.match(/^riotclient:\/\/(.+)$/);
    if (riotMatch) {
      await invoke('launch_riot_game', { product: riotMatch[1] });
      return;
    }

    // Ubisoft Connect : passe par cmd /c start pour que Windows traite le protocole uplay://
    const ubisoftMatch = target.match(/^uplay:\/\/launch\/(\d+)\/0$/);
    if (ubisoftMatch) {
      await invoke('launch_ubisoft_game', { gameId: ubisoftMatch[1] });
      return;
    }

    if (isUrlTarget(target)) {
      await openUrl(target);
      return;
    }

    // Chemin local (C:\...) ou autre — ouverture via le plugin opener de Tauri
    await openPath(target);
    return;
  }

  // Fallback web : les protocoles custom (steam://) seront souvent bloqués par le navigateur
  if (isUrlTarget(target)) {
    window.location.assign(target);
    return;
  }

  // Les chemins locaux ne peuvent pas être ouverts depuis un navigateur web
  throw new Error('Local paths can only be opened in the desktop app.');
}

// Lance un jeu en vérifiant d'abord qu'il est installé et qu'une URL de lancement est définie
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
    const target = game.launchUrl;

    // En mode web, les chemins locaux Windows ne peuvent pas être exécutés
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
