import * as THREE from 'three';
import type { Game } from '../../../features/types';
import {
  fetchCoverArt,
  steamCdnUrl,
  steamPortraitUrl,
} from '../../../features/Library/services/coverArtService';
import { PALETTES, PLN_R_MAX, PLN_R_MIN } from '../constants';
import { hashStr, seededRng } from '../lib/random';
import { GOLDEN_ANGLE, makeRadiusScale, orbitPos, orbitRadius } from '../lib/orbits';
import { atmosphereType, makePlaceholderTexture, makeProcTexture } from '../textures/procedural';
import { loadArtImage, makeGameTexture } from '../textures/gameArt';
import { makeRingTexture, radialRingGeometry } from '../textures/rings';
import type { PlanetEntry } from './types';

type Options = {
  scene: THREE.Scene;
  games: Game[];
  orbStep: number;
  tint: number;
  /** Interroge le montage : coupe les chargements arrivés après démontage. */
  isDisposed: () => boolean;
  /** Appelé pour chaque planète créée, afin d'y attacher son label. */
  onPlanet: (entry: PlanetEntry) => void;
};

/**
 * Peuple la scène : une orbite par jeu, comme dans un vrai système solaire.
 * Renvoie les entrées ordonnées ainsi que les structures de sélection.
 */
export function createPlanets({
  scene, games, orbStep, tint, isDisposed, onPlanet,
}: Options): {
  planets: PlanetEntry[];
  pickMeshes: THREE.Object3D[];
  meshToEntry: Map<THREE.Object3D, PlanetEntry>;
} {
  const planets: PlanetEntry[] = [];
  const pickMeshes: THREE.Object3D[] = [];
  const meshToEntry = new Map<THREE.Object3D, PlanetEntry>();

  const radiusOf = makeRadiusScale(games);
  const tmp = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  games.forEach((g, k) => {
    const seed = hashStr(g.id);
    const rng = seededRng(seed + 1);

    const orbit = orbitRadius(k, orbStep);
    // Inclinaison légèrement exagérée (±8,6° contre ~0–7° réels) : assez pour
    // que les orbites ne paraissent pas décalquées, pas assez pour brouiller.
    const inc = (seededRng(seed + 3)() - 0.5) * 0.3;
    const node = seededRng(seed + 5)() * Math.PI * 2;
    const pr = radiusOf(g);

    scene.add(createOrbitRing(orbit, inc, node, tint, yAxis));

    const mat = createPlanetMaterial(seed);
    loadCoverArt(g, seed, mat, isDisposed);

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 36, 36), mat);
    mesh.rotation.z = (seededRng(seed + 7)() - 0.5) * 0.7;
    scene.add(mesh);

    const atmType = atmosphereType(rng);
    mesh.add(createAtmosphere(pr, PALETTES[atmType][0]));

    // Seuls les « gros » jeux ont droit à un système d'anneaux
    if (pr > (PLN_R_MIN + PLN_R_MAX) * 0.55 && rng() < 0.35) {
      mesh.add(createPlanetRing(pr, seed, PALETTES[atmType][1], rng));
    }

    // Répartition en angle d'or, bruit faible (±3,4°) : au-delà il referme les
    // écarts que l'angle d'or vient d'ouvrir et les alignements réapparaissent.
    const angle = k * GOLDEN_ANGLE + (seededRng(seed + 9)() - 0.5) * 0.12;
    // Kepler-ish : les orbites extérieures sont plus lentes
    const speed = 0.34 / Math.pow(orbit, 0.82);

    orbitPos(orbit, angle, inc, node, tmp);
    mesh.position.copy(tmp);

    const entry: PlanetEntry = {
      game: g, mesh, orbitRadius: orbit, angle, speed,
      paused: false, radius: pr, inc, node,
    };

    planets.push(entry);
    pickMeshes.push(mesh);
    meshToEntry.set(mesh, entry);
    onPlanet(entry);
  });

  return { planets, pickMeshes, meshToEntry };
}

/** Anneau d'orbite, incliné exactement dans le plan que suivra la planète. */
function createOrbitRing(
  orbit: number,
  inc: number,
  node: number,
  tint: number,
  yAxis: THREE.Vector3,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(orbit, 0.11, 4, 220),
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  mesh.rotation.set(Math.PI / 2 + inc, 0, 0);
  mesh.rotateOnWorldAxis(yAxis, node);
  return mesh;
}

/**
 * Matériau de planète.
 *
 * L'émissif reprend la texture de couleur : sans lui, la moitié de chaque
 * planète tournée à l'opposé du soleil est totalement noire, et de loin la
 * scène n'est plus qu'une poignée de billes sombres.
 */
function createPlanetMaterial(seed: number): THREE.MeshStandardMaterial {
  const placeholder = makePlaceholderTexture(seed);
  return new THREE.MeshStandardMaterial({
    map: placeholder,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: placeholder,
    emissiveIntensity: 0.42,
    roughness: 0.72,
    metalness: 0.03,
  });
}

function createAtmosphere(pr: number, color: string): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(pr * 1.13, 16, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
}

function createPlanetRing(
  pr: number,
  seed: number,
  color: string,
  rng: () => number,
): THREE.Mesh {
  const inner = pr * (1.38 + rng() * 0.2);
  const outer = inner * (1.6 + rng() * 0.55);

  const mesh = new THREE.Mesh(
    radialRingGeometry(inner, outer, 128),
    new THREE.MeshBasicMaterial({
      map: makeRingTexture(seed + 13, new THREE.Color(color)),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.35;
  mesh.rotation.y = (rng() - 0.5) * 0.25;
  return mesh;
}

/**
 * Résout la jaquette du jeu et l'applique en texture, de façon asynchrone.
 *
 * Priorité : image utilisateur → CDN Steam → SteamGridDB → génération
 * procédurale. Cette dernière n'intervient qu'en dernier recours : elle coûte
 * un canvas 512×512 et jusqu'à 4000 opérations de dessin, autant ne pas la
 * produire pour la jeter aussitôt.
 */
function loadCoverArt(
  g: Game,
  seed: number,
  mat: THREE.MeshStandardMaterial,
  isDisposed: () => boolean,
): void {
  function setTexture(tex: THREE.Texture) {
    const prev = mat.map;
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.needsUpdate = true;
    if (prev && prev !== tex) prev.dispose();
  }

  async function apply(url: string): Promise<boolean> {
    try {
      const img = await loadArtImage(url);
      if (isDisposed()) return true;
      setTexture(makeGameTexture(img, seed));
      return true;
    } catch {
      return false;
    }
  }

  const appId =
    g.steamAppId ??
    (g.platform === 'Steam' && g.id.startsWith('steam-') ? g.id.slice(6) : null);

  void (async () => {
    if (g.customImageUrl && (await apply(g.customImageUrl))) return;
    if (appId) {
      if (await apply(steamCdnUrl(appId))) return;
      if (await apply(steamPortraitUrl(appId))) return;
    }
    const sgdb = await fetchCoverArt(g.title, null);
    if (sgdb && (await apply(sgdb))) return;
    if (!isDisposed()) setTexture(makeProcTexture(seed));
  })();
}
