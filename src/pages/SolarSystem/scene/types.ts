import type * as THREE from 'three';
import type { Game } from '../../../features/types';

/** Une planète et son état orbital. */
export type PlanetEntry = {
  game: Game;
  mesh: THREE.Mesh;
  orbitRadius: number;
  angle: number;
  speed: number;
  paused: boolean;
  /** Rayon de la sphère, dérivé de la taille du jeu sur le disque. */
  radius: number;
  /**
   * Rayon de ce qu'on voit réellement : anneaux et atmosphère compris.
   *
   * Un système d'anneaux porte jusqu'à près de quatre rayons. Cadrer sur la
   * seule sphère revenait à ignorer les trois quarts de l'objet à l'écran.
   */
  rayonVisuel: number;
  /** Inclinaison du plan orbital. */
  inc: number;
  /** Longitude du nœud ascendant. */
  node: number;
  /** Teinte de l'atmosphère, reprise par la lueur de repérage. */
  tint: THREE.Color;
};
