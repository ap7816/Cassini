// Icônes des launchers, pour la barre de sélection du système solaire.
//
// Elles proviennent des exécutables eux-mêmes, extraites côté Rust puis mises
// en cache par `launcherIconCache` — le même cache que la page Lanceurs, dont
// les entrées sont indexées par chemin d'exécutable. Ouvrir le système solaire
// après avoir visité cette page ne coûte donc aucune extraction.

import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { GamePlatform } from '../../../features/types';
import iconeXbox from '../../../assets/xbox.svg';
import {
  getCachedLauncherIconsById,
  storeLauncherIcons,
} from '../../../features/launchers/services/launcherIconCache';

/**
 * Identifiants renvoyés par `scan_launchers`, traduits en plateformes de la
 * bibliothèque.
 *
 * Les deux nommages sont distincts et le resteront : le scanner désigne un
 * logiciel installé sur la machine, la bibliothèque une provenance de jeu. GOG
 * n'a par exemple pas de détecteur alors que la bibliothèque connaît la
 * plateforme.
 */
/**
 * Identifiant de launcher vers plateforme de la bibliothèque.
 *
 * Exporté parce que la coque s'en sert aussi : pour savoir si un scan qui a
 * échoué concerne un launcher réellement installé, il faut relier les deux
 * nommages, et deux tables finiraient par diverger.
 */
export const PLATEFORME_PAR_LAUNCHER: Record<string, GamePlatform> = {
  steam: 'Steam',
  epic: 'Epic',
  battlenet: 'BattleNet',
  riot: 'Riot',
  rockstar: 'Rockstar',
  ubisoft: 'Ubisoft',
  hytale: 'Hytale',
  hoyoplay: 'HoYoPlay',
};

type LauncherDto = {
  id: string;
  installed: boolean;
  iconPath?: string | null;
};

/**
 * Icône de chaque plateforme détectée sur la machine, en `data:` URL.
 *
 * Une plateforme absente de la carte n'a pas d'icône disponible — launcher non
 * installé, extraction impossible, ou exécution hors Tauri. L'appelant retombe
 * alors sur sa pastille de couleur : l'icône est un agrément de repérage, pas
 * une condition d'affichage.
 */
/**
 * Icônes fournies avec l'application, pour les plateformes dont aucun
 * exécutable ne peut en donner une.
 *
 * Un jeu du Microsoft Store n'a pas de launcher à scanner : son application
 * vit dans un dossier que l'utilisateur n'a pas le droit de lire. Sans cette
 * image, la barre n'aurait qu'une initiale.
 */
const ICONES_FOURNIES: Partial<Record<GamePlatform, string>> = { Xbox: iconeXbox };

/**
 * Applications du Store dont le shell sait donner l'icône, par plateforme.
 *
 * C'est la même image que dans le menu Démarrer, prise sur la machine : rien
 * de la marque n'est embarqué ici, et le dessin livré ne sert que si
 * l'application n'est pas installée.
 */
const APPLICATIONS_STORE: Partial<Record<GamePlatform, string>> = { Xbox: 'Microsoft.GamingApp_' };

/** Clé de cache d'une icône demandée au shell plutôt qu'à un exécutable. */
const cleStore = (prefixe: string) => `store:${prefixe}`;

export function useLauncherIcons(): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>(
    ICONES_FOURNIES as Record<string, string>,
  );

  useEffect(() => {
    if (!isTauri()) return;
    let annule = false;

    // Icônes des applications du Store, demandées au shell.
    void (async () => {
      const attendues = Object.entries(APPLICATIONS_STORE) as Array<[GamePlatform, string]>;
      const { byId, missing } = getCachedLauncherIconsById(
        attendues.map(([id, prefixe]) => ({ id, iconPath: cleStore(prefixe) })),
      );
      if (!annule && Object.keys(byId).length > 0) setIcons((prev) => ({ ...prev, ...byId }));

      for (const m of missing) {
        const prefixe = m.iconPath.slice('store:'.length);
        try {
          const dataUrl = await invoke<string | null>('store_app_icon', { prefix: prefixe });
          if (!dataUrl || annule) continue;
          storeLauncherIcons([{ iconPath: m.iconPath, dataUrl }]);
          setIcons((prev) => ({ ...prev, [m.id]: dataUrl }));
        } catch {
          /* application absente : le dessin livré reste affiché */
        }
      }
    })();

    void (async () => {
      let launchers: LauncherDto[];
      try {
        launchers = await invoke<LauncherDto[]>('scan_launchers');
      } catch {
        return; // sans scanner, on garde les pastilles de couleur
      }
      if (annule) return;

      // `scan_launchers` renvoie désormais tout le catalogue, launchers absents
      // compris : ceux-là n'ont ni exécutable ni icône à proposer.
      const entrees = launchers
        .filter((l) => l.installed && l.iconPath)
        .map((l) => ({ id: PLATEFORME_PAR_LAUNCHER[l.id], iconPath: l.iconPath }))
        .filter((e): e is { id: GamePlatform; iconPath: string } => Boolean(e.id));

      const { byId, missing } = getCachedLauncherIconsById(entrees);
      if (!annule && Object.keys(byId).length > 0) setIcons((prev) => ({ ...prev, ...byId }));
      if (missing.length === 0) return;

      const obtenues: Array<{ id: string; iconPath: string; dataUrl: string }> = [];
      await Promise.all(
        missing.map(async (m) => {
          try {
            const dataUrl = await invoke<string>('get_file_icon_data_url', { path: m.iconPath });
            obtenues.push({ id: m.id, iconPath: m.iconPath, dataUrl });
          } catch {
            /* icône indisponible : pastille de couleur */
          }
        }),
      );
      if (obtenues.length === 0) return;

      storeLauncherIcons(obtenues.map((o) => ({ iconPath: o.iconPath, dataUrl: o.dataUrl })));
      if (annule) return;
      setIcons((prev) => {
        const next = { ...prev };
        for (const o of obtenues) next[o.id] = o.dataUrl;
        return next;
      });
    })();

    return () => {
      annule = true;
    };
  }, []);

  return icons;
}
