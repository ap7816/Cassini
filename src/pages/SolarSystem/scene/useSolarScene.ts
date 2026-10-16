import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Game } from '../../../features/types';
import { INIT_LOOK, PLN_R } from '../constants';
import type { FlySettings } from '../lib/flyKeys';
import { composerTrajet } from '../lib/flightPath';
import {
  composerFiche,
  demiLargeurApparente,
  distanceApproche,
  pixelsEnMonde,
  poserCamera,
} from '../lib/framing';
import { densiteBrume } from '../lib/haze';
import { normaleOrbite, orbitPos, positionSurOrbite } from '../lib/orbits';
import { MARGIN as POPUP_MARGIN, placePopup } from '../lib/popup';
import { createFondCiel } from './cielFond';
import { NUAGE_TAILLE, createStarfield, createSunBeacons, teindreSoleil } from './decor';
import { createCiel } from './ciel';
import { createChantComete } from '../../../features/ambient/chantComete';
import { enregistrerCiel } from '../../../features/debug/evenementsCiel';
import { lumiereDe } from '../lib/couleurSoleil';
import { changerNuage, createGalaxy, type EntreeGalaxie, type SystemeGalaxie } from './galaxy';
import { angleEnDegres, appliquerPlacements } from './placements';
import type { EditionScene, EtatEdition, Glissement } from './edition';
import { BORNES, estSystemePerso, type ReglageSysteme } from '../lib/customSystems';
import { distanceMini, ETENDUE_MAX } from '../lib/etendue';
import { LabelLayer } from './labels';
import { createPicker } from './picking';
import { createPostprocess } from './postprocess';
import { doitSauterImage } from './cadence';
import { abonnerReglages, lireReglages } from '../../../features/debug/tuning';
import type { PlanetEntry } from './types';
import i18n from '../../../i18n';
import { nomPlateforme } from '../../../i18n/plateformes';

/**
 * Durées extrêmes d'un déplacement de caméra, en secondes, et distance de
 * référence servant à répartir les trajets entre les deux.
 *
 * `CAM_REF` est exprimée en fractions du cadrage du système courant : un trajet
 * de `frameR * CAM_REF` dure une seconde, les autres au prorata, dans les
 * bornes ci-dessus.
 */
const CAM_MIN_S = 1;
const CAM_MAX_S = 2.2;
const CAM_REF = 0.7;

/**
 * Plan d'ouverture, en secondes : la caméra part de loin et se resserre sur le
 * système courant, ce qui montre au passage ses voisins dans la galaxie.
 */
const ARRIVAL_S = 0.8;
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
 * Le moteur de rendu, gardé d'un montage à l'autre.
 *
 * Monter la scène coûtait 353 ms, dont 200 pour le seul contexte WebGL — le
 * temps que le pilote réveille la carte dédiée. Ce prix était payé à chaque
 * fois que la page du système solaire se montait : au lancement, et à chaque
 * retour depuis la bibliothèque, les launchers ou la musique.
 *
 * Le contexte est donc conservé pour la session. Sa toile est décrochée du
 * document quand la page s'en va, et raccrochée au retour ; tout ce qui
 * appartient à la scène — géométries, matériaux, textures, cibles de rendu du
 * compositeur — est libéré au démontage comme avant. Mesuré : le montage
 * suivant tombe à 95 ms, dont zéro pour le moteur.
 *
 * S'y ajoute ce que le moteur garde en propre : les programmes compilés pour
 * le GPU. La première image d'une session en demande une demi-seconde ; les
 * montages suivants les retrouvent tels quels.
 *
 * Une seule scène à la fois : la page du système solaire est une page, jamais
 * deux ouvertes ensemble.
 */
let moteurPartage: THREE.WebGLRenderer | null = null;

/**
 * La densité de pixels à demander pour une échelle de rendu.
 *
 * L'échelle est une part de la résolution **native** : à 100 % la scène est
 * dessinée exactement à la définition de l'écran, en dessous elle est dessinée
 * plus petit puis étirée, au-dessus plus grand puis réduite — du
 * suréchantillonnage, qui lisse les bords au prix fort. Comme la mise à
 * l'échelle vaut pour les deux côtés, 50 % ne coûte pas la moitié des pixels
 * mais le quart.
 *
 * Le plafond à trois est une sécurité, pas un réglage : sur un écran à deux
 * pixels par point, 200 % demanderait seize fois les pixels de la définition
 * de base, et la carte y passerait la nuit.
 */
function densiteDePixels(echelle: number): number {
  return Math.min(3, window.devicePixelRatio * echelle);
}

