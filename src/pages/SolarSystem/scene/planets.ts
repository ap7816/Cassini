import * as THREE from 'three';
import { ANNEAU_AUCUN } from '../lib/customSystems';
import type { Game } from '../../../features/types';
import {
  fetchCoverArt,
  steamCdnUrl,
  steamPortraitUrl,
} from '../../../features/library/services/coverArtService';
import { PALETTES } from '../constants';
import { hashStr, seededRng } from '../lib/random';
import { GOLDEN_ANGLE, makeRadiusScale, orbitPos, orbitRadius } from '../lib/orbits';
import { atmosphereType, makePlaceholderTexture, makeProcTexture } from '../textures/procedural';
import { loadArtImage, makeGameTexture } from '../textures/gameArt';
import { makeRingTexture, radialRingGeometry, arcRingGeometry, type ProfilAnneau } from '../textures/rings';
import type { PlanetEntry } from './types';
import { lireReglages } from '../../../features/debug/tuning';

type Options = {
  /**
   * Conteneur des planètes et de leurs orbites.
   *
   * Un `Object3D` et non une `Scene` : la galaxie donne à chaque système son
   * propre groupe, ce qui permet de le déplacer, de le masquer ou de le
   * libérer d'un bloc.
   */
  scene: THREE.Object3D;
  games: Game[];
  orbStep: number;
  /** Rayon de la première orbite, calculé pour dégager la couronne solaire. */
  orbBase: number;
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
  scene, games, orbStep, orbBase, tint, isDisposed, onPlanet,
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

    const orbit = orbitRadius(k, orbStep, orbBase);
    // Inclinaison légèrement exagérée (±8,6° contre ~0–7° réels) : assez pour
    // que les orbites ne paraissent pas décalquées, pas assez pour brouiller.
    const inc = (seededRng(seed + 3)() - 0.5) * 0.3;
    const node = seededRng(seed + 5)() * Math.PI * 2;
    const pr = radiusOf(g);

    const orbite = createOrbitRing(orbit, inc, node, tint, yAxis);
    scene.add(orbite);

    const mat = createPlanetMaterial(seed);
    loadCoverArt(g, seed, mat, isDisposed);

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 36, 36), mat);
    mesh.userData.reglage = 'planete';
    mesh.rotation.z = (seededRng(seed + 7)() - 0.5) * 0.7;
    scene.add(mesh);

    const atmType = atmosphereType(rng);
    mesh.add(createAtmosphere(pr, PALETTES[atmType][0]));

    // Étendue visible de la planète, anneaux compris.
    //
    // Ce n'est pas le rayon de la sphère : un système d'anneaux porte jusqu'à
    // près de quatre rayons. Cadrer et écarter la fiche sur la seule sphère
    // revenait à ignorer les trois quarts de ce qu'on voit à l'écran.
    let rayonVisuel = pr * 1.13; // l'atmosphère déborde un peu de la sphère

    // Un anneau sur trois planètes environ, tirage seul. La taille n'entre
    // plus en compte : elle traduit le poids du jeu sur le disque, qui n'a
    // aucun rapport avec l'idée d'un système d'anneaux — et cela réservait le
    // détail le plus reconnaissable de la scène aux seuls gros jeux.
    //
    // Les tirages de cet anneau sont gardés : changer sa couleur le rebâtit
    // tirage pour tirage, et il ne change que de teinte.
    const rayonSansAnneau = rayonVisuel;
    const anneauAuto = rng() < 0.32;
    const tirages: number[] = [];
    let anneauGroupe: THREE.Group | null = null;
    if (anneauAuto) {
      const anneau = createPlanetRing(pr, seed, PALETTES[atmType][1], () => {
        const v = rng();
        tirages.push(v);
        return v;
      });
      mesh.add(anneau.groupe);
      anneauGroupe = anneau.groupe;
      rayonVisuel = Math.max(rayonVisuel, anneau.rayon);
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
      paused: false, radius: pr, rayonVisuel, inc, node,
      tint: new THREE.Color(PALETTES[atmType][0]),
      orbiteBase: orbit, rayonBase: pr, rayonVisuelBase: rayonVisuel, incBase: inc, orbite,
    };

    // Anneaux choisis par l'utilisateur. Une planète qui n'en avait pas en
    // reçoit un tiré de sa propre graine : toujours le même pour elle.
    let choixAnneau: string | undefined;
    entry.changerAnneau = (choix) => {
      if (choix === choixAnneau) return;
      choixAnneau = choix;
      if (anneauGroupe) {
        mesh.remove(anneauGroupe);
        libererAnneau(anneauGroupe);
        anneauGroupe = null;
      }
      let rayon = 0;
      if (choix === undefined ? anneauAuto : choix !== ANNEAU_AUCUN) {
        let i = 0;
        const tirage = anneauAuto ? () => tirages[i++] ?? 0.5 : seededRng(seed + 11);
        const anneau = createPlanetRing(pr, seed, choix ?? PALETTES[atmType][1], tirage);
        mesh.add(anneau.groupe);
        anneauGroupe = anneau.groupe;
        rayon = anneau.rayon;
      }
      entry.rayonVisuelBase = Math.max(rayonSansAnneau, rayon);
    };

    planets.push(entry);
    pickMeshes.push(mesh);
    meshToEntry.set(mesh, entry);
    onPlanet(entry);
  });

  return { planets, pickMeshes, meshToEntry };
}

