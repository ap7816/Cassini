import * as THREE from 'three';
import type { ReglageSysteme } from '../lib/customSystems';
import { distanceMini } from '../lib/etendue';
import { orbitPos } from '../lib/orbits';
import type { PlanetEntry } from './types';

const AXE_Y = new THREE.Vector3(0, 1, 0);
const DEGRE = Math.PI / 180;

/**
 * Applique les réglages d'un système à ses planètes déjà construites.
 *
 * Tout part des valeurs de base gardées sur chaque planète : appliquer deux fois
 * le même réglage donne le même résultat, et retirer un placement rend la
 * valeur calculée. C'est ce qui permet de l'appeler à chaque image pendant
 * qu'on règle un système, et une seule fois à sa construction.
 *
 * @param sunR   rayon du soleil tel que calculé, avant son propre facteur
 * @param angles positions à tenir pour les planètes sans angle choisi — pendant
 *               l'édition, les orbites sont figées là où on les a trouvées
 */
export function appliquerPlacements(
  planets: readonly PlanetEntry[],
  sunR: number,
  reglage: ReglageSysteme,
  angles?: ReadonlyMap<PlanetEntry, number>,
): void {
  for (const p of planets) {
    const pl = reglage.placements[p.game.id];
    const taille = pl?.taille ?? 1;

    // Anneaux et atmosphère sont portés par la planète : ils suivent l'échelle.
    p.mesh.scale.setScalar(taille);
    p.radius = p.rayonBase * taille;
    p.rayonVisuel = p.rayonVisuelBase * taille;

    p.orbitRadius = Math.max(
      distanceMini(sunR, reglage.soleil, p.rayonVisuel),
      pl?.distance ?? p.orbiteBase,
    );
    p.inc = reglage.aPlat ? 0 : p.incBase;

    const fige = angles?.get(p);
    if (pl?.angle !== undefined) p.angle = pl.angle * DEGRE;
    else if (fige !== undefined) p.angle = fige;

    // Même loi que la construction : les orbites extérieures sont plus lentes.
    p.speed = (0.34 / Math.pow(p.orbitRadius, 0.82)) * reglage.vitesse;

    // Le tore a été construit pour la distance de base : on le remet à
    // l'échelle, et on refait son orientation, que l'inclinaison a pu changer.
    p.orbite.scale.setScalar(p.orbitRadius / p.orbiteBase);
    p.orbite.rotation.set(Math.PI / 2 + p.inc, 0, 0);
    p.orbite.rotateOnWorldAxis(AXE_Y, p.node);

    orbitPos(p.orbitRadius, p.angle, p.inc, p.node, p.mesh.position);
  }
}

/** Angle d'une planète en degrés, ramené dans [0, 360[. */
export function angleEnDegres(p: PlanetEntry): number {
  const deg = p.angle / DEGRE;
  return ((deg % 360) + 360) % 360;
}
