import { useEffect, useState } from 'react';
import { tauriInvoke } from '../../services/tauri';
import { subscribeGames } from '../library/services/libraryStorage';

/**
 * Occupation du disque système.
 *
 * `get_disk_free_space` interroge le lecteur d'installation de Windows — celui
 * que désigne `SystemDrive`, C: dans l'immense majorité des cas — et non tous
 * les disques de la machine. L'étiquette qui l'accompagne doit le dire : un jeu
 * installé sur un second disque ne se verrait pas dans ces chiffres.
 */
export type EspaceDisque = {
  /** Octets libres, du point de vue de l'utilisateur courant. */
  libre: number;
  /** Capacité totale du lecteur. */
  total: number;
  /** Lettre du lecteur mesuré. */
  lecteur: string;
};

type DiskInfo = { freeBytes: number; totalBytes: number };

/**
 * Délai de la seconde lecture après un changement de bibliothèque.
 *
 * Un jeu quitte la bibliothèque dès que son launcher l'a retiré de son
 * inventaire, mais le désinstalleur supprime encore ses fichiers ensuite : lu
 * à cet instant, le disque n'a pas encore rendu la place.
 */
const RELECTURE_MS = 15_000;

/** Lecture de fond, pour ce qui change hors de la bibliothèque. */
const PERIODE_MS = 60_000;

/**
 * L'espace disque, tenu à jour.
 *
 * Il n'était lu qu'une fois, à l'ouverture : désinstaller un jeu mettait bien
 * son statut à jour, mais la jauge gardait l'ancienne occupation. Il est relu
 * quand la bibliothèque change, au retour sur la fenêtre, et chaque minute
 * tant qu'elle est visible. L'appel ne coûte qu'une requête au système.
 */
export function useDiskSpace(): EspaceDisque | null {
  const [espace, setEspace] = useState<EspaceDisque | null>(null);

  useEffect(() => {
    let annule = false;
    const lire = () => {
      tauriInvoke<DiskInfo>('get_disk_free_space')
        .then((d) => {
          if (annule || !d || !(d.totalBytes > 0)) return;
          // Même valeur : pas de rendu pour rien.
          setEspace((avant) =>
            avant && avant.libre === d.freeBytes && avant.total === d.totalBytes
              ? avant
              : { libre: d.freeBytes, total: d.totalBytes, lecteur: 'C:' },
          );
        })
        // Hors Tauri, ou lecteur illisible : on n'affiche simplement rien.
        .catch(() => {});
    };

    lire();

    let differe: ReturnType<typeof setTimeout> | null = null;
    const desabonner = subscribeGames(() => {
      lire();
      if (differe) clearTimeout(differe);
      differe = setTimeout(lire, RELECTURE_MS);
    });

    const siVisible = () => {
      if (document.visibilityState === 'visible') lire();
    };
    window.addEventListener('focus', lire);
    document.addEventListener('visibilitychange', siVisible);
    const periodique = setInterval(siVisible, PERIODE_MS);

    return () => {
      annule = true;
      desabonner();
      if (differe) clearTimeout(differe);
      clearInterval(periodique);
      window.removeEventListener('focus', lire);
      document.removeEventListener('visibilitychange', siVisible);
    };
  }, []);

  return espace;
}
