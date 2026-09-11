import { useEffect, useState } from 'react';
import { tauriInvoke } from '../../services/tauri';

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

export function useDiskSpace(): EspaceDisque | null {
  const [espace, setEspace] = useState<EspaceDisque | null>(null);

  useEffect(() => {
    let annule = false;
    tauriInvoke<DiskInfo>('get_disk_free_space')
      .then((d) => {
        if (annule) return;
        setEspace({ libre: d.freeBytes, total: d.totalBytes, lecteur: 'C:' });
      })
      // Hors Tauri, ou lecteur illisible : on n'affiche simplement rien.
      .catch(() => {});
    return () => { annule = true; };
  }, []);

  return espace;
}
