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

/**
 * Durées extrêmes d'un déplacement de caméra, en secondes, et distance de
 * référence servant à répartir les trajets entre les deux.
 *
 * `CAM_REF` est exprimée en fractions du rayon du système : un trajet de
 * `systemR * CAM_REF` dure une seconde, les autres au prorata, dans les
 * bornes ci-dessus.
 */
const CAM_MIN_S = 1;
const CAM_MAX_S = 2.2;
const CAM_REF = 0.7;

/**
 * Cubique symétrique : vitesse nulle au départ **comme à l'arrivée**.
 *
 * C'est la propriété qui compte ici. Une courbe qui arrive avec de la vitesse
 * donne l'impression d'un arrêt net, et une interpolation exponentielle, qui
 * n'arrive jamais, oblige à trancher par un seuil — donc à sauter.
 */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2;
}

/**
 * Journalise la carte graphique effectivement utilisée par le contexte WebGL.
 *
 * `WEBGL_debug_renderer_info` n'est pas exposée par tous les moteurs ; son
 * absence n'est pas une erreur, seulement une information indisponible.
 */
function logRenderer(renderer: THREE.WebGLRenderer): void {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const nom = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    console.info('[système solaire] rendu par :', nom);
  } catch {
    /* information de diagnostic : son absence ne doit rien interrompre */
  }
}

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
  /**
   * Témoin portant la largeur animée de la colonne de droite. La scène le
   * mesure chaque frame pour décaler sa projection, et suit ainsi exactement
   * la transition CSS du repli.
   */
  sideProbeRef: RefObject<HTMLDivElement | null>;
  /** Réceptacle du compteur d'images, écrit directement dans le DOM. */
  fpsRef: RefObject<HTMLDivElement | null>;
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
  sideProbeRef,
  fpsRef,
}: Options) {
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Garde contre les chargements de texture arrivant après démontage
    let disposed = false;
    const isDisposed = () => disposed;

    // ── Renderer, caméra, contrôles ──────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      // Réclame la carte dédiée. Sur un portable à double GPU, le moteur de
      // rendu web retient par défaut le circuit intégré pour économiser la
      // batterie — soit, sur cette scène, un facteur plusieurs fois supérieur
      // sur le seul poste qui compte ici, le remplissage de pixels.
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x070b12);
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;

    // Trace le GPU réellement retenu : c'est la seule façon de savoir si la
    // préférence ci-dessus a été honorée.
    logRenderer(renderer);

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

    // Largeur actuellement masquée par la colonne de droite, en pixels.
    let viewSide = 0;

    /**
     * Recentre le système dans la portion de canvas laissée visible par la
     * colonne de droite, sans toucher à la surface de rendu.
     *
     * La caméra est cadrée comme si l'image faisait `w + side` pixels de large,
     * et l'on n'en affiche que les `w` de droite. Le centre optique tombe alors
     * à `(w + side) / 2 − side`, soit le milieu de la zone découverte.
     *
     * L'aspect vaut `(w + side) / h` et non `w / h` : c'est ce qui garde les
     * pixels carrés. La fenêtre affichée ne retient que `w / (w + side)` de
     * l'étendue horizontale, ce facteur doit être compensé en amont sous peine
     * d'étirer la scène pendant tout le repli.
     */
    const applyView = (side: number, w: number, h: number, force = false) => {
      if (w === 0 || h === 0) return;
      if (!force && side === viewSide) return;

      viewSide = side;
      camera.aspect = (w + side) / h;
      if (side > 0) camera.setViewOffset(w + side, h, side, 0, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };

    let animating = false;
    const camTargetPos = new THREE.Vector3().copy(homeCam);
    const camTargetLook = new THREE.Vector3().copy(INIT_LOOK);
    const camFromPos = new THREE.Vector3();
    const camFromLook = new THREE.Vector3();
    // Avancement du déplacement, en secondes, et durée visée
    let camT = 0;
    let camDur = 0;
    const camOffset = new THREE.Vector3();
    // Distance du cadrage d'ensemble, relevée sur la position initiale.
    const homeDist = homeCam.distanceTo(INIT_LOOK);

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
    let lastX = NaN;
    let lastY = NaN;

    const popupRo = new ResizeObserver(() => {
      const el = popupRef.current;
      if (!el || !popupShown) return;
      popupW = el.offsetWidth;
      popupH = el.offsetHeight;
    });
    if (popupRef.current) popupRo.observe(popupRef.current);

    /**
     * Lance un déplacement de caméra vers `pos`, regard sur `look`.
     *
     * Interpolation sur une durée, et non par rapprochement d'une fraction de
     * la distance restante à chaque frame. Cette dernière méthode n'atteint
     * jamais sa cible : il fallait couper sous un seuil, ce qui téléportait la
     * caméra sur la distance restante — le à-coup en fin de course. Elle
     * dépendait en plus de la fréquence d'affichage, et sa vitesse initiale
     * était proportionnelle à la distance, d'où un retour au cadrage général
     * qui partait en trombe.
     */
    function animateCam(pos: THREE.Vector3, look: THREE.Vector3) {
      camFromPos.copy(camera.position);
      camFromLook.copy(controls.target);
      camTargetPos.copy(pos);
      camTargetLook.copy(look);

      // Durée croissante avec la distance mais bornée : un saut entre deux
      // planètes voisines ne doit pas traîner, une traversée du système ne
      // doit pas se faire à toute allure.
      const d = camFromPos.distanceTo(camTargetPos);
      camDur = THREE.MathUtils.clamp(d / (systemR * CAM_REF), CAM_MIN_S, CAM_MAX_S);
      camT = 0;

      animating = true;
      controls.enabled = false;
    }

    /** Rend la main à l'utilisateur, caméra laissée là où elle se trouve. */
    function stopCam() {
      if (!animating) return;
      animating = false;
      controls.enabled = true;
      // Resynchronise l'état sphérique interne des contrôles sur la position
      // atteinte, sans quoi le prochain glissement repartirait de l'ancienne.
      controls.update();
    }

    function selectPlanet(p: PlanetEntry) {
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

    /**
     * Désélectionne : la carte se ferme, les orbites repartent et la caméra
     * recule jusqu'au cadrage d'ensemble.
     *
     * Deux garde-fous, chacun corrigeant un travers de la version précédente :
     *
     *  - Sans planète sélectionnée, la caméra ne bouge pas. Elle repartait
     *    auparavant au cadrage par défaut au moindre clic dans le vide, ce qui
     *    annulait le déplacement en cours alors qu'il n'y avait rien à quitter.
     *  - Le recul se fait dans l'axe de vue courant, et non vers une pose
     *    mémorisée avant la sélection : on dézoome sans rien défaire de
     *    l'orientation choisie entre-temps.
     */
    function clearPlanet() {
      const avaitSelection = selectedEntry !== null;

      for (const pl of planets) pl.paused = false;
      selectedEntry = null;
      onSelect(null);

      if (!avaitSelection) {
        // Rien à quitter : on interrompt seulement une approche en vol, qui
        // mènerait vers une planète désormais désélectionnée.
        stopCam();
        return;
      }

      camOffset.subVectors(camera.position, controls.target);
      if (camOffset.lengthSq() < 1e-6) camOffset.subVectors(homeCam, INIT_LOOK);
      camOffset.normalize().multiplyScalar(homeDist).add(INIT_LOOK);

      animateCam(camOffset, INIT_LOOK);
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
    function updatePopupAnchor(w: number, h: number) {
      const el = popupRef.current;
      if (!el) return;

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

      // Le calque couvre toute la page, y compris sous la colonne de droite :
      // la carte doit être recadrée sur la seule zone découverte.
      const { x, y, arrowY, side } = placePopup(
        cx, cy, edge, popupW, popupH, w - viewSide, h,
      );

      // Écritures conditionnelles, comme pour les labels : réécrire un style
      // inchangé 60 fois par seconde n'invalide rien de visible mais fait
      // travailler le moteur pour rien, et une propriété personnalisée
      // invalide en plus le style de toute la carte, ergot compris.
      if (x !== lastX || y !== lastY) {
        el.style.transform = `translate(${x}px, ${y}px)`;
        lastX = x;
        lastY = y;
      }
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
      renderer.setSize(w, h);
      applyView(viewSide, w, h, true);

      // Redessin immédiat, dans le même rendu de frame.
      //
      // `setSize` réalloue le tampon de dessin, qui repart vide. Or les
      // observateurs de redimensionnement sont livrés *après* le
      // `requestAnimationFrame` de la frame en cours : sans ce rendu, le
      // tampon vide serait affiché tel quel et la frame suivante seulement
      // le remplirait — un aplat noir d'une frame.
      //
      // Ne concerne plus que les vrais redimensionnements de fenêtre : le
      // repli de la liste ne change plus la taille de la canvas.
      const host = labelsRef.current;
      labelLayer.update(camera, systemR, host?.clientWidth ?? w, host?.clientHeight ?? h);
      updatePopupAnchor(host?.clientWidth ?? w, host?.clientHeight ?? h);
      renderer.render(scene, camera);
    });
    ro.observe(container);

    // ── Boucle d'animation ───────────────────────────────────────────────
    let prevT = performance.now();
    let rafId = 0;

    // Compteur d'images. Écrit directement dans le DOM, jamais par un état
    // React : re-rendre la page deux fois par seconde pour afficher un nombre
    // fausserait la mesure autant qu'elle coûterait.
    let fpsFrames = 0;
    let fpsSince = prevT;
    let fpsLast = -1;
    // Valeur d'attente : la première mesure n'arrive qu'au bout d'une
    // demi-seconde, et une pastille vide passe pour un défaut d'affichage.
    if (fpsRef.current) fpsRef.current.textContent = '— FPS · — ms';

    const tick = (t: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min((t - prevT) / 1000, 0.1);
      prevT = t;

      // ── Lectures de mise en page ───────────────────────────────────────
      // Toutes regroupées ici, avant la moindre écriture de style. Le
      // navigateur ne recalcule alors la mise en page qu'une fois : intercalée
      // entre deux écritures, chaque lecture en forcerait un recalcul complet
      // et synchrone. La boucle écrit les curseurs, l'infobulle, les labels et
      // la carte — de quoi provoquer trois recalculs par frame.
      const host = labelsRef.current;
      const hostW = host ? host.clientWidth : 0;
      const hostH = host ? host.clientHeight : 0;
      const probeW = sideProbeRef.current?.offsetWidth ?? 0;
      const viewW = container.clientWidth;
      const viewH = container.clientHeight;

      // ── Compteur d'images ──────────────────────────────────────────────
      // Moyenné sur une demi-seconde : l'écart entre deux frames varie trop
      // d'une à l'autre pour être lisible tel quel.
      fpsFrames++;
      if (t - fpsSince >= 500) {
        const ecoule = t - fpsSince;
        const fps = Math.round((fpsFrames * 1000) / ecoule);
        const el = fpsRef.current;
        if (el && fps !== fpsLast) {
          // Le temps par image dit ce qu'il manque, là où le nombre d'images
          // seul ne le dit pas : passer de 80 à 165 ne demande pas « deux fois
          // plus », mais 6 ms de travail au lieu de 12.
          el.textContent = `${fps} FPS · ${(ecoule / fpsFrames).toFixed(1)} ms`;
          fpsLast = fps;
        }
        fpsFrames = 0;
        fpsSince = t;
      }

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
        camT += dt;
        const k = camDur > 0 ? Math.min(camT / camDur, 1) : 1;
        const e = easeInOut(k);

        camera.position.lerpVectors(camFromPos, camTargetPos, e);
        controls.target.lerpVectors(camFromLook, camTargetLook, e);
        camera.lookAt(controls.target);

        // `easeInOut(1)` vaut exactement 1 : la caméra est déjà sur sa cible,
        // il n'y a rien à recaler et donc plus d'à-coup final.
        if (k >= 1) stopCam();
      } else {
        // Doit précéder la projection des labels : le damping déplace la
        // caméra ici, et projeter avant utiliserait la matrice de la frame
        // précédente, ce qui faisait vibrer le texte pendant les déplacements.
        controls.update();
      }

      // Suit le repli de la liste : le témoin porte la transition CSS, la
      // scène n'a donc rien à interpoler.
      applyView(probeW, viewW, viewH);

      camera.updateMatrixWorld();

      picker.updateHover();
      labelLayer.update(camera, systemR, hostW, hostH);
      updatePopupAnchor(hostW, hostH);

      renderer.render(scene, camera);
    };
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
    sideProbeRef, fpsRef,
  ]);
}
