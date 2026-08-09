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
import type { FlySettings } from '../lib/flyKeys';
import { orbitPos, orbitRadius } from '../lib/orbits';
import { placePopup } from '../lib/popup';
import { makeNebulaTexture } from '../textures/nebula';
import { createBelt, createStarfield, createSun } from './decor';
import { createPlanets } from './planets';
import { LabelLayer } from './labels';
import { createPicker } from './picking';
import { createPostprocess } from './postprocess';
import {
  createPortals,
  portalRadius,
  portalRingRadius,
  PORTAL_SPREAD,
  type PortalTarget,
} from './portal';
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
 * Traversée du portail, en secondes.
 *
 * `WARP_DIVE_S` doit rester inférieur au temps que met le voile à devenir
 * opaque côté React : la caméra doit avoir fini sa plongée avant que la scène
 * ne soit détruite, sinon on voit le mouvement s'interrompre.
 *
 * `ARRIVAL_S` est la seconde moitié du voyage. Elle joue aussi au premier
 * affichage de la page, où elle sert de plan d'ouverture.
 */
const WARP_DIVE_S = 1;
const ARRIVAL_S = 1.6;
/** Éloignement du point d'entrée, en multiples du cadrage d'ensemble. */
const ARRIVAL_ZOOM = 1.75;

/**
 * Vitesse de déplacement au clavier, en rayons de cadrage par seconde, et
 * multiplicateur de la touche d'accélération.
 *
 * Rapportée au cadrage et non en unités absolues : une bibliothèque de deux
 * cents jeux s'étend sur des milliers d'unités, une de trois sur quelques
 * dizaines. Une vitesse fixe serait inutilisable dans l'un ou l'autre cas.
 */
const FLY_SPEED = 0.55;
const FLY_BOOST = 3;

/**
 * Distance du pivot de rotation pendant le vol, en fractions du cadrage.
 *
 * OrbitControls fait tourner la caméra **autour de sa cible**. En vol libre,
 * conserver la cible à la distance du système donne un rayon d'orbite énorme :
 * mesuré sur onze jeux, un glissement de 90° faisait parcourir 962 unités à la
 * caméra pour un système qui en fait 480 — elle était catapultée autour d'un
 * point vide devant elle.
 *
 * Rapprocher le pivot ramène la rotation à un tour de tête : même vitesse
 * angulaire, six fois moins de déplacement. L'image ne saute pas au moment où
 * on le rapproche, puisqu'il reste sur l'axe du regard.
 */
const FLY_PIVOT = 0.22;

/** Axe vertical du monde — le déplacement vertical l'utilise tel quel. */
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Vrai si la frappe est destinée à un champ de saisie.
 *
 * Sans ce garde-fou, taper « Dark Souls » dans la recherche ferait décoller la
 * caméra à chaque lettre.
 */
function saisieEnCours(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  );
}

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
 * Accélérante : vitesse nulle au départ, **maximale à l'arrivée**.
 *
 * Pour la plongée dans le portail. Une courbe qui s'arrête en douceur donnerait
 * l'impression de se garer devant, alors qu'on le traverse : c'est lancé à
 * pleine vitesse que le voile doit prendre le relais.
 */
function easeIn(t: number): number {
  return t * t * t;
}

