import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Game } from '../../../features/types';
import {
  INIT_LOOK,
  ORB_BASE,
  ORB_STEP,
  PLATFORM_COLOR,
  PLATFORM_CSS,
  PLN_R,
  PLN_R_MAX,
} from '../constants';
import { orbitPos, orbitRadius } from '../lib/orbits';
import { makeNebulaTexture } from '../textures/nebula';
import { createBelt, createStarfield, createSun } from './decor';
import { createPlanets } from './planets';
import { LabelLayer } from './labels';
import { createPicker } from './picking';
import type { PlanetEntry } from './types';

type Options = {
  mountRef: RefObject<HTMLDivElement | null>;
  labelsRef: RefObject<HTMLDivElement | null>;
  tooltipRef: RefObject<HTMLDivElement | null>;
  games: Game[];
  platform: string;
  labelClass: string;
  orbitLabelClass: string;
  onSelect: (game: Game | null) => void;
  /** Reçoit une fonction permettant de désélectionner depuis React. */
  clearRef: RefObject<() => void>;
};

/**
 * Construit et anime la scène Three.js du système solaire.
 *
 * Volontairement isolé du cycle de rendu React : la scène tourne à 60 fps et
 * aucun de ses événements (survol en particulier) ne doit déclencher de rendu.
 */
