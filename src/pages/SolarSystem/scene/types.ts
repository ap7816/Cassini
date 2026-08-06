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
  /** Inclinaison du plan orbital. */
  inc: number;
  /** Longitude du nœud ascendant. */
  node: number;
};
