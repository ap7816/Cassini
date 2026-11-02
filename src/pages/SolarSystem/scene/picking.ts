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
  /**
   * Cibles menant vers un autre système — une sphère invisible par soleil.
   *
   * Désigner un soleil, c'est demander à s'y rendre ; désigner une planète,
   * c'est demander à la voir. Les deux catégories se départagent par la
   * profondeur, jamais par l'ordre.
   */
  soleils: THREE.Object3D[];
  /** Planète sous le curseur, ou `null`. Émis uniquement quand elle change. */
  onHover: (hit: PlanetEntry | null) => void;
  onClick: (hit: PlanetEntry | null) => void;
  onSoleil: (target: THREE.Object3D) => void;
  /**
   * Glissement des planètes. `peut` dit si celle qu'on saisit se déplace —
   * en pratique, pendant l'édition de son système. Tant qu'on la tient, la
   * caméra ne tourne pas, et `deplacer` reçoit le rayon sous le curseur.
   */
  glisser?: {
    peut: (p: PlanetEntry) => boolean;
    debut: (p: PlanetEntry) => void;
    deplacer: (p: PlanetEntry, rayon: THREE.Ray) => void;
    fin: () => void;
  };
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
  canvas,
  camera,
  planets,
  pickMeshes,
  meshToEntry,
  soleils,
  onHover,
  onClick,
  onSoleil,
  glisser,
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
   * Ce que désigne le curseur : une planète, un soleil, ou rien.
   *
   * C'est la **profondeur** qui tranche, jamais la catégorie. La cible menant
   * ailleurs passait auparavant systématiquement avant les planètes, au motif
   * qu'elle se trouve au-delà de l'orbite externe. Mais un système lointain se
   * projette volontiers sur celui qu'on regarde : une planète posée devant lui
   * devenait incliquable, et le clic partait vers un autre launcher au lieu de
   * zoomer.
   */
  function designer(
    clientX: number,
    clientY: number,
  ): { planete: PlanetEntry | null; soleil: THREE.Object3D | null } {
    const rect = aim(clientX, clientY);

    const surSoleil =
      soleils.length > 0 ? (raycaster.intersectObjects(soleils, false)[0] ?? null) : null;

    // 1. Un impact géométrique exact sur une planète, s'il est plus proche que
    //    le portail.
    for (const h of raycaster.intersectObjects(pickMeshes, false)) {
      const e = meshToEntry.get(h.object);
      if (!e) continue;
      return surSoleil && surSoleil.distance < h.distance
        ? { planete: null, soleil: surSoleil.object }
        : { planete: e, soleil: null };
    }

    // 2. Sinon, la planète dont le centre est le plus proche du curseur.
    //    Indispensable : une petite planète, ou une planète lointaine, ne
    //    couvre que quelques pixels et le raycast la manque systématiquement.
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    let best: PlanetEntry | null = null;
    let bestPx = PICK_RADIUS_PX;

    for (const p of planets) {
      // Position monde : une planète appartient au groupe de son système, sa
      // position propre est relative au soleil de celui-ci.
      p.mesh.getWorldPosition(proj).project(camera);
      if (proj.z > 1) continue; // derrière la caméra
      const px = (proj.x * 0.5 + 0.5) * rect.width;
      const py = (-proj.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(px - cx, py - cy);
      if (d < bestPx) {
        bestPx = d;
        best = p;
      }
    }

    // Retenue au pixel près et non par le rayon, cette planète n'a pas de point
    // d'impact : on compare la distance de son centre, ce qui suffit à départager
    // un premier plan d'un arrière-plan.
    if (best) {
      const d = camera.position.distanceTo(best.mesh.getWorldPosition(proj));
      if (!surSoleil || d < surSoleil.distance) return { planete: best, soleil: null };
    }

    return { planete: null, soleil: surSoleil?.object ?? null };
  }

  // ── Glissement ──────────────────────────────────────────────────────────
  let saisie: PlanetEntry | null = null;

  /**
   * En capture, avant les contrôles de caméra qui écoutent le même événement :
   * les couper ici leur fait ignorer ce geste, qui déplace la planète au lieu
   * de faire tourner la vue.
   */
  function onPointerDown(e: PointerEvent) {
    if (!glisser || e.button !== 0) return;
    const { planete } = designer(e.clientX, e.clientY);
    if (!planete || !glisser.peut(planete)) return;
    saisie = planete;
    glisser.debut(planete);
    canvas.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (!saisie || !glisser) return;
    aim(e.clientX, e.clientY);
    glisser.deplacer(saisie, raycaster.ray);
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (!saisie) return;
    saisie = null;
    glisser?.fin();
    canvas.style.cursor = '';
  }

  function onMouseDown(e: MouseEvent) {
    downX = e.clientX;
    downY = e.clientY;
  }

  function onMouseUp(e: MouseEvent) {
    // Un léger glissement reste un clic ; faire tourner la caméra n'en est pas un
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_TOLERANCE_PX) return;
    const { planete, soleil } = designer(e.clientX, e.clientY);
    if (soleil) {
      onSoleil(soleil);
      return;
    }
    onClick(planete);
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

  canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  return {
    /** À appeler une fois par frame, après mise à jour de la caméra. */
    updateHover() {
      if (!hoverPending) return;
      hoverPending = false;

      // Même arbitrage qu'au clic, sans quoi le survol désignerait une chose
      // et le clic une autre : le nom de la planète s'afficherait sous le
      // curseur alors que cliquer partirait vers un autre launcher.
      if (saisie) return;
      const { planete, soleil } = designer(hoverX, hoverY);
      // Une main ouverte sur ce qu'on peut déplacer : sans elle, rien ne dit
      // qu'une planète se saisit.
      canvas.style.cursor =
        planete && glisser?.peut(planete) ? 'grab' : planete || soleil ? 'pointer' : '';
      setHover(planete);
    },

    dispose() {
      onPointerUp();
      canvas.removeEventListener('pointerdown', onPointerDown, { capture: true });
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}
