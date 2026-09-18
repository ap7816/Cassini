import * as THREE from 'three';
import { seededRng } from '../lib/random';
import { lireReglages } from '../../../features/debug/tuning';

/**
 * Champ d'étoiles proche, en parallaxe par-dessus la nébuleuse de fond.
 * Le rayon suit la taille du système, sans quoi les étoiles se retrouveraient
 * *à l'intérieur* des orbites sur une grosse bibliothèque.
 */
export function createStarfield(outerR: number): THREE.Points {
  const reglages = lireReglages();
  const n = Math.max(0, Math.round(reglages.etoilesNombre));
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const min = Math.max(900, outerR * 2.2);

  for (let i = 0; i < n; i++) {
    const r = min + Math.random() * min * 1.4;
    const theta = Math.random() * Math.PI * 2;
    // acos(2u-1) répartit uniformément sur la sphère ; sans ça les étoiles
    // s'agglutinent aux pôles.
    const phi = Math.acos(2 * Math.random() - 1);

    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);

    const b = 0.7 + Math.random() * 0.3;
    col[i * 3] = b;
    col[i * 3 + 1] = b;
    col[i * 3 + 2] = b * 1.08;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: reglages.etoilesTaille,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: reglages.etoilesOpacite,
      // Hors de la brume. Elle est réglée sur l'échelle d'un système, alors que
      // les étoiles se tiennent bien au-delà de la galaxie : soumises à elle,
      // elles seraient effacées jusqu'à la dernière et le ciel deviendrait un
      // aplat noir.
      fog: false,
    }),
  );
  // Repéré par la scène, qui en ajuste taille et opacité à chaud.
  points.userData.reglage = 'etoiles';
  return points;
}

/**
 * Soleil et ses couches de couronne. `core` est animé (pulsation, rotation).
 *
 * `haloMax` borne l'étendue de la couronne en unités monde. Sans cette borne,
 * la couche externe atteint 3,4 fois le rayon solaire — ce qui va bien sur un
 * grand système, mais couvrait **102 % du rayon de l'orbite** sur un système
 * d'un seul jeu : le soleil avalait tout. Le plancher de `sunR` le rend en
 * effet gros par rapport à un système minuscule.
 *
 * Les couches qui dépassent la borne sont simplement omises, plutôt que
 * ramenées dessus : les empiler au même rayon produirait un cerne net au lieu
 * d'un dégradé.
 */
export function createSun(
  sunR: number,
  haloMax: number,
  /**
   * Couleur propre au système, si l'utilisateur en a choisi une. Absente, le
   * soleil suit le réglage général — et continue de le suivre quand il change.
   */
  couleurPropre?: string | null,
): { group: THREE.Group; core: THREE.Mesh } {
  const group = new THREE.Group();

  // `fog: false` sur tout le soleil, ici comme sur sa couronne.
  //
  // La brume noie les planètes à mesure qu'on quitte un système — c'est ce qui
  // masque leur apparition et leur disparition. Le soleil, lui, doit rester
  // visible : c'est le seul repère qui subsiste une fois le système libéré, et
  // c'est ce qu'on vise pour s'y rendre.
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(sunR, 64, 64),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(couleurPropre ?? lireReglages().soleilCouleur),
      fog: false,
    }),
  );
  core.userData.reglage = 'soleil';
  // Marqué pour que le réglage général passe son chemin : sans cela, il
  // repeindrait ce soleil à chaque image et le choix de l'utilisateur ne
  // tiendrait pas une frame.
  core.userData.couleurPropre = couleurPropre ?? null;
  group.add(core);

  const corona: [number, number, number][] = [
    [1.35, 0xffaa22, 0.24],
    [1.75, 0xff8800, 0.13],
    [2.4, 0xff5500, 0.06],
    [3.4, 0xff3300, 0.03],
  ];

  const intensite = lireReglages().couronneIntensite;
  for (const [scale, color, opacity] of corona) {
    const rayon = sunR * scale;
    if (rayon > haloMax) continue;
    const couche = new THREE.Mesh(
      new THREE.SphereGeometry(rayon, 32, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: opacity * intensite,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    // L'opacité propre de la couche est gardée : le réglage la multiplie, il
    // ne la remplace pas — sinon les quatre couches finiraient au même niveau.
    couche.userData.reglage = 'couronne';
    couche.userData.opaciteBase = opacity;
    group.add(couche);
  }

  return { group, core };
}

/**
 * Ceinture d'astéroïdes, juste au-delà de l'orbite la plus externe.
 *
 * Rayon, épaisseur, nombre et taille des rochers suivent tous la taille du
 * système : sur un système à une seule planète, une ceinture de taille fixe
 * paraissait absurde à côté d'un soleil minuscule.
 */
export function createBelt(outerR: number, planetCount: number): THREE.InstancedMesh | null {
  if (planetCount <= 0) return null;

  const beltR = outerR * 1.34;
  const spread = THREE.MathUtils.clamp(outerR * 0.1, 3, 44);
  const reglages = lireReglages();
  const plafond = Math.max(0, Math.round(reglages.asteroidesMax));
  // Le plancher de 120 ne doit pas contredire un plafond plus bas : à zéro,
  // il n'y a plus de ceinture du tout.
  const count = Math.round(
    THREE.MathUtils.clamp(planetCount * reglages.asteroidesParPlanete, Math.min(120, plafond), plafond),
  );
  if (count <= 0) return null;
  const scale = THREE.MathUtils.clamp(outerR * 0.018, 0.22, 1.25);

  const belt = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: 0xa89880,
      roughness: 0.9,
      metalness: 0.08,
      flatShading: true,
    }),
    count,
  );

  const dummy = new THREE.Object3D();
  const rng = seededRng(9001);

  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const rr = beltR + (rng() - 0.5) * 2 * spread;
    dummy.position.set(Math.cos(a) * rr, (rng() - 0.5) * spread * 0.3, Math.sin(a) * rr);
    dummy.rotation.set(rng() * 6.28, rng() * 6.28, rng() * 6.28);
    const s = (0.3 + rng() * 1.1) * scale;
    dummy.scale.set(s, s * (0.6 + rng() * 0.7), s);
    dummy.updateMatrix();
    belt.setMatrixAt(i, dummy.matrix);
  }

  belt.instanceMatrix.needsUpdate = true;
  return belt;
}