export function useSolarScene({
  mountRef,
  labelsRef,
  tooltipRef,
  games,
  platform,
  labelClass,
  orbitLabelClass,
  onSelect,
  clearRef,
}: Options) {
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Garde contre les chargements de texture arrivant après démontage
    let disposed = false;
    const isDisposed = () => disposed;

    // ── Renderer, caméra, contrôles ──────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x070b12);
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      20000,
    );

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = PLN_R * 2.5;
    controls.target.copy(INIT_LOOK);

    // ── Dimensions du système ────────────────────────────────────────────
    const tint = PLATFORM_COLOR[platform] ?? 0x7a8a9a;
    const planetCount = games.length;

    // Les orbites s'écartent assez pour que la plus grosse planète possible ne
    // touche jamais sa voisine.
    const orbStep = Math.max(ORB_STEP, PLN_R_MAX * 2.3);
    const outerR = planetCount > 0 ? orbitRadius(planetCount - 1, orbStep) : ORB_BASE;
    // Le plancher garantit que le soleil reste plus gros que toute planète.
    const sunR = THREE.MathUtils.clamp(outerR * 0.055, PLN_R_MAX * 1.3, 26);
    // Assez large pour englober la ceinture d'astéroïdes
    const systemR = outerR * 1.55 + sunR * 2;

    // ── Décor ────────────────────────────────────────────────────────────
    const nebulaTex = makeNebulaTexture(tint);
    scene.background = nebulaTex;

    // decay 0 : la luminosité ne dépend pas de la taille du système
    scene.add(new THREE.AmbientLight(0x2a3a60, 1.1));
    scene.add(new THREE.PointLight(0xfff2d8, 2.6, 0, 0));
    scene.add(createStarfield(outerR));

    const sun = createSun(sunR);
    scene.add(sun.group);

    const belt = createBelt(outerR, planetCount);
    if (belt) scene.add(belt);

    // ── Planètes et labels ───────────────────────────────────────────────
    const labelLayer = new LabelLayer(labelsRef.current);

    const { planets, pickMeshes, meshToEntry } = createPlanets({
      scene,
      games,
      orbStep,
      tint,
      isDisposed,
      onPlanet: (entry) => labelLayer.addPlanet(entry, entry.game.title, labelClass),
    });

    labelLayer.addWorld(
      new THREE.Vector3(0, outerR * 0.04, -outerR * 1.5),
      platform,
      orbitLabelClass,
      PLATFORM_CSS[platform] ?? '#7a8a9a',
    );

    // ── Caméra : cadre le système entier ─────────────────────────────────
    // ~48° d'élévation : plus bas, les orbites s'écrasent sur une ligne et la
    // répartition autour du soleil devient illisible.
    const homeCam = new THREE.Vector3(0, systemR * 1.05, systemR * 0.95);
    camera.position.copy(homeCam);
    camera.lookAt(INIT_LOOK);
    controls.maxDistance = Math.max(900, systemR * 3.5);

    let animating = false;
    const camTargetPos = new THREE.Vector3().copy(homeCam);
    const camTargetLook = new THREE.Vector3().copy(INIT_LOOK);
    // Seuil proportionnel : fixe, l'approche traînait sur les grands systèmes
    const camDoneEps = Math.max(0.4, systemR * 0.004);
    const camOffset = new THREE.Vector3();

    function animateCam(pos: THREE.Vector3, look: THREE.Vector3) {
      animating = true;
      controls.enabled = false;
      camTargetPos.copy(pos);
      camTargetLook.copy(look);
    }

    function selectPlanet(p: PlanetEntry) {
      for (const pl of planets) pl.paused = true;
      onSelect(p.game);
      camOffset.set(0, p.radius * 3.2, p.radius * 7).add(p.mesh.position);
      animateCam(camOffset, p.mesh.position);
    }

    function clearPlanet() {
      for (const pl of planets) pl.paused = false;
      onSelect(null);
      animateCam(homeCam, INIT_LOOK);
    }
    clearRef.current = clearPlanet;

    // ── Sélection et survol ──────────────────────────────────────────────
    const picker = createPicker({
      canvas,
      camera,
      planets,
      pickMeshes,
      meshToEntry,
      tooltipRef,
      onClick: (hit) => (hit ? selectPlanet(hit) : clearPlanet()),
    });

    // ── Redimensionnement ────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // ── Boucle d'animation ───────────────────────────────────────────────
    let prevT = performance.now();
    let rafId = 0;

    function tick(t: number) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min((t - prevT) / 1000, 0.1);
      prevT = t;

      // Tout se fige ensemble quand une planète est sélectionnée
      const paused = planets.length > 0 && planets[0].paused;

      for (const p of planets) {
        if (!p.paused) {
          p.angle += p.speed * dt;
          orbitPos(p.orbitRadius, p.angle, p.inc, p.node, p.mesh.position);
        }
        p.mesh.rotation.y += 0.05 * dt;
      }

      sun.core.scale.setScalar(1 + Math.sin(t * 0.0008) * 0.03);
      sun.core.rotation.y += 0.01 * dt;
      if (belt && !paused) belt.rotation.y += 0.0015 * dt;

      if (animating) {
        camera.position.lerp(camTargetPos, 0.06);
        controls.target.lerp(camTargetLook, 0.06);
        if (camera.position.distanceTo(camTargetPos) < camDoneEps) {
          animating = false;
          controls.enabled = true;
        }
      }

      // Doit précéder la projection des labels : le damping déplace la caméra
      // ici, et projeter avant utiliserait la matrice de la frame précédente,
      // ce qui faisait vibrer le texte pendant les déplacements.
      controls.update();
      camera.updateMatrixWorld();

      picker.updateHover();
      labelLayer.update(camera, systemR);

      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(tick);

    // ── Nettoyage ────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      picker.dispose();
      controls.dispose();
      labelLayer.dispose();

      // Libère géométries et textures : le ramasse-miettes JavaScript ne
      // récupère pas la mémoire GPU.
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const one of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          const std = one as THREE.MeshStandardMaterial;
          std.map?.dispose();
          if (std.emissiveMap && std.emissiveMap !== std.map) std.emissiveMap.dispose();
          one.dispose();
        }
      });
      nebulaTex.dispose();
      renderer.dispose();

      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [
    games, platform, labelClass, orbitLabelClass,
    mountRef, labelsRef, tooltipRef, onSelect, clearRef,
  ]);
}
