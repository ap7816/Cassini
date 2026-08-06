import * as THREE from 'three';
import type { RefObject } from 'react';
import type { PlanetEntry } from './types';

/** Rayon de tolérance, en pixels, autour du centre d'une planète. */
const PICK_RADIUS_PX = 26;
/** Déplacement au-delà duquel un clic est considéré comme un glissement. */
const DRAG_TOLERANCE_PX = 6;

type Options = {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  planets: PlanetEntry[];
  /** Tableau figé pour le raycast — le reconstruire par événement allouait. */
  pickMeshes: THREE.Object3D[];
  meshToEntry: Map<THREE.Object3D, PlanetEntry>;
  tooltipRef: RefObject<HTMLDivElement | null>;
  onClick: (hit: PlanetEntry | null) => void;
};

/**
 * Sélection à la souris et infobulle de survol.
 *
 * Deux choix de conception dictés par les performances :
 *
 *  - Le survol est résolu **une fois par frame** et non par événement souris.
 *    Une souris à 1000 Hz déclenchait autant de raycasts par seconde, pour un
 *    résultat que l'écran ne peut afficher que 60 fois.
 *  - L'infobulle est écrite **directement dans le DOM**. La passer par un état
 *    React re-rendait toute la page à chaque pixel parcouru, ce qui coûtait
 *    plus cher que le rendu 3D lui-même.
 */
export function createPicker({
  canvas, camera, planets, pickMeshes, meshToEntry, tooltipRef, onClick,
}: Options) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const proj = new THREE.Vector3();

  let downX = 0;
  let downY = 0;
  let hoverX = 0;
  let hoverY = 0;
  let hoverPending = false;
  let shownTitle: string | null = null;

  function pick(clientX: number, clientY: number): PlanetEntry | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      ((clientY - rect.top) / rect.height) * -2 + 1,
    );

    // 1. Un impact géométrique exact l'emporte toujours
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    if (hits.length > 0) {
      const hit = meshToEntry.get(hits[0].object);
      if (hit) return hit;
    }

    // 2. Sinon, la planète dont le centre est le plus proche du curseur.
    //    Indispensable : une petite planète, ou une planète lointaine, ne
    //    couvre que quelques pixels et le raycast la manque systématiquement.
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    let best: PlanetEntry | null = null;
    let bestPx = PICK_RADIUS_PX;

    for (const p of planets) {
      proj.copy(p.mesh.position).project(camera);
      if (proj.z > 1) continue; // derrière la caméra
      const px = (proj.x * 0.5 + 0.5) * rect.width;
      const py = (-proj.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(px - cx, py - cy);
      if (d < bestPx) {
        bestPx = d;
        best = p;
      }
    }
    return best;
  }

  function onMouseDown(e: MouseEvent) {
    downX = e.clientX;
    downY = e.clientY;
  }

  function onMouseUp(e: MouseEvent) {
    // Un léger glissement reste un clic ; faire tourner la caméra n'en est pas un
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_TOLERANCE_PX) return;
    onClick(pick(e.clientX, e.clientY));
  }

  function onMouseMove(e: MouseEvent) {
    hoverX = e.clientX;
    hoverY = e.clientY;
    hoverPending = true;
  }

  function hideTooltip() {
    const tip = tooltipRef.current;
    if (tip && shownTitle !== null) tip.style.display = 'none';
    shownTitle = null;
  }

  function onMouseLeave() {
    hoverPending = false;
    hideTooltip();
    canvas.style.cursor = '';
  }

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  return {
    /** À appeler une fois par frame, après mise à jour de la caméra. */
    updateHover() {
      if (!hoverPending) return;
      hoverPending = false;

      const hit = pick(hoverX, hoverY);
      canvas.style.cursor = hit ? 'pointer' : '';

      const tip = tooltipRef.current;
      if (!tip) return;

      if (!hit) {
        hideTooltip();
        return;
      }

      // Le texte n'est réécrit que si la planète survolée change
      if (hit.game.title !== shownTitle) {
        tip.textContent = hit.game.title;
        tip.style.display = '';
        shownTitle = hit.game.title;
      }
      tip.style.transform = `translate(${hoverX + 12}px, ${hoverY - 8}px)`;
    },

    dispose() {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}