/** Pastille dégradée servant de balise. Une seule pour toute la galaxie. */
function makeBeaconTexture(): THREE.CanvasTexture {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.16, 'rgba(255,244,214,0.85)');
  g.addColorStop(0.45, 'rgba(255,200,120,0.22)');
  g.addColorStop(1, 'rgba(255,170,60,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, s, s);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Balises solaires — un point lumineux à l'emplacement de chaque soleil.
 *
 * De loin, un soleil se projette sur moins d'un pixel : le système entier
 * disparaît alors du ciel, alors que c'est lui qu'on cherche pour s'y rendre.
 * `sizeAttenuation: false` fixe la taille en pixels, la balise garde donc le
 * même éclat quelle que soit la distance.
 *
 * De près elle ne gêne pas : le test de profondeur la fait passer derrière la
 * sphère du soleil, bien plus large. Et un seul objet `Points` pour toute la
 * galaxie, donc un seul appel de dessin.
 */
export function createSunBeacons(
  soleils: Array<{ centre: THREE.Vector3; couleur: THREE.Color }>,
): { points: THREE.Points; dispose: () => void } {
  const n = soleils.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);

  soleils.forEach((s, i) => {
    positions[i * 3] = s.centre.x;
    positions[i * 3 + 1] = s.centre.y;
    positions[i * 3 + 2] = s.centre.z;
    // Blanchie : une balise reprenant la teinte du launcher telle quelle
    // paraissait sale plutôt que brûlante. La couleur reste reconnaissable,
    // le cœur reste blanc.
    colors[i * 3] = 0.55 + s.couleur.r * 0.45;
    colors[i * 3 + 1] = 0.55 + s.couleur.g * 0.45;
    colors[i * 3 + 2] = 0.55 + s.couleur.b * 0.45;
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const map = makeBeaconTexture();
  const mat = new THREE.PointsMaterial({
    // Diamètre en pixels, indépendant de la distance.
    size: lireReglages().baliseTaille,
    sizeAttenuation: false,
    map,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Hors de la brume, comme le soleil qu'elle signale.
    fog: false,
  });

  const points = new THREE.Points(geo, mat);
  points.userData.reglage = 'balise';
  // Les soleils ne bougent pas, mais la sphère englobante calculée au montage
  // écarterait tout l'objet dès qu'un seul soleil quitte le champ.
  points.frustumCulled = false;

  return {
    points,
    dispose: () => { geo.dispose(); mat.dispose(); map.dispose(); },
  };
}

/** Étoiles par unité de densité : assez pour se voir, pas pour noyer le système. */
const ETOILES_PAR_DENSITE = 450;

/**
 * Nuage d'étoiles propre à un système, posé autour de lui.
 *
 * Le ciel de fond est commun à toute la galaxie : il ne distingue aucun
 * système. Celui-ci appartient au système, qu'il enveloppe d'une coquille à
 * peine plus large que ses orbites — assez près pour qu'on le voie en
 * arrivant, assez loin pour ne jamais passer entre les planètes.
 *
 * La graine rend le nuage stable d'une session à l'autre. Repéré comme les
 * autres étoiles, il suit les réglages de taille et d'opacité.
 */
export function createNuageEtoiles(rayonSysteme: number, densite: number, graine: number): THREE.Points | null {
  const n = Math.round(ETOILES_PAR_DENSITE * Math.max(0, densite));
  if (n === 0) return null;

  const reglages = lireReglages();
  const rng = seededRng(graine);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const interieur = rayonSysteme * 1.15;
  const epaisseur = rayonSysteme * 0.9;

  for (let i = 0; i < n; i++) {
    const r = interieur + rng() * epaisseur;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    pos[i * 3 + 2] = r * Math.cos(phi);

    const b = 0.65 + rng() * 0.35;
    col[i * 3] = b;
    col[i * 3 + 1] = b;
    col[i * 3 + 2] = b * 1.08;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: reglages.etoilesTaille,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: reglages.etoilesOpacite,
      depthWrite: false,
    }),
  );
  points.userData.reglage = 'etoiles';
  return points;
}
