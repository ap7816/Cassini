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

const MO = 1024 ** 2;
const GO = 1024 ** 3;
const TO = 1024 ** 4;

/**
 * Taille lisible d'un volume.
 *
 * Le téraoctet n'est pas un luxe : un disque de deux téraoctets s'affichait
 * « 1863.0 Go », un nombre qu'on relit deux fois. La décimale disparaît au-delà
 * de cent gigaoctets, où elle ne dit plus rien d'utile.
 */
export function formaterVolume(octets: number): string {
  if (octets >= TO) return `${(octets / TO).toFixed(1)} To`;
  if (octets >= GO) {
    const go = octets / GO;
    return `${go >= 100 ? Math.round(go) : go.toFixed(1)} Go`;
  }
  return `${Math.round(octets / MO)} Mo`;
}
