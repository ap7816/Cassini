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
import { placePopup } from '../lib/popup';
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
  /**
   * Reçoit une fonction permettant de cibler une planète par identifiant de
   * jeu — utilisée par la liste latérale, dont les clics doivent produire
   * exactement le même effet qu'un clic sur la planète elle-même.
   */
  focusRef: RefObject<(gameId: string) => void>;
  /**
   * Carte de détail flottante, repositionnée chaque frame au-dessus de la
   * planète sélectionnée — même principe que les labels, pour qu'elle suive
   * la planète quand la caméra continue de tourner après la sélection.
   */
  popupRef: RefObject<HTMLDivElement | null>;
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
  focusRef,
  popupRef,
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
    // Zoom volontairement lent : à la molette, le pas par défaut de
    // three.js traverse la moitié du système d'un cran, ce qui rend le
    // cadrage impossible à doser.
    controls.zoomSpeed = 0.35;
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

    // Point de vue d'avant la sélection, restauré à la désélection : revenir
    // systématiquement au cadrage d'origine annulait le déplacement que
    // l'utilisateur venait de faire.
    const savedPos = new THREE.Vector3();
    const savedLook = new THREE.Vector3();
    let hasSaved = false;

    // Planète actuellement sélectionnée — la carte de détail la suit chaque
    // frame, y compris quand la caméra continue de tourner après le clic.
    let selectedEntry: PlanetEntry | null = null;
    const popupProj = new THREE.Vector3();
    const popupEdge = new THREE.Vector3();

    // Géométrie de la carte, mise en cache. La relire à chaque frame
    // (`offsetWidth`) forcerait un recalcul de mise en page synchrone à 60 Hz,
    // soit exactement ce que le reste du calque de labels évite déjà.
    let popupW = 0;
    let popupH = 0;
    let popupShown = false;
    let lastArrowY = -1;
    let lastSide = '';

    const popupRo = new ResizeObserver(() => {
      const el = popupRef.current;
      if (!el || !popupShown) return;
      popupW = el.offsetWidth;
      popupH = el.offsetHeight;
    });
    if (popupRef.current) popupRo.observe(popupRef.current);

    function animateCam(pos: THREE.Vector3, look: THREE.Vector3) {
      animating = true;
      controls.enabled = false;
      camTargetPos.copy(pos);
      camTargetLook.copy(look);
    }

    function selectPlanet(p: PlanetEntry) {
      // Mémorisé au seul passage « libre → planète » : enchaîner deux planètes
      // ne doit pas écraser le point de vue libre d'origine.
      if (!hasSaved) {
        savedPos.copy(camera.position);
        savedLook.copy(controls.target);
        hasSaved = true;
      }

      for (const pl of planets) pl.paused = true;
      selectedEntry = p;
      onSelect(p.game);

      // On approche la planète en conservant la direction de vue courante.
      // Un décalage fixe en coordonnées monde obligeait la caméra à faire le
      // tour de la planète quand on l'avait pivotée au préalable.
      camOffset.subVectors(camera.position, controls.target);
      if (camOffset.lengthSq() < 1e-6) camOffset.set(0, 0.4, 1);
      camOffset.normalize();
      // Léger relèvement pour ne pas regarder la planète pile dans son plan
      camOffset.y = Math.max(camOffset.y, 0.35);
      camOffset.normalize().multiplyScalar(p.radius * 7).add(p.mesh.position);

      animateCam(camOffset, p.mesh.position);
    }

    function clearPlanet() {
      for (const pl of planets) pl.paused = false;
      selectedEntry = null;
      onSelect(null);

      if (hasSaved) {
        animateCam(savedPos, savedLook);
        hasSaved = false;
      } else {
        animateCam(homeCam, INIT_LOOK);
      }
    }
    clearRef.current = clearPlanet;

    // Sélection depuis la liste latérale : même trajet de caméra qu'un clic
    // direct sur la planète, pour que les deux gestes soient indiscernables.
    focusRef.current = (gameId: string) => {
      const target = planets.find((p) => p.game.id === gameId);
      if (target) selectPlanet(target);
    };

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

    function hidePopup(el: HTMLDivElement) {
      if (!popupShown) return;
      popupShown = false;
      el.style.display = 'none';
    }

    /**
     * Positionne la carte de détail à côté de la planète sélectionnée.
     *
     * Placement latéral et non au-dessus : la carte fait près de 300 px de
     * haut, soit plus de 40 % d'une fenêtre courante. Ni au-dessus ni en
     * dessous elle ne tient sans être recadrée contre un bord — et une carte
     * recadrée ne désigne plus la planète. En largeur, la zone 3D en offre
     * deux fois plus, et la caméra amène toujours la planète en son centre.
     *
     * L'écart à la planète est mesuré sur son bord apparent, obtenu en
     * projetant un point décalé de `radius * 1.9` — la même valeur que le
     * label de jeu (voir LabelLayer), pour que carte et label gardent le même
     * dégagement autour de la sphère.
     */
    function updatePopupAnchor() {
      const el = popupRef.current;
      const host = labelsRef.current;
      if (!el || !host) return;

      if (!selectedEntry) {
        hidePopup(el);
        return;
      }

      const c = selectedEntry.mesh.position;

      popupProj.copy(c).project(camera);
      // Derrière la caméra, ou planète repoussée hors cadre à la souris :
      // une carte collée au bord ne désignerait plus rien.
      if (popupProj.z > 1 || Math.abs(popupProj.x) > 1.5 || Math.abs(popupProj.y) > 1.5) {
        hidePopup(el);
        return;
      }

      if (!popupShown) {
        el.style.display = 'block';
        popupW = el.offsetWidth;
        popupH = el.offsetHeight;
        // React n'a pas encore monté la carte : on réessaiera à la frame
        // suivante plutôt que de la placer avec des dimensions nulles.
        if (popupW === 0 || popupH === 0) {
          el.style.display = 'none';
          return;
        }
        popupShown = true;
      }

      const w = host.clientWidth;
      const h = host.clientHeight;
      const cx = popupProj.x * (w / 2) + w / 2;
      const cy = -popupProj.y * (h / 2) + h / 2;

      // Demi-largeur apparente de la planète, en pixels. La première colonne
      // de `matrixWorld` est l'axe « droite » de la caméra : le décalage reste
      // donc perpendiculaire au regard quel que soit l'angle de vue.
      popupEdge.setFromMatrixColumn(camera.matrixWorld, 0)
        .multiplyScalar(selectedEntry.radius * 1.9)
        .add(c)
        .project(camera);
      const edge = Math.abs(popupEdge.x * (w / 2) + w / 2 - cx);

      const { x, y, arrowY, side } = placePopup(cx, cy, edge, popupW, popupH, w, h);

      el.style.transform = `translate(${x}px, ${y}px)`;

      // Écritures conditionnelles : réécrire une propriété personnalisée
      // invalide le style de la carte entière, ergot compris.
      if (arrowY !== lastArrowY) {
        el.style.setProperty('--arrow-y', `${arrowY}px`);
        lastArrowY = arrowY;
      }
      if (side !== lastSide) {
        el.dataset.side = side;
        lastSide = side;
      }
    }

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
        // `controls.update()` est volontairement écarté pendant l'animation.
        // Il recalcule la position de la caméra à partir de `controls.target`
        // et de son état sphérique interne : déplacer la cible en même temps
        // que la position ajoutait le décalage de cible au déplacement manuel,
        // d'où une caméra qui partait vers la planète puis se faisait ramener,
        // en tournant autour au passage.
        camera.position.lerp(camTargetPos, 0.08);
        controls.target.lerp(camTargetLook, 0.08);
        camera.lookAt(controls.target);

        if (camera.position.distanceTo(camTargetPos) < camDoneEps) {
          camera.position.copy(camTargetPos);
          controls.target.copy(camTargetLook);
          animating = false;
          controls.enabled = true;
          // Resynchronise l'état sphérique interne sur la position atteinte
          controls.update();
        }
      } else {
        // Doit précéder la projection des labels : le damping déplace la
        // caméra ici, et projeter avant utiliserait la matrice de la frame
        // précédente, ce qui faisait vibrer le texte pendant les déplacements.
        controls.update();
      }

      camera.updateMatrixWorld();

      picker.updateHover();
      labelLayer.update(camera, systemR);
      updatePopupAnchor();

      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(tick);

    // ── Nettoyage ────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      popupRo.disconnect();
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
    mountRef, labelsRef, tooltipRef, onSelect, clearRef, focusRef, popupRef,
  ]);
}
