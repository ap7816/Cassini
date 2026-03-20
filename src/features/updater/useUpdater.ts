import { useEffect } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';

export function useUpdater() {
  useEffect(() => {
    async function checkUpdate() {
      try {
        const update = await check();
        if (!update?.available) return;

        const yes = await ask(
          `Une nouvelle version est disponible : ${update.version}\n\n${update.body ?? ''}\n\nVoulez-vous mettre à jour maintenant ?`,
          { title: 'Mise à jour disponible', kind: 'info', okLabel: 'Mettre à jour', cancelLabel: 'Plus tard' },
        );

        if (!yes) return;

        await update.downloadAndInstall();
        await relaunch();
      } catch {
        // Silently ignore update errors (offline, etc.)
      }
    }

    checkUpdate();
  }, []);
}