/** Rend au GPU ce qu'occupait un système d'anneaux retiré. */
function libererAnneau(groupe: THREE.Group): void {
  groupe.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    const m = o.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  });
}

/** Pastille dégradée servant de lueur. Une seule pour toute la scène. */
function makeGlowTexture(): THREE.CanvasTexture {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Lueur de repérage posée sur chaque planète.
 *
 * De loin, une planète se projette sur moins d'un pixel : elle scintille au
 * gré de l'échantillonnage, puis disparaît. Le système entier se réduit alors
 * à ses anneaux d'orbite, et on ne voit plus où sont les jeux.
 *
 * `sizeAttenuation: false` fixe la taille en pixels au lieu de la faire
 * décroître avec la distance : la lueur garde donc le même diamètre à l'écran
 * quelle que soit la position de la caméra. De près elle ne gêne pas — le test
 * de profondeur la fait passer derrière la sphère, qui est bien plus large.
 *
 * Un seul objet `Points` pour toutes les planètes, donc un seul appel de dessin
 * là où un sprite par planète en aurait ajouté autant qu'il y a de jeux.
 */
export function createPlanetGlow(planets: PlanetEntry[]): {
  points: THREE.Points;
  update: () => void;
  dispose: () => void;
} {
  const n = planets.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);

  planets.forEach((p, i) => {
    colors[i * 3] = p.tint.r;
    colors[i * 3 + 1] = p.tint.g;
    colors[i * 3 + 2] = p.tint.b;
  });

  const geo = new THREE.BufferGeometry();
  const attrPos = new THREE.BufferAttribute(positions, 3);
  attrPos.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attrPos);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const map = makeGlowTexture();
  const mat = new THREE.PointsMaterial({
    // Diamètre en pixels, indépendant de la distance.
    size: lireReglages().lueurTaille,
    sizeAttenuation: false,
    map,
    vertexColors: true,
    transparent: true,
    // Additif : la lueur s'ajoute au fond étoilé au lieu de le masquer par un
    // carré sombre là où la pastille est presque transparente.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.85,
  });

  const points = new THREE.Points(geo, mat);
  points.userData.reglage = 'lueur';
  // Les planètes bougent, trois d'entre elles peuvent sortir du cadre calculé
  // au montage : sans cela three.js écarterait tout l'objet dès que sa sphère
  // englobante d'origine quitte le champ.
  points.frustumCulled = false;

  const update = () => {
    for (let i = 0; i < n; i += 1) {
      const p = planets[i].mesh.position;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    attrPos.needsUpdate = true;
  };
  update();

  return {
    points,
    update,
    dispose: () => { geo.dispose(); mat.dispose(); map.dispose(); },
  };
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
    // Épaisseur proportionnelle au rayon plutôt que fixe : à 0,11 unité, une
    // orbite lointaine se projetait sur moins d'un pixel et disparaissait par
    // intermittence selon l'échantillonnage. Rapportée au rayon, elle garde
    // la même épaisseur apparente d'une orbite à l'autre.
    new THREE.TorusGeometry(orbit, Math.max(0.11, orbit * 0.0026), 4, 220),
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: lireReglages().orbitesOpacite,
      depthWrite: false,
    }),
  );
  mesh.userData.reglage = 'orbite';
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
    emissiveIntensity: lireReglages().planeteEmissif,
    roughness: 0.72,
    metalness: 0.03,
  });
}

