import * as THREE from 'three';
import { seededRng } from '../lib/random';

/**
 * Champ d'étoiles proche, en parallaxe par-dessus la nébuleuse de fond.
 * Le rayon suit la taille du système, sans quoi les étoiles se retrouveraient
 * *à l'intérieur* des orbites sur une grosse bibliothèque.
 */
export function createStarfield(outerR: number): THREE.Points {
  const n = 5000;
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

  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    }),
  );
}

/** Soleil et ses couches de couronne. `core` est animé (pulsation, rotation). */
export function createSun(sunR: number): { group: THREE.Group; core: THREE.Mesh } {
  const group = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(sunR, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0xffdd44 }),
  );
  group.add(core);

  const corona: [number, number, number][] = [
    [1.35, 0xffaa22, 0.24],
    [1.75, 0xff8800, 0.13],
    [2.4, 0xff5500, 0.06],
    [3.4, 0xff3300, 0.03],
  ];

  for (const [scale, color, opacity] of corona) {
    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(sunR * scale, 32, 32),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      ),
    );
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
  const count = Math.round(THREE.MathUtils.clamp(planetCount * 75, 120, 1800));
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
