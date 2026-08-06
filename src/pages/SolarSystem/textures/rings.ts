import * as THREE from 'three';
import { seededRng } from '../lib/random';

/**
 * Texture d'anneau planétaire : une bande 1-D échantillonnée radialement.
 * Encode le rubanage, une division type Cassini et des bords fondus dans le
 * canal alpha.
 */
export function makeRingTexture(seed: number, base: THREE.Color): THREE.CanvasTexture {
  const w = 1024, h = 1;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(w, h);

  const rng = seededRng(seed);
  const p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28;
  const f1 = 42 + rng() * 46;         // fréquence de rubanage fin
  const f2 = 11 + rng() * 12;         // fréquence de rubanage large
  const gapPos = 0.42 + rng() * 0.28; // position de la division de Cassini
  const gapW = 0.035 + rng() * 0.045;

  // Variation de luminosité par bande, quantifiée pour que les anneaux se
  // lisent comme des cercles distincts
  const bands = 160;
  const jitter = Array.from({ length: bands }, () => 0.75 + rng() * 0.5);

  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  // Une seule instance réutilisée : en créer une par pixel allouait 1024
  // objets Color par anneau pour rien.
  const col = new THREE.Color();

  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);

    // Atténuation douce aux bords intérieur et extérieur
    let a = Math.pow(Math.sin(Math.PI * t), 0.55);
    // Deux fréquences de rubanage superposées
    a *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * f1 + p1));
    a *= 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * f2 + p2));
    // Variation discrète par bande
    a *= jitter[Math.min(bands - 1, Math.floor(t * bands))];

    // Division type Cassini : un vide net creusé dans l'anneau
    const d = Math.abs(t - gapPos);
    if (d < gapW) a *= Math.pow(d / gapW, 1.6);

    a = Math.max(0, Math.min(1, a)) * 0.85;

    // Plus glacé vers l'extérieur, plus poussiéreux vers la planète
    col.setHSL(
      hsl.h,
      hsl.s * (0.35 + 0.3 * (1 - t)),
      0.55 + 0.28 * t + 0.08 * Math.sin(t * f1 * 0.5 + p3),
    );

    const o = x * 4;
    img.data[o] = Math.round(col.r * 255);
    img.data[o + 1] = Math.round(col.g * 255);
    img.data[o + 2] = Math.round(col.b * 255);
    img.data[o + 3] = Math.round(a * 255);
  }

  c.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * Les UV par défaut de `RingGeometry` sont mappées en carré, ce qui est
 * inutilisable pour un rubanage radial. On les réécrit pour que `u` aille de 0
 * (bord intérieur) à 1 (bord extérieur).
 */
export function radialRingGeometry(
  inner: number,
  outer: number,
  segments: number,
): THREE.RingGeometry {
  const geo = new THREE.RingGeometry(inner, outer, segments, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}
