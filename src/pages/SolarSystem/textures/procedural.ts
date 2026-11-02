import * as THREE from 'three';
import { PALETTES, PLANET_TYPES, type PlanetType } from '../constants';
import { seededRng } from '../lib/random';

/**
 * Texture de repli bon marché, utilisée le temps que la jaquette arrive.
 *
 * Optimisation : auparavant chaque planète recevait d'emblée la texture
 * procédurale complète ci-dessous (canvas 512×512, jusqu'à 4000 opérations de
 * dessin), immédiatement jetée dès que la jaquette se chargeait — c'est-à-dire
 * presque toujours. Sur une bibliothèque de 20 jeux, cela représentait ~80 000
 * opérations canvas synchrones au montage de la scène, soit un blocage visible.
 * Un dégradé 4×4 coûte quelques microsecondes et suffit tant que l'image réelle
 * n'est pas là.
 */
export function makePlaceholderTexture(seed: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 4;
  const c = cv.getContext('2d')!;

  const rng = seededRng(seed);
  const [base] = PALETTES[PLANET_TYPES[Math.floor(rng() * PLANET_TYPES.length)]];
  c.fillStyle = base;
  c.fillRect(0, 0, 4, 4);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Texture de planète générée de toutes pièces, pour les jeux dont aucune
 * jaquette n'a pu être récupérée. N'est appelée que dans ce cas — voir
 * `makePlaceholderTexture` pour la raison.
 */
export function makeProcTexture(seed: number): THREE.CanvasTexture {
  const sz = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const c = cv.getContext('2d')!;

  const rng = seededRng(seed);
  const type: PlanetType = PLANET_TYPES[Math.floor(rng() * PLANET_TYPES.length)];
  const [base, hi, lo] = PALETTES[type];

  c.fillStyle = base;
  c.fillRect(0, 0, sz, sz);

  if (type === 'rocky') {
    for (let i = 0; i < 3000; i++) {
      c.fillStyle = rng() < 0.5 ? hi : lo;
      c.globalAlpha = 0.08 + rng() * 0.18;
      c.fillRect(rng() * sz, rng() * sz, 1 + rng() * 3, 1 + rng() * 3);
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 7 + Math.floor(rng() * 8); i++) {
      const cr = 5 + rng() * 28;
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, cr, 0, Math.PI * 2);
      c.fillStyle = lo;
      c.globalAlpha = 0.55 + rng() * 0.45;
      c.fill();
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, cr * 0.6, 0, Math.PI * 2);
      c.fillStyle = hi;
      c.globalAlpha = 0.2;
      c.fill();
    }
  } else if (type === 'gas') {
    const bands = 10 + Math.floor(rng() * 8);
    for (let i = 0; i < bands; i++) {
      c.fillStyle = i % 2 === 0 ? hi : lo;
      c.globalAlpha = 0.35 + rng() * 0.35;
      c.fillRect(0, (i / bands) * sz, sz, (1 / bands) * sz * (0.8 + rng() * 0.5));
    }
    c.beginPath();
    c.ellipse(
      rng() * sz,
      sz / 2 + (rng() - 0.5) * sz * 0.3,
      40 + rng() * 60,
      18 + rng() * 20,
      rng() * 0.3,
      0,
      Math.PI * 2,
    );
    c.fillStyle = 'rgba(255,200,100,0.35)';
    c.fill();
    c.globalAlpha = 1;
  } else if (type === 'oceanic') {
    for (let i = 0; i < 5 + Math.floor(rng() * 5); i++) {
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, 18 + rng() * 80, 0, Math.PI * 2);
      c.fillStyle = '#4a8a3a';
      c.globalAlpha = 0.7 + rng() * 0.3;
      c.fill();
    }
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(210,240,255,0.9)';
    c.fillRect(0, 0, sz, sz * 0.07);
    c.fillRect(0, sz * 0.93, sz, sz * 0.07);
  } else if (type === 'lava') {
    for (let i = 0; i < 20; i++) {
      c.beginPath();
      c.moveTo(rng() * sz, rng() * sz);
      c.bezierCurveTo(rng() * sz, rng() * sz, rng() * sz, rng() * sz, rng() * sz, rng() * sz);
      c.strokeStyle = '#FF6600';
      c.lineWidth = 1 + rng() * 2.5;
      c.globalAlpha = 0.5 + rng() * 0.5;
      c.stroke();
    }
    for (let i = 0; i < 10; i++) {
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, 3 + rng() * 14, 0, Math.PI * 2);
      c.fillStyle = rng() < 0.5 ? '#FFCC00' : '#FF8800';
      c.globalAlpha = 0.6 + rng() * 0.4;
      c.fill();
    }
    c.globalAlpha = 1;
  } else {
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = rng() < 0.5 ? '#FFFFFF' : '#C0D8F0';
      c.globalAlpha = 0.05 + rng() * 0.12;
      c.fillRect(rng() * sz, rng() * sz, 1 + rng() * 2, 1 + rng() * 2);
    }
    for (let i = 0; i < 12; i++) {
      c.beginPath();
      c.moveTo(rng() * sz, rng() * sz);
      c.lineTo(rng() * sz, rng() * sz);
      c.strokeStyle = '#6090a8';
      c.lineWidth = 0.8;
      c.globalAlpha = 0.4 + rng() * 0.4;
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Type d'atmosphère associé à une planète, dérivé de la même graine. */
export function atmosphereType(rng: () => number): PlanetType {
  return PLANET_TYPES[Math.floor(rng() * PLANET_TYPES.length)];
}