function moteurDeRendu(): THREE.WebGLRenderer {
  if (moteurPartage) return moteurPartage;

  moteurPartage = new THREE.WebGLRenderer({
    // Pas de multi-échantillonnage sur le tampon de la canvas.
    //
    // Il ne servait à rien : toute la scène passe par le compositeur, dont les
    // cibles de rendu n'ont pas d'échantillons multiples. Ce qu'on voit sort de
    // ces cibles-là. Le tampon de la canvas, lui, ne reçoit que le quadrilatère
    // plein écran de la dernière passe — qui n'a aucune arête intérieure à
    // adoucir. On payait donc un tampon multi-échantillonné, et sa résolution à
    // chaque image, pour exactement zéro pixel lissé.

    // Réclame la carte dédiée. Sur un portable à double GPU, le moteur de rendu
    // web retient par défaut le circuit intégré pour économiser la batterie —
    // soit, sur cette scène, un facteur plusieurs fois supérieur sur le seul
    // poste qui compte ici, le remplissage de pixels.
    powerPreference: 'high-performance',
  });

  // Trace le GPU réellement retenu : c'est la seule façon de savoir si la
  // préférence ci-dessus a été honorée.
  logRenderer(moteurPartage);
  return moteurPartage;
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
  /**
   * Les jeux de chaque launcher. Tous les systèmes coexistent désormais dans
   * un seul espace : la scène les construit tous, mais ne peuple que ceux dont
   * la caméra s'approche.
   */
  /**
   * Les systèmes à construire, lus au montage de la scène.
   *
   * Par référence, avec `cleScene` pour dire quand reconstruire : ajouter un
   * jeu à un système personnalisé ou déplacer une planète ne doit rebâtir que
   * ce système, pas relancer toute la galaxie et sa caméra.
   */
  parPlateformeRef: RefObject<Array<EntreeGalaxie & { reglage?: ReglageSysteme }>>;
  cleScene: string;
  /** Pilotage des systèmes personnalisés par l'éditeur. */
  editionRef: RefObject<EditionScene>;
  /**
   * Launcher devant lequel la caméra se pose au montage.
   *
   * Une référence et non une valeur, et c'est essentiel : voler vers un autre
   * système remonte le changement à React, qui le range dans son état. Passé en
   * valeur, ce changement entrait dans les dépendances de l'effet et
   * **reconstruisait la scène entière** — le vol partait, puis tout était
   * rebâti autour de la destination. On ne voyait qu'une coupure.
   *
   * Lu au seul montage : ensuite, c'est la scène qui décide où l'on est et le
   * fait savoir par `onSysteme`.
   */
  platformRef: RefObject<string>;
  /**
   * Réglage « ciel vivant » : aurores, tempêtes et passages.
   *
   * Une référence, lue à chaque image : le couper ou le rallumer ne doit
   * pas reconstruire la scène, seulement cesser de dessiner le ciel.
   */
  cielRef: RefObject<boolean>;
  evenementsRef: RefObject<boolean>;
  /**
   * Réglages de graphisme, lus à chaque image.
   *
   * Par référence, comme le ciel vivant : les changer ne doit pas reconstruire
   * la scène, seulement changer ce qu'elle dessine.
   */
  graphismeRef: RefObject<{
    echelleRendu: number;
    limiteIPS: number;
    debordement: boolean;
    densiteCiel: number;
  }>;
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
  /**
   * Même chose pour le panneau de navigation, à gauche.
   *
   * Il vit hors de la page — c'est la coque de l'application qui le porte —
   * mais la canvas couvre désormais la fenêtre entière, y compris dessous : la
   * scène doit donc décaler sa projection de sa largeur, exactement comme elle
   * le fait pour la liste.
   */
  navProbeRef: RefObject<HTMLDivElement | null>;
  /** Réceptacle du compteur d'images, écrit directement dans le DOM. */
  fpsRef: RefObject<HTMLDivElement | null>;
  /**
   * Un calque recouvre entièrement la scène : elle cesse de dessiner.
   *
   * Lu à chaque image plutôt que porté par une dépendance : basculer une
   * dépendance démonterait la scène et la reconstruirait, ce qu'on cherche
   * précisément à éviter en posant ces calques par-dessus.
   */
  pauseRef: RefObject<boolean>;
  /**
   * Reçoit une fonction menant la caméra jusqu'à un launcher.
   *
   * C'est ce qui remplace la traversée de portail : plus de scène détruite ni
   * de voile, seulement un déplacement dans un espace qui contient déjà tout.
   */
  flyToRef: RefObject<(platform: string) => void>;
  /** Le système sous les yeux a changé, la liste doit suivre. */
  onSysteme: (platform: string) => void;
  /**
   * Touches de déplacement et sensibilité de la souris, lues à chaque frame.
   *
   * Passées par référence et non par valeur : les régler ne doit pas
   * reconstruire la scène, alors que toute dépendance de l'effet le ferait.
   */
  flySettingsRef: RefObject<FlySettings>;
  /**
   * Version des réglages qui fixent un nombre d'objets — étoiles, astéroïdes.
   *
   * Passée par valeur, et c'est voulu : la changer doit reconstruire la scène,
   * puisque ces objets ne se redimensionnent pas en place. Elle ne change
   * qu'en développement, sous le panneau de débogage.
   */
  structure: number;
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
  platformRef,
  cielRef,
  evenementsRef,
  graphismeRef,
  labelClass,
  orbitLabelClass,
  onSelect,
  clearRef,
  focusRef,
  popupRef,
  sideProbeRef,
  navProbeRef,
  fpsRef,
  pauseRef,
  flyToRef,
  onSysteme,
  flySettingsRef,
  structure,
  parPlateformeRef,
  cleScene,
  editionRef,
}: Options) {
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Garde contre les chargements de texture arrivant après démontage
    let disposed = false;
    const isDisposed = () => disposed;

    // ── Renderer, caméra, contrôles ──────────────────────────────────────
    const renderer = moteurDeRendu();
    renderer.setPixelRatio(densiteDePixels(graphismeRef.current.echelleRendu));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x070b12);
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;


    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      lireReglages().camChamp,
      container.clientWidth / container.clientHeight,
      0.1,
      20000,
    );

    // Débordement lumineux et courbe de rendu filmique. Toute la scène passe
    // par cette chaîne : plus aucun appel direct à `renderer.render`.
    const post = createPostprocess(
      renderer, scene, camera, container.clientWidth, container.clientHeight,
    );

    // ── Mouvement réduit ─────────────────────────────────────────────────
    // Une préférence système, pas un réglage de plus : qui la demande souffre
    // parfois du mouvement. La règle CSS d'App.css ne peut rien ici — orbites,
    // rotations et voyages de caméra sont calculés image par image.
    const prefMouvement = window.matchMedia('(prefers-reduced-motion: reduce)');
    let mouvementReduit = prefMouvement.matches;
    const surPreference = (e: MediaQueryListEvent) => { mouvementReduit = e.matches; };
    prefMouvement.addEventListener('change', surPreference);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = lireReglages().camAmorti;
    controls.minDistance = PLN_R * 2.5;
    // Zoom volontairement lent : à la molette, le pas par défaut de
    // three.js traverse la moitié du système d'un cran, ce qui rend le
    // cadrage impossible à doser.
    controls.zoomSpeed = lireReglages().camZoom;
    controls.target.copy(INIT_LOOK);

    // ── Galaxie ──────────────────────────────────────────────────────────
    const labelLayer = new LabelLayer(labelsRef.current);

    // Tableaux de sélection vivants : la galaxie les remplit et les vide au fil
    // des systèmes qu'elle construit et libère, le pointeur les relit à chaque
    // frame. Les remplacer lui laisserait des références périmées.
    const planets: PlanetEntry[] = [];
    const pickMeshes: THREE.Object3D[] = [];
    const meshToEntry = new Map<THREE.Object3D, PlanetEntry>();

    const galaxie = createGalaxy({
      scene,
      parPlateforme: parPlateformeRef.current,
      // Relu à chaque construction de planètes : un système modifié depuis le
      // montage de la scène doit être rebâti avec ses nouveaux placements.
      reglageDe: (cle) => parPlateformeRef.current.find((e) => e.platform === cle)?.reglage ?? null,
      isDisposed,
      planets,
      pickMeshes,
      meshToEntry,
      onPlanet: (entry) => labelLayer.addPlanet(entry, entry.game.title, labelClass),
      onSystemeLibere: (s) => {
        // Au démontage, tout est libéré d'un bloc : inutile de démêler des
        // structures qui disparaissent, et surtout pas de prévenir React d'un
        // changement dans un composant qu'il est en train de retirer.
        if (isDisposed()) return;

        labelLayer.removePlanets(s.planets);
        // Filet : la planète sélectionnée ou survolée peut appartenir au
        // système qu'on libère — on s'en éloigne à la main, sans passer par un
        // voyage. Ses maillages sont détruits juste après ; les garder en
        // référence laisserait la fiche ancrée à un fantôme, figé à la dernière
        // position connue.
        if (selectedEntry && s.planets.includes(selectedEntry)) oublierSelection();
        else if (hoveredEntry && s.planets.includes(hoveredEntry)) hoveredEntry = null;
      },
    });

    // Le système sous les yeux au montage. La liste latérale affiche le sien,
    // la caméra doit donc s'y trouver.
    const courant = galaxie.get(platformRef.current) ?? galaxie.systemes[0] ?? null;

    /** Distance de repos devant un système, et point de vue correspondant. */
    const cadrageDe = (s: SystemeGalaxie) => {
      // Resserré depuis 1,9 : le système occupait un peu plus du tiers de la
      // hauteur utile, le reste étant du vide étoilé.
      const frameR = s.taille.outerR * 1.42 + s.taille.sunR * 1.6;
      return {
        frameR,
        // ~48° d'élévation : plus bas, les orbites s'écrasent sur une ligne et
        // la répartition autour du soleil devient illisible.
        position: new THREE.Vector3(0, frameR * 1.05, frameR * 0.95).add(s.centre),
      };
    };

    const cadrage = courant ? cadrageDe(courant) : { frameR: 400, position: new THREE.Vector3(0, 420, 380) };
    const frameR = cadrage.frameR;
    const homeCam = cadrage.position;
    const homeLook = courant ? courant.centre.clone() : new THREE.Vector3();

    // ── Décor, commun à toute la galaxie ─────────────────────────────────
    const tint = courant?.couleur ?? 0x7a8a9a;

    // Le ciel de fond, calculé par pixel plutôt que peint dans une image : il
    // reste net quel que soit le zoom (voir `cielFond.ts`).
    const fond = createFondCiel(new THREE.Color(tint));
    scene.add(fond.objet);

    const ambiante = new THREE.AmbientLight(0x2a3a60, lireReglages().lumiereAmbiante);
    scene.add(ambiante);

    // Une seule lumière ponctuelle, déplacée sur le soleil le plus proche.
    //
    // Une par système serait plus juste, mais chaque lumière entre dans le
    // shader de *tous* les matériaux : sept d'entre elles renchérissent le
    // rendu même quand six systèmes sont libérés. Or on ne voit les planètes
    // que d'un système à la fois — celui qu'on éclaire.
    const lumiere = new THREE.PointLight(0xfff2d8, lireReglages().lumiereIntensite, 0, 0);
    if (courant) {
      lumiere.position.copy(courant.centre);
      lumiere.color.copy(courant.lumiere);
    }
    scene.add(lumiere);

    // Le champ d'étoiles enveloppe la galaxie entière, pas un système.
    scene.add(createStarfield(galaxie.rayon));

    // Ce qui vit dans le ciel : rideau de gaz ionisé, tempêtes, et les rares
    // passages. Réglable, et sans effet sur le reste de la scène quand il est
    // coupé (voir `ciel.ts`).
    const ciel = createCiel(galaxie.rayon, new THREE.Color(tint));
    scene.add(ciel.objet);

    // Le chant de la comète bleue : quelques notes que le navigateur synthétise
    // quand on pose le curseur sur elle. Rien n'est créé tant que personne ne
    // l'a survolée — un contexte audio ouvert pour rien reste un contexte
    // audio ouvert.
    const chant = createChantComete();
    /** Position du pointeur, en pixels de la fenêtre. */
    let pointeurX = -1;
    let pointeurY = -1;
    const surPointeur = (e: PointerEvent) => { pointeurX = e.clientX; pointeurY = e.clientY; };
    const surSortie = () => { pointeurX = -1; pointeurY = -1; };
    canvas.addEventListener('pointermove', surPointeur);
    canvas.addEventListener('pointerleave', surSortie);
    /** Pour projeter un point du monde sur l'écran. */
    const projection = new THREE.Vector3();

    // Le panneau de débogage peut provoquer ces événements sans attendre leur
    // heure. En production, personne ne s'adresse à ce registre.
    const retirerCiel = enregistrerCiel((evenement) => {
      const endroit = ciel.declencher(evenement);
      if (!endroit) return;

      // On tourne la tête, on ne se déplace pas : la caméra reste où elle est,
      // seule sa cible part sur l'événement. Sans quoi un simple bouton
      // d'essai expédierait l'observateur à l'autre bout de la galaxie.
      //
      // La cible est posée à la distance où elle était : l'orbite garde son
      // rayon, et la molette continue de se comporter comme avant.
      const rayon = Math.max(1, camera.position.distanceTo(controls.target));
      const vise = endroit.clone().sub(camera.position).normalize()
        .multiplyScalar(rayon)
        .add(camera.position);
      animateCam(camera.position.clone(), vise, 0.7);
    });

    // Brume, qui noie les planètes à mesure qu'on quitte un système.
    //
    // C'est elle qui masque leur construction et leur libération : sans elle,
    // vingt planètes surgissent d'un coup à quatre rayons et s'évanouissent à
    // six. Sa densité est réglée chaque frame sur le système regardé — un
    // réglage fixe noierait un système d'un jeu et n'atteindrait jamais une
    // bibliothèque de cent cinquante, leurs rayons variant d'un facteur cent.
    //
    // Teinte sombre et non grise : les planètes doivent fondre dans le noir du
    // ciel, pas s'échouer sur un voile laiteux.
    const brume = new THREE.FogExp2(0x070b12, 0);
    scene.fog = brume;

    // Balises solaires — hors de la brume, elles brillent à toute distance.
    const balises = createSunBeacons(
      galaxie.systemes.map((s) => ({
        centre: s.centre,
        couleur: new THREE.Color(s.couleur),
      })),
    );
    scene.add(balises.points);

    // ── Réglages à chaud ─────────────────────────────────────────────────
    // En production ils ne changent jamais : appliqués une fois ici, ils valent
    // leurs défauts. En développement, le panneau de débogage les modifie, et
    // chaque modification repasse par cette fonction.
    //
    // Les objets concernés sont repérés par `userData.reglage`, posé à leur
    // création. Un parcours de la scène par modification et non par frame :
    // quelques milliers d'objets, parcourus seulement quand un curseur bouge.
    // Les systèmes construits plus tard lisent eux-mêmes les réglages : ils
    // naissent déjà à jour.
    const appliquerReglages = () => {
      const r = lireReglages();
      post.regler();
      lumiere.intensity = r.lumiereIntensite;
      ambiante.intensity = r.lumiereAmbiante;
      controls.zoomSpeed = r.camZoom;
      controls.dampingFactor = r.camAmorti;
      // Le décalage de projection posé par `applyView` survit : il est gardé
      // par la caméra et réappliqué par `updateProjectionMatrix`.
      if (camera.fov !== r.camChamp) {
        camera.fov = r.camChamp;
        camera.updateProjectionMatrix();
      }
      scene.traverse((o) => {
        const role = o.userData.reglage as string | undefined;
        if (!role) return;
        if (role === 'etoiles' && o instanceof THREE.Points) {
          const m = o.material as THREE.PointsMaterial;
          m.size = r.etoilesTaille;
          m.opacity = r.etoilesOpacite;
        } else if (role === 'nuage' && o instanceof THREE.Points) {
          const m = o.material as THREE.PointsMaterial;
          m.size = r.etoilesTaille * NUAGE_TAILLE;
          m.opacity = r.etoilesOpacite;
        } else if (role === 'lueur' && o instanceof THREE.Points) {
          (o.material as THREE.PointsMaterial).size = r.lueurTaille;
        } else if (role === 'orbite' && o instanceof THREE.Mesh) {
          (o.material as THREE.MeshBasicMaterial).opacity = r.orbitesOpacite;
        } else if (role === 'soleil' && o instanceof THREE.Mesh) {
          // Un système qui a choisi sa couleur la garde : le réglage général
          // vaut pour les soleils qui n'en ont pas.
          if (o.userData.couleurPropre) return;
          (o.material as THREE.MeshBasicMaterial).color.set(r.soleilCouleur);
        } else if (role === 'planete' && o instanceof THREE.Mesh) {
          (o.material as THREE.MeshStandardMaterial).emissiveIntensity = r.planeteEmissif;
        } else if (role === 'atmosphere' && o instanceof THREE.Mesh) {
          (o.material as THREE.MeshBasicMaterial).opacity = r.atmosphereOpacite;
        } else if (role === 'anneau' && o instanceof THREE.Mesh) {
          (o.material as THREE.MeshBasicMaterial).opacity =
            (o.userData.opaciteBase as number) * r.anneauxOpacite;
        } else if (role === 'couronne' && o instanceof THREE.Mesh) {
          (o.material as THREE.MeshBasicMaterial).opacity =
            (o.userData.opaciteBase as number) * r.couronneIntensite;
        } else if (role === 'balise' && o instanceof THREE.Points) {
          (o.material as THREE.PointsMaterial).size = r.baliseTaille;
        }
      });
    };
    appliquerReglages();
    const desabonnerReglages = abonnerReglages(appliquerReglages);

    // Nom de chaque launcher, au-dessus de son soleil : c'est ce qui permet de
    // savoir ce qu'on regarde de loin, une fois les planètes libérées.
    //
    // Celui d'un launcher se traduit — `Other` et `BattleNet` sont des
    // identifiants, pas des noms. Celui d'un système personnalisé est le nom
    // que l'utilisateur lui a donné, qu'on ne touche pas.
    const nomAffiche = (s: SystemeGalaxie) =>
      estSystemePerso(s.platform) ? s.nom : nomPlateforme(s.platform, i18n.t.bind(i18n));
    for (const s of galaxie.systemes) {
      // Au-dessus du soleil, et non derrière le système.
      //
      // Le décalage doit dégager la couronne, qui s'étend à 3,4 rayons
      // solaires : plus bas, le nom se lisait *sur* l'astre et s'y noyait. Le
      // second terme prend le relais sur une grande bibliothèque, où le
      // système est vu de bien plus loin — un décalage fixe s'y réduirait à
      // quelques pixels.
      const hauteurNom = Math.max(s.taille.sunR * 4, s.taille.systemR * 0.05);
      labelLayer.addWorld(
        s.centre.clone().add(new THREE.Vector3(0, hauteurNom, 0)),
        nomAffiche(s),
        orbitLabelClass,
        `#${s.couleur.toString(16).padStart(6, '0')}`,
        s.taille.systemR * 0.55,
        s.platform,
      );
    }
    // La langue peut changer pendant que la scène est montée : on renomme sur
    // place plutôt que de rebâtir la galaxie.
    const renommerSystemes = () => {
      for (const s of galaxie.systemes) labelLayer.renommer(s.platform, nomAffiche(s));
    };
    i18n.on('languageChanged', renommerSystemes);

    // ── Caméra ───────────────────────────────────────────────────────────
    // Entrée en scène : on arrive de loin et l'on se resserre sur le système
    // courant, ce qui montre au passage ses voisins dans la galaxie.
    camera.position.copy(homeLook).addScaledVector(
      new THREE.Vector3().subVectors(homeCam, homeLook),
      ARRIVAL_ZOOM,
    );
    camera.lookAt(homeLook);
    controls.target.copy(homeLook);
    // Assez loin pour embrasser toute la galaxie : c'est la vue d'ensemble qui
    // remplace les portails.
    controls.maxDistance = Math.max(900, galaxie.rayon * 2.5);

    // Système que la caméra regarde. Il change quand on vole vers un autre
    // soleil, et sert de repère à tout ce qui se mesurait auparavant depuis
    // l'origine : durée des trajets, retour au cadrage, portée des labels.
    let vise: SystemeGalaxie | null = courant;
    let viseCentre = homeLook.clone();
    let viseCadre = frameR;
    let viseHome = homeCam.clone();

    // Largeurs masquées de part et d'autre, en pixels : le panneau de
    // navigation à gauche, la liste des jeux à droite.
    let viewLeft = 0;
    let viewRight = 0;

    /**
     * Recentre le système dans la portion de canvas laissée visible par les
     * deux colonnes, sans toucher à la surface de rendu.
     *
     * La caméra est cadrée comme si l'image faisait `w + left + right` pixels
     * de large, et l'on n'en affiche qu'une fenêtre de `w` commençant à
     * `right`. Le centre optique tombe alors à `(w + left + right) / 2 − right`,
     * soit `(left + w − right) / 2` : exactement le milieu de la bande
     * découverte, qui va de `left` à `w − right`.
     *
     * L'aspect vaut `(w + left + right) / h` et non `w / h` : c'est ce qui garde
     * les pixels carrés. La fenêtre affichée ne retient qu'une fraction de
     * l'étendue horizontale, ce facteur doit être compensé en amont sous peine
     * d'étirer la scène pendant tout le repli.
     */
    const applyView = (
      left: number,
      right: number,
      w: number,
      h: number,
      force = false,
    ) => {
      if (w === 0 || h === 0) return;
      if (!force && left === viewLeft && right === viewRight) return;

      viewLeft = left;
      viewRight = right;
      const pleine = w + left + right;
      camera.aspect = pleine / h;
      if (left > 0 || right > 0) camera.setViewOffset(pleine, h, right, 0, w, h);
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
    const camArc = new THREE.Vector3();
    /** Position monde d'une planète, réutilisée à chaque calcul. */
    const camMonde = new THREE.Vector3();
    /** Axe « droite » de la caméra, pour décaler le point visé latéralement. */
    const camDroite = new THREE.Vector3();
    /** Décalage latéral appliqué au point visé, repris par la caméra. */
    const camLateral = new THREE.Vector3();

    // Dernières dimensions connues de la zone de rendu et de la bande libre.
    // Relevées par la boucle : la sélection en a besoin pour savoir de combien
    // décentrer la planète, et un clic ne doit pas déclencher sa propre lecture
    // de mise en page.
    let dernierViewH = 0;
    let derniereBande = 0;
    let camArcActif = false;

    // Planète actuellement sélectionnée — la carte de détail la suit chaque
    // frame, y compris quand la caméra continue de tourner après le clic.
    let selectedEntry: PlanetEntry | null = null;
    // Planète sous le curseur : seule son étiquette est affichée.
    let hoveredEntry: PlanetEntry | null = null;
    const popupProj = new THREE.Vector3();
    const popupMonde = new THREE.Vector3();
    const popupEdge = new THREE.Vector3();

    // Géométrie de la carte, mise en cache. La relire à chaque frame
    // (`offsetWidth`) forcerait un recalcul de mise en page synchrone à 60 Hz,
    // soit exactement ce que le reste du calque de labels évite déjà.
    /**
     * Encombrement de la carte, relu à chaque frame dans le bloc de lectures.
     *
     * Un `ResizeObserver` s'en chargeait auparavant. Il est livré de façon
     * asynchrone, après la frame qui a changé le contenu de la carte : le
     * recadrage travaillait donc au moins une frame sur les dimensions de la
     * carte *précédente*. Sur un changement de jeu, la carte pouvait ainsi être
     * placée d'après une largeur qui n'était plus la sienne, et déborder sous
     * la liste.
     *
     * La relire dans le bloc de lectures ne coûte rien de plus : ces lectures
     * sont groupées avant toute écriture de style, le navigateur ne recalcule
     * donc la mise en page qu'une fois par frame de toute façon.
     */
    let popupW = 0;
    let popupH = 0;
    /** La carte a changé de gabarit : ses dimensions sont à relire. */
    let remesurerFiche = false;
    let popupShown = false;
    let lastArrowY = -1;
    let lastMaxW = -1;
    let lastMaxH = -1;
    let lastSide = '';
    let lastX = NaN;
    let lastY = NaN;

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
      /**
       * Point de contrôle d'une courbe de Bézier quadratique.
       *
       * Absent, la caméra suit la ligne droite — c'est ce qu'on veut pour
       * rejoindre une planète voisine. Présent, elle décrit un arc : c'est ce
       * qui donne à un voyage entre systèmes son mouvement de recul, sans quoi
       * la traversée d'un vide étoilé en ligne droite ne se distingue pas
       * d'une téléportation.
       */
      arc?: THREE.Vector3,
    ) {
      camEase = courbe;
      if (arc) camArc.copy(arc);
      camArcActif = Boolean(arc);
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
      camDur = duree ?? THREE.MathUtils.clamp(d / (viseCadre * CAM_REF), CAM_MIN_S, CAM_MAX_S);
      // On arrive quand même à destination, mais sans le trajet.
      if (mouvementReduit) camDur = 0;
      camT = 0;

      animating = true;
      controls.enabled = false;
    }

    /** Rend la main à l'utilisateur, caméra laissée là où elle se trouve. */
    function stopCam() {
      if (!animating) return;
      animating = false;
      controls.enabled = true;
      // Le trajet est fini : la destination redevient soumise à la règle de
      // distance, à laquelle elle satisfait puisqu'on vient d'y arriver.
      galaxie.epingler(null);
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
      // Position **monde** : la planète vit dans le groupe de son système, sa
      // position propre est relative au soleil de celui-ci. La viser telle
      // quelle envoyait la caméra près de l'origine de la galaxie, c'est-à-dire
      // dans le vide, à quelques dizaines d'unités du centre du monde.
      p.mesh.getWorldPosition(camMonde);
      // Distance déduite de la place à laisser, et non d'un multiple fixe du
      // rayon : c'est la largeur de la bande qui manque, pas la profondeur.
      const distance = distanceApproche(
        p.rayonVisuel, derniereBande, dernierViewH, camera.fov,
      );

      // Le point visé n'est pas la planète, mais un point décalé sur le côté.
      //
      // La caméra centre ce qu'elle vise. Une planète centrée ne laisse de
      // chaque côté que la moitié de la bande, moins son propre rayon apparent
      // — souvent moins qu'il n'en faut pour la fiche. Aucune position ne
      // convenait alors, et le recadrage posait la fiche sur la planète.
      //
      // La pousser sur le côté libère la place en face. Zéro décalage quand
      // elle tenait déjà : inutile de décentrer sans raison.
      const place = composerFiche({
        bande: derniereBande,
        demiPlanete: demiLargeurApparente(
          p.rayonVisuel, distance, dernierViewH, camera.fov,
        ),
      });
      // Seul le décalage sert ici : la largeur est recalculée à chaque frame
      // par `updatePopupAnchor`, qui seul connaît la bande du moment.
      const decalage = place.decalage;

      camLateral.set(0, 0, 0);
      if (decalage > 0) {
        // Viser à droite de la planète la fait apparaître à gauche, et la fiche
        // trouve sa place à droite.
        camDroite.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        camLateral.copy(camDroite).multiplyScalar(
          pixelsEnMonde(decalage, distance, dernierViewH, camera.fov),
        );
      }

      const pose = poserCamera(camMonde, camOffset, distance, camLateral);
      camOffset.set(pose.position.x, pose.position.y, pose.position.z);
      const cible = new THREE.Vector3(pose.cible.x, pose.cible.y, pose.cible.z);

      animateCam(camOffset, cible);
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
    /**
     * Referme la fiche et relance les orbites, sans toucher à la caméra.
     *
     * Séparé de `clearPlanet` parce que tous les abandons de sélection ne sont
     * pas un retour au cadrage : partir vers un autre système en est un aussi,
     * et le mouvement de retour viendrait alors contrarier le voyage.
     */
    function oublierSelection(): boolean {
      const avait = selectedEntry !== null;
      for (const pl of planets) pl.paused = false;
      selectedEntry = null;
      hoveredEntry = null;
      if (avait) onSelect(null);
      return avait;
    }

    function clearPlanet() {
      const avaitSelection = oublierSelection();

      if (!avaitSelection) {
        // Rien à quitter : on interrompt seulement une approche en vol, qui
        // mènerait vers une planète désormais désélectionnée.
        stopCam();
        return;
      }

      camOffset.subVectors(camera.position, controls.target);
      if (camOffset.lengthSq() < 1e-6) camOffset.subVectors(viseHome, viseCentre);
      camOffset.normalize().multiplyScalar(viseHome.distanceTo(viseCentre)).add(viseCentre);

      animateCam(camOffset, viseCentre);
    }
    clearRef.current = clearPlanet;

    /**
     * Mène la caméra devant un système et le désigne comme celui qu'on regarde.
     *
     * Le système est construit **au départ** du voyage et non à l'arrivée : sa
     * construction est synchrone, la faire à mi-parcours produirait un à-coup
     * en plein mouvement. Au départ, la caméra n'a pas encore pris de vitesse.
     */
    function allerVers(s: SystemeGalaxie): void {
      // La fiche appartient au système qu'on quitte : elle désigne une planète
      // qu'on ne verra plus, et qui sera libérée en chemin. Sans cela elle
      // restait ouverte au milieu de la galaxie, ancrée à un objet détruit.
      oublierSelection();

      galaxie.forcer(s.platform);
      // Protégée pour toute la durée du trajet : au sommet de l'arc, la caméra
      // s'éloigne assez pour que la règle de distance la libère.
      galaxie.epingler(s.platform);

      const c = cadrageDe(s);
      const depart = camera.position.clone();

      vise = s;
      viseCentre = s.centre.clone();
      viseCadre = c.frameR;
      viseHome = c.position;

      // Trajet en arc plutôt qu'en ligne droite — voir lib/flightPath, où sa
      // composition est vérifiée, notamment qu'il ne traverse aucun soleil.
      const trajet = composerTrajet(depart, c.position, galaxie.rayon);
      const controle = new THREE.Vector3(
        trajet.controle.x, trajet.controle.y, trajet.controle.z,
      );

      animateCam(c.position, s.centre.clone(), trajet.duree, easeInOut, controle);
      onSysteme(s.platform);
    }
    flyToRef.current = (nom: string) => {
      const s = galaxie.get(nom);
      if (s && s !== vise) allerVers(s);
    };

    // Sélection depuis la liste latérale : même trajet de caméra qu'un clic
    // direct sur la planète, pour que les deux gestes soient indiscernables.
    //
    // Le jeu peut appartenir à un système encore libéré — la liste, elle, sait
    // tout de la bibliothèque. On le construit donc avant de le chercher.
    focusRef.current = (gameId: string) => {
      const contient = (s: SystemeGalaxie) => s.games.some((g) => g.id === gameId);
      // Un jeu peut figurer dans plusieurs systèmes : celui de son launcher, et
      // les systèmes personnalisés où on l'a rangé. Celui qu'on regarde passe
      // d'abord — choisir un jeu dans la liste de « Favoris » ne doit pas
      // renvoyer vers son launcher.
      const proprietaire = (vise && contient(vise) ? vise : undefined)
        ?? galaxie.systemes.find(contient);
      if (!proprietaire) return;

      if (proprietaire !== vise) allerVers(proprietaire);
      else galaxie.forcer(proprietaire.platform);

      // Cherchée dans ce système seulement : dans toute la galaxie, on pourrait
      // tomber sur la planète du même jeu dans un autre système.
      const target = proprietaire.planets.find((p) => p.game.id === gameId);
      if (target) selectPlanet(target);
    };

    // ── Édition d'un système personnalisé ────────────────────────────────
    // Session d'aperçu : le brouillon est appliqué à chaque image, orbites
    // figées à l'angle où chaque planète se trouvait quand on l'a ouverte.
    let apercu: { cle: string; reglage: ReglageSysteme; angles: Map<PlanetEntry, number> } | null = null;

    const REGLAGE_NEUTRE: ReglageSysteme = {
      soleil: BORNES.soleil.defaut, vitesse: BORNES.vitesse.defaut, aPlat: false,
      couleurSoleil: null, etoiles: BORNES.etoiles.defaut, placements: {},
    };

    const appliquerApercu = (sys: SystemeGalaxie, a: NonNullable<typeof apercu>) => {
      for (const p of sys.planets) if (!a.angles.has(p)) a.angles.set(p, p.angle);
      appliquerPlacements(sys.planets, sys.tailleBase.sunR, a.reglage, a.angles);
      sys.soleil.scale.setScalar(a.reglage.soleil);
      sys.hitSoleil.scale.setScalar(a.reglage.soleil);
      apparenceEtoile(sys, a.reglage);
    };

    // Couleur de l'étoile et nuage d'étoiles, reteints en place : l'éditeur
    // les montre avant l'enregistrement, l'annulation rend ceux enregistrés.
    // La lumière suit d'elle-même, elle se règle sur `sys.lumiere`.
    const apparenceEtoile = (sys: SystemeGalaxie, reglage: ReglageSysteme) => {
      const couleur = reglage.couleurSoleil ?? null;
      if (sys.soleil.userData.couleurAppliquee !== couleur) {
        sys.soleil.userData.couleurAppliquee = couleur;
        teindreSoleil(sys.soleil, couleur);
        sys.lumiere = lumiereDe(couleur);
      }
      changerNuage(sys, reglage.etoiles);
    };

    const etatDe = (sys: SystemeGalaxie, reglage: ReglageSysteme): EtatEdition => ({
      planetes: sys.planets.map((p) => ({
        id: p.game.id,
        distance: p.orbitRadius,
        distanceBase: p.orbiteBase,
        distanceMin: distanceMini(sys.tailleBase.sunR, reglage.soleil, p.rayonVisuel),
        angle: angleEnDegres(p),
        taille: p.mesh.scale.x,
      })),
      distanceMax: sys.tailleBase.outerR * ETENDUE_MAX,
    });

    const entreeDe = (cle: string) => parPlateformeRef.current.find((e) => e.platform === cle);

    // Glissement d'une planète pendant l'aperçu : la scène dit où elle serait,
    // l'éditeur en fait un placement et le renvoie comme aperçu.
    let surGlissement: ((g: Glissement) => void) | null = null;
    const planGlisse = new THREE.Plane();
    const normaleGlisse = new THREE.Vector3();
    const pointGlisse = new THREE.Vector3();
    const centreGlisse = new THREE.Vector3();

    const systemeEdite = () => (apercu ? galaxie.get(apercu.cle) ?? null : null);

    editionRef.current = {
      lire(cle) {
        const sys = galaxie.forcer(cle);
        if (!sys) return null;
        return etatDe(sys, apercu?.cle === cle ? apercu.reglage : entreeDe(cle)?.reglage ?? REGLAGE_NEUTRE);
      },

      apercu(cle, jeux, reglage) {
        let sys = galaxie.forcer(cle);
        if (!sys) return null;
        const avant = sys.games.map((g) => g.id).join('\n');
        if (jeux.map((g) => g.id).join('\n') !== avant) {
          if (selectedEntry && sys.planets.includes(selectedEntry)) oublierSelection();
          sys = galaxie.recharger(cle, jeux) ?? sys;
        }
        if (!apercu || apercu.cle !== cle) apercu = { cle, reglage, angles: new Map() };
        else apercu.reglage = reglage;
        appliquerApercu(sys, apercu);
        return etatDe(sys, reglage);
      },

      terminer(cle, recharger) {
        if (apercu?.cle === cle) apercu = null;
        galaxie.epingler(null);
        if (recharger) editionRef.current.recharger(cle);
      },

      recharger(cle) {
        const entree = entreeDe(cle);
        const sys = galaxie.get(cle);
        if (!entree || !sys) return;
        if (selectedEntry && sys.planets.includes(selectedEntry)) oublierSelection();
        const reglage = entree.reglage ?? REGLAGE_NEUTRE;
        galaxie.recharger(cle, entree.games);
        sys.soleil.scale.setScalar(reglage.soleil);
        sys.hitSoleil.scale.setScalar(reglage.soleil);
        apparenceEtoile(sys, reglage);
      },

      ecouterGlissement(fn) {
        surGlissement = fn;
      },
    };

    // Lancé ici et non au bloc caméra : `animateCam` s'appuie sur des vecteurs
    // déclarés entre-temps.
    if (courant) galaxie.forcer(courant.platform);
    animateCam(homeCam, homeLook, ARRIVAL_S, easeInOut);

    // ── Sélection et survol ──────────────────────────────────────────────
    const picker = createPicker({
      canvas,
      camera,
      planets,
      pickMeshes,
      meshToEntry,
      soleils: galaxie.systemes.map((s) => s.hitSoleil),
      onHover: (hit) => { hoveredEntry = hit; },
      glisser: {
        peut: (p) => surGlissement !== null && (systemeEdite()?.planets.includes(p) ?? false),
        debut: () => {
          controls.enabled = false;
        },
        // Le curseur est projeté sur le plan de l'orbite de la planète, dans le
        // repère de son système : la planète reste sur son orbite inclinée et
        // suit la main, quel que soit l'angle de vue.
        deplacer: (p, rayon) => {
          const sys = systemeEdite();
          if (!sys || !surGlissement) return;
          sys.groupe.getWorldPosition(centreGlisse);
          normaleOrbite(p.inc, p.node, normaleGlisse);
          planGlisse.setFromNormalAndCoplanarPoint(normaleGlisse, centreGlisse);
          if (!rayon.intersectPlane(planGlisse, pointGlisse)) return;
          const { distance, angle } = positionSurOrbite(pointGlisse.sub(centreGlisse), p.inc, p.node);
          surGlissement({ id: p.game.id, distance, angle: THREE.MathUtils.radToDeg(angle) });
        },
        fin: () => {
          controls.enabled = !animating;
        },
      },
      onClick: (hit) => (hit ? selectPlanet(hit) : clearPlanet()),
      // Cliquer un soleil, c'est demander à s'y rendre — y compris celui du
      // système où l'on se trouve déjà, qui ramène alors au cadrage d'ensemble.
      onSoleil: (target) => {
        const s = galaxie.systemes.find((x) => x.hitSoleil === target);
        if (!s) return;
        hoveredEntry = null;
        if (s === vise) clearPlanet();
        else allerVers(s);
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

      // Position monde, pour la même raison que l'approche caméra : la carte
      // se serait ancrée sur un point du centre de la galaxie.
      const c = selectedEntry.mesh.getWorldPosition(popupMonde);

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
      // Le rayon visuel, et non la seule sphère : un système d'anneaux porte
      // jusqu'à près de quatre rayons, et la carte se posait dessus.
      popupEdge.setFromMatrixColumn(camera.matrixWorld, 0)
        .multiplyScalar(selectedEntry.rayonVisuel)
        .add(c)
        .project(camera);
      const edge = Math.abs(popupEdge.x * (w / 2) + w / 2 - cx);

      // Le calque couvre toute la fenêtre, y compris sous les deux colonnes :
      // la carte doit être recadrée sur la seule bande découverte. Celle-ci ne
      // commence plus à zéro, on raisonne donc dans son repère puis on ramène
      // le résultat dans celui du calque.
      const bande = w - viewLeft - viewRight;

      // Encombrement maximal de la carte, publié pour qu'elle s'y conforme.
      //
      // Sa feuille de style ne peut pas le déduire seule : elle se bornait à
      // `80vw`, or `vw` mesure la fenêtre entière alors que la carte vit dans
      // la bande laissée libre par la navigation, la liste et la barre des
      // launchers — plus de 450 px de moins. En fenêtre étroite, le recadrage
      // n'avait alors plus de place où recadrer et la carte débordait.
      //
      // Le plancher évite l'absurde : sous cette largeur la carte ne dirait
      // plus rien, mieux vaut qu'elle dépasse et reste lisible.
      //
      // Recalculée ici plutôt que reprise de la sélection : la bande change
      // quand on replie une colonne ou redimensionne la fenêtre, et la carte
      // gardait alors la largeur décidée pour une autre taille de fenêtre.
      // `composerFiche` la proportionne à la bande et à la planète du moment.
      const maxW = Math.min(
        Math.max(lireReglages().ficheMini, bande - POPUP_MARGIN * 2),
        composerFiche({ bande, demiPlanete: edge }).largeur,
      );
      const maxH = Math.max(200, h - POPUP_MARGIN * 2);

      const placement = placePopup(cx - viewLeft, cy, edge, popupW, popupH, bande, h);
      const { y, arrowY, side } = placement;
      const x = placement.x + viewLeft;

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
      if (maxW !== lastMaxW || maxH !== lastMaxH) {
        el.style.setProperty('--popup-max-w', `${maxW}px`);
        el.style.setProperty('--popup-max-h', `${maxH}px`);
        lastMaxW = maxW;
        lastMaxH = maxH;
        // La carte va changer de taille : ses dimensions mémorisées, qui
        // servent au recadrage, ne valent plus rien. On les relit à la frame
        // suivante, une fois la mise en page refaite — les lire ici forcerait
        // un recalcul synchrone à chaque frame de redimensionnement.
        remesurerFiche = true;
      } else if (remesurerFiche) {
        popupW = el.offsetWidth;
        popupH = el.offsetHeight;
        remesurerFiche = false;
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
      applyView(viewLeft, viewRight, w, h, true);

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
      labelLayer.update(camera, viseCadre, host?.clientWidth ?? w, host?.clientHeight ?? h, hoveredEntry);
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
          frameR
            * FLY_SPEED
            * flySettingsRef.current.vitesse
            * dt
            * (enfoncees.has(k.accelerer) ? FLY_BOOST : 1),
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

      // ── Limite d'images par seconde ────────────────────────────────────
      //
      // L'image est sautée avant tout calcul, et `prevT` n'est pas touché : le
      // temps écoulé continue de s'accumuler, de sorte que la scène avance
      // exactement de ce qu'elle doit quand on la dessine enfin. La règle, et
      // la raison de sa marge, sont dans `cadence.ts`.
      if (doitSauterImage(t, prevT, graphismeRef.current.limiteIPS)) return;

      const dt = Math.min((t - prevT) / 1000, 0.1);
      prevT = t;

      // Un calque recouvre la scène : rien de ce qu'on dessinerait ne se voit,
      // et tout se paie — la galaxie, sa floraison, et le compositeur qui
      // recompose le calque par-dessus à chaque image.
      //
      // La boucle reste vivante pour que la reprise soit immédiate, mais elle
      // s'arrête ici. `prevT` vient d'être remis à jour : au retour, le delta
      // repart de zéro et rien ne saute.
      if (pauseRef.current) return;

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
      const navW = navProbeRef.current?.offsetWidth ?? 0;
      // Dimensions courantes de la carte, tant qu'elle est affichée : masquée,
      // elle mesure zéro et la valeur ne servirait à rien.
      if (popupShown && popupRef.current) {
        popupW = popupRef.current.offsetWidth;
        popupH = popupRef.current.offsetHeight;
      }
      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      dernierViewH = viewH;
      derniereBande = Math.max(0, viewW - navW - probeW);

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
      // Lus une fois par frame : de simples propriétés, rien à recalculer.
      const reglages = lireReglages();
      // Le panneau de débogage continue de régler la vitesse : il sert à
      // éprouver l'application, pas à décider pour elle.
      const allure = mouvementReduit ? 0 : 1;

      for (const p of planets) {
        if (!p.paused) {
          p.angle += p.speed * dt * reglages.vitesseOrbites * allure;
          orbitPos(p.orbitRadius, p.angle, p.inc, p.node, p.mesh.position);
        }
        p.mesh.rotation.y += 0.05 * dt * reglages.vitesseRotation * allure;
      }
      // Le système qu'on édite garde ses planètes là où on les place, quel que
      // soit le mouvement calculé juste au-dessus.
      if (apercu) {
        const sys = galaxie.get(apercu.cle);
        if (sys?.charge) appliquerApercu(sys, apercu);
      }

      // Après le déplacement des planètes, sinon les lueurs traînent d'une
      // frame.
      //
      // Sans condition : `paused` ne reflète que l'état de la première planète,
      // et recopier quelques centaines de flottants coûte moins cher que le
      // risque de laisser les lueurs derrière les planètes encore en mouvement.
      // Le fond suit l'œil, et la lumière zodiacale suit l'étoile regardée.

      // ── Le chant de la comète bleue ───────────────────────────────────────
      //
      // Le survol se résout à l'écran et non par un rayon : la comète n'a pas
      // de géométrie qu'on puisse toucher — c'est une tête peinte sur un point
      // et un panache sur un rectangle. On projette donc sa tête, et on mesure
      // la distance au curseur en pixels.
      {
        const tete = ciel.teteCometeBleue();
        if (!tete || pointeurX < 0) {
          chant.niveau(0);
        } else {
          projection.copy(tete).project(camera);
          const rect = canvas.getBoundingClientRect();
          const x = rect.left + ((projection.x + 1) / 2) * rect.width;
          const y = rect.top + ((1 - projection.y) / 2) * rect.height;
          const devant = projection.z < 1;
          const d = Math.hypot(pointeurX - x, pointeurY - y);
          // Une cible généreuse : la tête ne fait que quelques pixels, et
          // personne ne va pointer au pixel près un objet qui se déplace.
          chant.niveau(devant ? THREE.MathUtils.clamp(1 - d / 160, 0, 1) : 0);
        }
      }

      // Construit ce dont on s'approche, libère ce qu'on laisse derrière.
      // Pendant l'édition, le système ne doit pas être libéré si la caméra
      // s'éloigne : on perdrait l'aperçu. La fin d'un voyage lève l'épingle,
      // on la repose donc à chaque image.
      if (apercu) galaxie.epingler(apercu.cle);
      galaxie.update(camera);

      // La lumière suit le système regardé : une seule pour toute la galaxie,
      // et elle n'a de sens qu'auprès des planètes qu'elle éclaire.
      if (vise) {
        lumiere.position.copy(vise.centre);
        // Et prend la couleur de son étoile : un soleil bleu éclaire en bleu.
        // Adoucie vers la couleur d'arrivée plutôt que basculée d'un coup, le
        // passage d'un système à l'autre se fait pendant le vol.
        lumiere.color.lerp(vise.lumiere, Math.min(1, dt * 3));
        // La brume suit l'échelle du système regardé, sinon elle ne veut rien
        // dire : ce qui est « loin » pour un système d'un jeu se trouve à
        // l'intérieur d'une bibliothèque de cent.
        brume.density = densiteBrume(vise.taille.systemR) * reglages.brumeFacteur;
        // Seule la ceinture du système regardé tourne : celles des autres sont
        // trop loin pour qu'on distingue le mouvement.
        if (vise.ceinture && !paused) vise.ceinture.rotation.y += 0.0015 * dt * reglages.vitesseOrbites * allure;
      }

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

        if (camArcActif) {
          // Bézier quadratique : (1−e)²·départ + 2(1−e)e·contrôle + e²·arrivée.
          const u = 1 - e;
          camera.position
            .copy(camFromPos).multiplyScalar(u * u)
            .addScaledVector(camArc, 2 * u * e)
            .addScaledVector(camTargetPos, e * e);
        } else {
          camera.position.lerpVectors(camFromPos, camTargetPos, e);
        }
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

      // Suit le repli des deux colonnes : chaque témoin porte sa transition
      // CSS, la scène n'a donc rien à interpoler.
      applyView(navW, probeW, viewW, viewH);

      // Sensibilité : réécrite seulement si elle a bougé. `rotateSpeed` est lu
      // par les contrôles à chaque geste, l'assigner à chaque frame ne coûterait
      // rien de visible mais brouillerait l'intention.
      const sens = flySettingsRef.current.sensibilite;
      if (sens !== controls.rotateSpeed) controls.rotateSpeed = sens;

      updateFly(dt);

      camera.updateMatrixWorld();
      // ── Réglages de graphisme ─────────────────────────────────────────────
      //
      // Relus à chaque image et appliqués seulement s'ils ont bougé : écrire
      // ces valeurs coûte peu, mais changer l'échelle de rendu réalloue toutes
      // les cibles de rendu du compositeur.
      {
        const g = graphismeRef.current;
        const voulue = densiteDePixels(g.echelleRendu);
        if (renderer.getPixelRatio() !== voulue) {
          renderer.setPixelRatio(voulue);
          const r = container.getBoundingClientRect();
          renderer.setSize(r.width, r.height);
          post.setSize(r.width, r.height);
        }
        post.debordement(g.debordement);
        fond.densite(g.densiteCiel);
      }

      // Le ciel, une fois la caméra posée.
      //
      // Il se mesure depuis l'œil : le fond reconstruit sa direction par pixel,
      // le rideau d'aurore se recentre sur l'observateur, et les événements
      // naissent dans son champ. Mis à jour avant le déplacement au clavier, ils
      // prenaient la position de l'image précédente — et le rideau, qui est le
      // seul à occuper une place dans l'espace, courait d'une image derrière la
      // caméra. Cela se voyait comme un tressautement dès qu'on avançait.
      fond.update(camera, lumiere.position, lumiere.color, renderer.domElement.height);

      galaxie.updateLueurs();

      ciel.update(dt, cielRef.current, evenementsRef.current, mouvementReduit, camera, lumiere.position);
      // Et les matrices de la scène : les planètes viennent de bouger sur leur
      // orbite, et tout ce qui suit lit leur position **monde**. Sans ce
      // recalcul, elle daterait de la frame précédente — le rendu la met bien à
      // jour, mais après. Les noms et la carte de détail traîneraient d'une
      // image derrière leur planète, ce qui se voit dès que la caméra bouge.
      scene.updateMatrixWorld();

      picker.updateHover();
      labelLayer.update(camera, viseCadre, hostW, hostH, hoveredEntry);
      updatePopupAnchor(hostW, hostH);

      post.render();
    };
    rafId = requestAnimationFrame(tick);

    // ── Nettoyage ────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      picker.dispose();
      balises.dispose();
      canvas.removeEventListener('pointermove', surPointeur);
      canvas.removeEventListener('pointerleave', surSortie);
      chant.arreter();
      retirerCiel();
      ciel.dispose();
      galaxie.dispose();
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
      desabonnerReglages();
      i18n.off('languageChanged', renommerSystemes);
      prefMouvement.removeEventListener('change', surPreference);
      fond.dispose();
      post.dispose();
      // Le moteur de rendu, lui, survit au démontage — c'est tout l'intérêt.
      // Ses listes de rendu, en revanche, tiennent des références sur les
      // objets de la scène que l'on vient de libérer.
      renderer.renderLists.dispose();

      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [
    // `platformRef` est volontairement absent : c'est une référence, sa valeur
    // change sans que la scène doive être reconstruite — et la reconstruire à
    // chaque voyage était précisément le défaut.
    cleScene, parPlateformeRef, editionRef, labelClass, orbitLabelClass,
    mountRef, labelsRef, onSelect, clearRef, focusRef, flyToRef, popupRef, cielRef,
    graphismeRef,
    sideProbeRef, navProbeRef, fpsRef, pauseRef, onSysteme, flySettingsRef, platformRef,
    structure,
  ]);
}
