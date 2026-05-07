import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdaterState {
  available: boolean;
  version: string;
  body: string;
  installing: boolean;
  progress: number;
  doInstall: () => Promise<void>;
  dismiss: () => void;
}

// Vérifie automatiquement au démarrage si une mise à jour est disponible via le serveur de mise à jour Tauri
export function useUpdater(): UpdaterState {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  // Lance la vérification de mise à jour une seule fois au montage du composant
  useEffect(() => {
    async function run() {
      try {
        const token = import.meta.env.VITE_UPDATER_TOKEN as string | undefined;
        const u = await check(
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );
        console.info('[updater] check result:', u);
        if (u?.available) setUpdate(u);
      } catch (e) {
        console.error('[updater] error:', e);
      }
    }
    run();
  }, []);

  // Télécharge et installe la mise à jour en affichant la progression, puis relance l'application
  async function doInstall() {
    if (!update) return;
    setInstalling(true);
    setProgress(0);
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall(event => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
          console.info('[updater] download started, size:', total);
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) setProgress(Math.round((downloaded / total) * 100));
        } else if (event.event === 'Finished') {
          console.info('[updater] download finished');
        }
      });
      await relaunch();
    } catch (e) {
      console.error('[updater] install error:', e);
      setInstalling(false);
    }
  }

  return {
    available: !!update && !dismissed,
    version: update?.version ?? '',
    body: update?.body ?? '',
    installing,
    progress,
    doInstall,
    dismiss: () => setDismissed(true),
  };
}