function createAtmosphere(pr: number, color: string): THREE.Mesh {
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(pr * 1.13, 16, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: lireReglages().atmosphereOpacite,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  atmosphere.userData.reglage = 'atmosphere';
  return atmosphere;
}

/**
 * Familles d'anneaux, calquées sur celles du système solaire.
 *
 * Auparavant tous les anneaux sortaient du même moule : une nappe large, une
 * division, presque dans le plan équatorial. La graine n'en changeait que le
 * grain — fréquences de rubanage, position du vide — si bien que deux anneaux
 * se ressemblaient dès qu'on les regardait de loin, c'est-à-dire presque
 * toujours. Ce qui les distingue vraiment, ce sont la largeur relative,
 * l'opacité, l'inclinaison, et le fait d'être complet ou non.
 *
 * `poids` définit la fréquence de tirage : le type saturnien reste le plus
 * courant, c'est celui qu'on attend en voyant un anneau.
 */
type FamilleAnneau = {
  nom: string;
  poids: number;
  /** Rayon interne, en rayons planétaires. */
  interne: [number, number];
  /** Rayon externe, en multiples du rayon interne. */
  largeur: [number, number];
  /** Écart maximal au plan équatorial, en radians. */
  inclinaison: number;
  opacite: [number, number];
  profil: ProfilAnneau;
  /** Nombre d'arcs. 1 = anneau complet. */
  arcs?: [number, number];
};

const FAMILLES: FamilleAnneau[] = [
  {
    // Saturne : la nappe large et brillante, plusieurs divisions.
    nom: 'saturnien',
    poids: 0.4,
    interne: [1.34, 1.54],
    largeur: [1.9, 2.5],
    inclinaison: 0.3,
    opacite: [0.85, 1],
    profil: { divisions: 3, contraste: 1, douceur: 0.55, eclat: 0.85, saturation: 1 },
  },
  {
    // Uranus : rubans étroits, sombres, aux bords francs — et surtout un axe
    // très basculé, qui suffit à lui seul à ne pas confondre les deux.
    nom: 'etroit',
    poids: 0.24,
    interne: [1.7, 2.0],
    largeur: [1.1, 1.24],
    inclinaison: 1.15,
    opacite: [0.7, 0.92],
    profil: { divisions: 1, contraste: 0.85, douceur: 0.25, eclat: 0.7, saturation: 0.45 },
  },
  {
    // Jupiter : un voile de poussière, large et à peine visible. Sans division :
    // il n'y a pas de structure assez dense pour en creuser une.
    nom: 'poussiereux',
    poids: 0.2,
    interne: [1.2, 1.4],
    largeur: [2.4, 3.2],
    inclinaison: 0.22,
    opacite: [0.2, 0.34],
    profil: { divisions: 0, contraste: 0.3, douceur: 1.5, eclat: 0.6, saturation: 0.7 },
  },
  {
    // Neptune : des arcs, pas un anneau. Le secteur est porté par la géométrie
    // (voir radialRingGeometry), la texture reste la même bande radiale.
    nom: 'arcs',
    poids: 0.16,
    interne: [1.5, 1.85],
    largeur: [1.12, 1.3],
    inclinaison: 0.6,
    opacite: [0.8, 1],
    profil: { divisions: 0, contraste: 0.7, douceur: 0.4, eclat: 0.9, saturation: 0.6 },
    // Trois à cinq, et non deux à quatre : sous trois, rien ne dit qu'ils
    // partagent un cercle, et la planète paraît flanquée de deux morceaux.
    arcs: [3, 5],
  },
];

const POIDS_TOTAL = FAMILLES.reduce((s, f) => s + f.poids, 0);

/** Tire une famille selon les poids déclarés. */
function familleAnneau(rng: () => number): FamilleAnneau {
  let r = rng() * POIDS_TOTAL;
  for (const f of FAMILLES) {
    r -= f.poids;
    if (r <= 0) return f;
  }
  return FAMILLES[FAMILLES.length - 1];
}

const entre = (rng: () => number, [a, b]: [number, number]) => a + rng() * (b - a);

/**
 * Système d'anneaux d'une planète.
 *
 * Renvoie un groupe et non un maillage : une famille à arcs en contient
 * plusieurs, et le groupe porte l'inclinaison commune — les arcs d'un même
 * système partagent forcément leur plan.
 */
function createPlanetRing(
  pr: number,
  seed: number,
  color: string,
  rng: () => number,
): { groupe: THREE.Group; rayon: number } {
  const famille = familleAnneau(rng);
  const inner = pr * entre(rng, famille.interne);
  const outer = inner * entre(rng, famille.largeur);

  const groupe = new THREE.Group();
  const teinte = new THREE.Color(color);

  // Une seule texture pour tout le système : les arcs d'un même anneau sont
  // faits de la même matière, et cela évite d'allouer un canvas par arc.
  const map = makeRingTexture(seed + 13, teinte, famille.profil);
  const opacite = entre(rng, famille.opacite);

  // Chaque nappe garde son opacité de départ à part : le réglage la multiplie
  // sans l'écraser, les familles restent donc distinctes les unes des autres,
  // et le voile des arcs reste un voile quel que soit le curseur.
  const nappe = (geo: THREE.BufferGeometry, op: number, fondu: boolean) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map, transparent: true, opacity: op * lireReglages().anneauxOpacite,
      side: THREE.DoubleSide, depthWrite: false, vertexColors: fondu,
    }));
    mesh.userData.reglage = 'anneau';
    mesh.userData.opaciteBase = op;
    groupe.add(mesh);
  };

  const nbArcs = famille.arcs ? Math.round(entre(rng, famille.arcs)) : 1;

  if (nbArcs === 1) {
    nappe(radialRingGeometry(inner, outer, 128), opacite, false);
  } else {
    // Le voile continu sur lequel les arcs se détachent.
    //
    // Sans lui, quelques secteurs isolés ne se lisent pas comme un anneau mais
    // comme des débris flottant autour de la planète : rien à l'écran ne dit
    // qu'ils appartiennent au même cercle. C'est ainsi que se présentent les
    // arcs de Neptune, qui sont des surdensités d'un anneau, pas des objets.
    nappe(radialRingGeometry(inner, outer, 128), opacite * 0.16, false);

    // Chaque arc occupe une fraction de son secteur, le reste est le vide qui
    // le rend lisible comme arc. Partir de secteurs égaux garantit qu'ils ne se
    // chevauchent pas, quel que soit le tirage.
    const secteur = (Math.PI * 2) / nbArcs;
    for (let i = 0; i < nbArcs; i += 1) {
      const etendue = secteur * (0.2 + rng() * 0.3);
      const debut = i * secteur + rng() * (secteur - etendue);
      nappe(arcRingGeometry(inner, outer, 64, debut, etendue), opacite, true);
    }
  }

  groupe.rotation.x = Math.PI / 2 + (rng() - 0.5) * famille.inclinaison;
  groupe.rotation.y = (rng() - 0.5) * famille.inclinaison * 0.7;

  return { groupe, rayon: outer };
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