/** Décélérante, symétrique de la précédente — pour la sortie du portail. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
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
  /** Systèmes voisins, un portail chacun, teinté de leur couleur. */
  destinations: PortalTarget[];
  /** Un portail vient d'être franchi : la traversée est pilotée par React. */
  onPortal: (platform: string) => void;
  /**
   * Touches de déplacement et sensibilité de la souris, lues à chaque frame.
   *
   * Passées par référence et non par valeur : les régler ne doit pas
   * reconstruire la scène, alors que toute dépendance de l'effet le ferait.
   */
  flySettingsRef: RefObject<FlySettings>;
  /**
   * Système d'où l'on débarque, ou `null` au premier affichage.
   *
   * La caméra émerge alors du portail qui y ramène, au lieu d'entrer par le
   * dehors — c'est la seconde moitié de la traversée.
   */
  arriveFrom: string | null;
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
  destinations,
  onPortal,
  flySettingsRef,
  arriveFrom,
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

    // Débordement lumineux et courbe de rendu filmique. Toute la scène passe
    // par cette chaîne : plus aucun appel direct à `renderer.render`.
    const post = createPostprocess(
      renderer, scene, camera, container.clientWidth, container.clientHeight,
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
    // Assez large pour englober la ceinture d'astéroïdes — et l'anneau de
    // portails quand il existe, sans quoi le cadrage d'ensemble les laisserait
    // hors champ, donc introuvables.
    const anneauPortails =
      destinations.length > 0 ? portalRingRadius(outerR, destinations.length) * PORTAL_SPREAD * 1.05 : 0;
    const systemR = Math.max(outerR * 1.55, anneauPortails) + sunR * 2;

    // ── Décor ────────────────────────────────────────────────────────────
    const nebulaTex = makeNebulaTexture(tint);
    scene.background = nebulaTex;

    // decay 0 : la luminosité ne dépend pas de la taille du système
    scene.add(new THREE.AmbientLight(0x2a3a60, 1.1));
    scene.add(new THREE.PointLight(0xfff2d8, 2.6, 0, 0));
    scene.add(createStarfield(outerR));

    // La couronne ne doit jamais mordre sur la première orbite.
    const sun = createSun(sunR, outerR * 0.42);
    scene.add(sun.group);

    const belt = createBelt(outerR, planetCount);
    if (belt) scene.add(belt);

    // Portails de phase — un par système voisin, absents s'il n'y a nulle
    // part où aller.
    const portalR = portalRadius(outerR);
    const portals = destinations.length > 0 ? createPortals(outerR, destinations) : null;
    if (portals) scene.add(portals.group);

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

    // Destination de chaque portail. Sans elle, une rangée de portails ne
    // serait qu'une rangée d'anneaux lumineux indiscernables — la teinte seule
    // ne suffit pas à nommer un launcher. Ces labels ne s'affichent qu'en vue
    // d'ensemble, comme celui de la plateforme courante.
    for (const e of portals?.entries ?? []) {
      labelLayer.addWorld(
        e.position.clone().setY(e.position.y - outerR * 0.16),
        e.platform,
        orbitLabelClass,
        PLATFORM_CSS[e.platform] ?? '#7a8a9a',
      );
    }

    // ── Caméra : cadre le système entier ─────────────────────────────────
    // ~48° d'élévation : plus bas, les orbites s'écrasent sur une ligne et la
    // répartition autour du soleil devient illisible.
    // Rayon cadré au repos — le système seul, **portails exclus**.
    //
    // Les y inclure doublait la distance de la caméra (mesuré : 2,03×) et
    // divisait donc par deux la taille apparente des planètes, qui sont le
    // sujet de la vue. Les portails restent atteignables en dézoomant, et le
    // plan d'ouverture les montre à chaque entrée dans le système : la caméra
    // part de `ARRIVAL_ZOOM` fois cette distance, ce qui les englobe
    // largement, puis se resserre sur le système.
    const frameR = outerR * 1.9 + sunR * 2;
    const homeCam = new THREE.Vector3(0, frameR * 1.05, frameR * 0.95);
    // Entrée en scène. Deux cas :
    //
    //  - on débarque d'un autre système : la caméra **émerge du portail qui y
    //    ramène**, en le traversant vers l'intérieur. C'est ce qui referme la
    //    traversée — on est entré par un anneau, on ressort par un autre ;
    //  - premier affichage : elle entre par le dehors, et le plan large montre
    //    au passage les portails disponibles.
    //
    // Positionnée ici, avant `animateCam`, qui prend le relais plus bas.
    const retour = arriveFrom
      ? (portals?.entries.find((e) => e.platform === arriveFrom) ?? null)
      : null;

    if (retour) {
      // Reculée dans l'axe du trajet à venir, et non dans l'axe radial : la
      // caméra rejoint ensuite le cadrage d'ensemble en ligne droite, donc
      // c'est cet axe-là qui doit passer par le centre de l'anneau. Le placer
      // radialement la faisait passer jusqu'à deux rayons à côté — elle
      // longeait le portail au lieu de le franchir.
      const versSysteme = new THREE.Vector3().subVectors(homeCam, retour.position).normalize();
      camera.position.copy(retour.position).addScaledVector(versSysteme, -portalR * 2.6);
    } else {
      camera.position.copy(homeCam).multiplyScalar(ARRIVAL_ZOOM);
    }
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
    let camEase: (t: number) => number = easeInOut;
    const camOffset = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const camLook = new THREE.Vector3();
    // Distance du cadrage d'ensemble, relevée sur la position initiale.
    const homeDist = homeCam.distanceTo(INIT_LOOK);

    // Planète actuellement sélectionnée — la carte de détail la suit chaque
    // frame, y compris quand la caméra continue de tourner après le clic.
    let selectedEntry: PlanetEntry | null = null;
    // Planète sous le curseur : seule son étiquette est affichée.
    let hoveredEntry: PlanetEntry | null = null;
    // Traversée engagée : verrouille le portail contre les doubles clics.
    let departing = false;
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
    function animateCam(
      pos: THREE.Vector3,
      look: THREE.Vector3,
      duree?: number,
      courbe: (t: number) => number = easeInOut,
    ) {
      camEase = courbe;
      camFromPos.copy(camera.position);
      camFromLook.copy(controls.target);
      camTargetPos.copy(pos);
      camTargetLook.copy(look);

      // Durée croissante avec la distance mais bornée : un saut entre deux
      // planètes voisines ne doit pas traîner, une traversée du système ne
      // doit pas se faire à toute allure.
      // Une durée imposée l'emporte : la traversée du portail doit tomber
      // juste avec le voile monté par React, quelle que soit la distance.
      const d = camFromPos.distanceTo(camTargetPos);
      camDur = duree ?? THREE.MathUtils.clamp(d / (systemR * CAM_REF), CAM_MIN_S, CAM_MAX_S);
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

    // Lancée ici et non au bloc caméra : `animateCam` s'appuie sur des
    // vecteurs déclarés entre-temps.
    // Décélérante : on jaillit du portail lancé, puis on se pose.
    animateCam(homeCam, INIT_LOOK, ARRIVAL_S, retour ? easeOut : easeInOut);

    // ── Sélection et survol ──────────────────────────────────────────────
    const picker = createPicker({
      canvas,
      camera,
      planets,
      pickMeshes,
      meshToEntry,
      portals: portals ? portals.entries.map((e) => e.hit) : [],
      onHover: (hit) => { hoveredEntry = hit; },
      onClick: (hit) => (hit ? selectPlanet(hit) : clearPlanet()),
      onPortal: (target) => {
        const entry = portals?.byHit.get(target);
        if (!entry || departing) return;
        departing = true;
        hoveredEntry = null;
        // On **traverse** l'anneau : la position visée est au-delà du portail
        // et le regard porte loin devant, dans le même axe. S'arrêter dessus
        // reviendrait à s'y garer, et viser son centre ferait converger caméra
        // et cible — le regard partirait alors n'importe où.
        camDir.subVectors(entry.position, camera.position).normalize();
        camOffset.copy(entry.position).addScaledVector(camDir, portalR * 0.9);
        camLook.copy(entry.position).addScaledVector(camDir, portalR * 14);
        animateCam(camOffset, camLook, WARP_DIVE_S, easeIn);
        onPortal(entry.platform);
      },
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
      post.setSize(w, h);
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
      labelLayer.update(camera, systemR, host?.clientWidth ?? w, host?.clientHeight ?? h, hoveredEntry);
      updatePopupAnchor(host?.clientWidth ?? w, host?.clientHeight ?? h);
      post.render();
    });
    ro.observe(container);

    // ── Déplacement au clavier ───────────────────────────────────────────
    // Les touches enfoncées sont mémorisées et relues à chaque frame, plutôt
    // que d'agir sur l'événement : la répétition automatique du clavier est
    // irrégulière et dépend des réglages du système, elle donnerait une
    // trajectoire saccadée.
    const enfoncees = new Set<string>();
    const flyDir = new THREE.Vector3();
    const flyRight = new THREE.Vector3();
    const flyMove = new THREE.Vector3();

    function onKeyDown(e: KeyboardEvent) {
      if (saisieEnCours(e)) return;
      enfoncees.add(e.code);
      // La barre d'espace actionnerait sinon l'élément ayant le focus.
      if (e.code === 'Space') e.preventDefault();
    }
    function onKeyUp(e: KeyboardEvent) {
      enfoncees.delete(e.code);
    }
    // Le relâchement passe inaperçu si la fenêtre perd le focus entre-temps :
    // sans cette remise à zéro, la caméra continuerait indéfiniment.
    function onBlur() {
      enfoncees.clear();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    /** Applique le déplacement de la frame. Renvoie vrai s'il y a eu mouvement. */
    function updateFly(dt: number): boolean {
      if (enfoncees.size === 0) return false;
      const k = flySettingsRef.current.keys;

      const avant = (enfoncees.has(k.avancer) ? 1 : 0) - (enfoncees.has(k.reculer) ? 1 : 0);
      const cote = (enfoncees.has(k.droite) ? 1 : 0) - (enfoncees.has(k.gauche) ? 1 : 0);
      const haut = (enfoncees.has(k.monter) ? 1 : 0) - (enfoncees.has(k.descendre) ? 1 : 0);
      if (avant === 0 && cote === 0 && haut === 0) return false;

      // L'utilisateur reprend la main sur un déplacement automatique en cours.
      stopCam();

      camera.getWorldDirection(flyDir);
      flyRight.crossVectors(flyDir, WORLD_UP).normalize();

      flyMove
        .set(0, 0, 0)
        .addScaledVector(flyDir, avant)
        .addScaledVector(flyRight, cote)
        .addScaledVector(WORLD_UP, haut)
        // Normalisé : sans cela, deux touches conjuguées iraient √2 fois plus
        // vite qu'une seule.
        .normalize()
        .multiplyScalar(
          frameR * FLY_SPEED * dt * (enfoncees.has(k.accelerer) ? FLY_BOOST : 1),
        );

      // Distance du pivot **avant** de bouger : on ne le repousse jamais, on
      // ne fait que le rapprocher. Sans cette borne, revenir vers le système
      // rallongerait à nouveau le bras de levier.
      const pivot = Math.max(
        Math.min(camera.position.distanceTo(controls.target), frameR * FLY_PIVOT),
        frameR * 0.02,
      );

      camera.position.add(flyMove);
      // La cible est replacée sur l'axe du regard, à la distance retenue : le
      // déplacement est donc une translation — l'orientation ne change pas —
      // et le pivot se rapproche au passage.
      controls.target.copy(camera.position).addScaledVector(flyDir, pivot);
      return true;
    }

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
      portals?.update(t, dt, camera);
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
        const e = camEase(k);

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

      // Sensibilité : réécrite seulement si elle a bougé. `rotateSpeed` est lu
      // par les contrôles à chaque geste, l'assigner à chaque frame ne coûterait
      // rien de visible mais brouillerait l'intention.
      const sens = flySettingsRef.current.sensibilite;
      if (sens !== controls.rotateSpeed) controls.rotateSpeed = sens;

      updateFly(dt);

      camera.updateMatrixWorld();

      picker.updateHover();
      labelLayer.update(camera, systemR, hostW, hostH, hoveredEntry);
      updatePopupAnchor(hostW, hostH);

      post.render();
    };
    rafId = requestAnimationFrame(tick);

    // ── Nettoyage ────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      popupRo.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      picker.dispose();
      portals?.dispose();
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
      post.dispose();
      renderer.dispose();

      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [
    games, platform, labelClass, orbitLabelClass,
    mountRef, labelsRef, onSelect, clearRef, focusRef, popupRef,
    sideProbeRef, fpsRef, destinations, onPortal, flySettingsRef, arriveFrom,
  ]);
}
