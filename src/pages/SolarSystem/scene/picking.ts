import * as THREE from 'three';
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
  /** Cibles des portails de phase, testées avant les planètes. */
  portals: THREE.Object3D[];
  /** Planète sous le curseur, ou `null`. Émis uniquement quand elle change. */
  onHover: (hit: PlanetEntry | null) => void;
  onClick: (hit: PlanetEntry | null) => void;
  onPortal: (target: THREE.Object3D) => void;
};

/**
 * Sélection à la souris et infobulle de survol.
 *
 * Deux choix de conception dictés par les performances :
 *
 *  - Le survol est résolu **une fois par frame** et non par événement souris.
 *    Une souris à 1000 Hz déclenchait autant de raycasts par seconde, pour un
 *    résultat que l'écran ne peut afficher que 60 fois.
 *  - `onHover` n'est émis qu'au changement de planète, et l'affichage reste
 *    hors de React. Le faire transiter par un état re-rendait toute la page à
 *    chaque pixel parcouru, ce qui coûtait plus cher que le rendu 3D lui-même.
 */
export function createPicker({
  canvas, camera, planets, pickMeshes, meshToEntry, portals, onHover, onClick, onPortal,
}: Options) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const proj = new THREE.Vector3();

  let downX = 0;
  let downY = 0;
  let hoverX = 0;
  let hoverY = 0;
  let hoverPending = false;
  let shown: PlanetEntry | null = null;

  /** Place `ndc` sur la position pointée et arme le lanceur de rayons. */
  function aim(clientX: number, clientY: number): DOMRect {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      ((clientY - rect.top) / rect.height) * -2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    return rect;
  }

  /**
   * Le portail passe avant les planètes : il se trouve au-delà de l'orbite
   * externe, mais la tolérance en pixels des planètes pourrait le recouvrir si
   * l'une d'elles se projette juste devant.
   */
  function hitsPortal(clientX: number, clientY: number): THREE.Object3D | null {
    if (portals.length === 0) return null;
    aim(clientX, clientY);
    return raycaster.intersectObjects(portals, false)[0]?.object ?? null;
  }

  function pick(clientX: number, clientY: number): PlanetEntry | null {
    const rect = aim(clientX, clientY);

    // 1. Un impact géométrique exact l'emporte toujours
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
    const portail = hitsPortal(e.clientX, e.clientY);
    if (portail) {
      onPortal(portail);
      return;
    }
    onClick(pick(e.clientX, e.clientY));
  }

  function onMouseMove(e: MouseEvent) {
    hoverX = e.clientX;
    hoverY = e.clientY;
    hoverPending = true;
  }

  /** Signale la planète survolée, une seule fois par changement. */
  function setHover(hit: PlanetEntry | null) {
    if (hit === shown) return;
    shown = hit;
    onHover(hit);
  }

  function onMouseLeave() {
    hoverPending = false;
    setHover(null);
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

      if (hitsPortal(hoverX, hoverY)) {
        canvas.style.cursor = 'pointer';
        setHover(null);
        return;
      }

      const hit = pick(hoverX, hoverY);
      canvas.style.cursor = hit ? 'pointer' : '';
      setHover(hit);
    },

    dispose() {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}
