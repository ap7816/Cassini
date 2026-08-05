import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Game } from '../../features/types';
import { loadGamesFromStorage, saveGamesToStorage } from '../../features/Library/services/libraryStorage';
import { fetchRawgImage, clearRawgCacheEntry, steamCdnUrl, steamPortraitUrl } from '../../features/Library/services/rawgService';
import { launchGame } from '../../features/Library/services/launchGame';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useDialog } from '../../hooks/useDialog';
import { AppDialog } from '../../components/AppDialog/AppDialog';
import { useTranslation } from 'react-i18next';
import css from './SolarSystemPage.module.css';

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__ as unknown as { invoke?: TauriInvoke } | undefined;
  if (tauri?.invoke) return tauri.invoke<T>(cmd, args);
  const mod = await import('@tauri-apps/api/core');
  return (mod.invoke as unknown as TauriInvoke)<T>(cmd, args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PLN_R    = 4.6;
const ORB_BASE = 38;
// Base gap between two consecutive orbits — one planet per orbit, like the real thing
const ORB_STEP = 17;

// Bornes de taille des planètes. Absolues (et non dérivées du soleil) pour
// rompre la dépendance circulaire : l'écartement des orbites dépend de la plus
// grosse planète, le rayon du système de l'écartement, et le soleil du système.
const PLN_R_MIN = PLN_R * 0.45;
const PLN_R_MAX = PLN_R * 1.9;

const INIT_LOOK = new THREE.Vector3(0, 0, 0);

// Angle d'or (~137,5°). Espacer les planètes de cet angle garantit qu'elles se
// répartissent tout autour du soleil sans jamais s'aligner, quel que soit leur
// nombre — c'est la même propriété qui empêche les graines de tournesol de
// former des rangées. Un tirage purement aléatoire, lui, produit des paquets.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Real solar systems give every planet its own orbit. Spacing widens slightly
// outward (Titius–Bode-ish) so the inner system stays compact.
function orbitRadius(k: number, step: number): number {
  return ORB_BASE + step * k * (1 + k * 0.018);
}

// Rayon d'une planète d'après la taille du jeu sur le disque.
//
// La normalisation se fait sur la bibliothèque courante plutôt que sur une
// échelle absolue : le plus gros jeu occupe toujours le haut de la plage et le
// plus petit le bas, quelle que soit la bibliothèque.
//
// L'exposant 0.7 (au lieu d'une racine carrée) creuse volontairement l'écart :
// dans une bibliothèque allant jusqu'à 120 Go, un jeu de 50 Go fait environ
// 0,65× le rayon du plus gros — la différence se voit immédiatement, sans que
// les petits jeux ne deviennent des points invisibles.
const SIZE_CURVE = 0.7;
function makeRadiusScale(games: Game[]) {
  const sizes = games.map((g) => g.sizeOnDisk ?? 0).filter((s) => s > 0);

  if (sizes.length === 0) {
    // Aucune taille connue : tout le monde au même diamètre médian
    return () => (PLN_R_MIN + PLN_R_MAX) / 2;
  }

  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const span = Math.max(max - min, 1);

  return (g: Game): number => {
    const s = g.sizeOnDisk ?? 0;
    // Taille inconnue → petit, sans être le minimum absolu
    if (s <= 0) return PLN_R_MIN * 1.15;
    const t = Math.pow((s - min) / span, SIZE_CURVE);
    return PLN_R_MIN + (PLN_R_MAX - PLN_R_MIN) * t;
  };
}

const PLATFORM_COLOR: Record<string, number> = {
  Steam:     0x5ea7d4,
  Epic:      0x8fa6c2,
  BattleNet: 0x00aeef,
  Riot:      0xd13639,
  Rockstar:  0xc8a84b,
  Ubisoft:   0x4098d4,
  GOG:       0x9b59b6,
  Other:     0x7a8a9a,
};

const PLATFORM_CSS: Record<string, string> = {
  Steam:     '#5ea7d4',
  Epic:      '#8fa6c2',
  BattleNet: '#00aeef',
  Riot:      '#d13639',
  Rockstar:  '#c8a84b',
  Ubisoft:   '#4098d4',
  GOG:       '#9b59b6',
  Other:     '#7a8a9a',
};

type PlanetType = 'rocky' | 'gas' | 'oceanic' | 'lava' | 'ice';

// Palettes volontairement claires : ces planètes sont vues de loin sur fond
// noir, une teinte réaliste sombre les rendrait indiscernables.
const PALETTES: Record<PlanetType, [string, string, string]> = {
  rocky:   ['#B89A72', '#E0CBA4', '#6B4A28'],
  gas:     ['#E08F4E', '#FFC078', '#9B5210'],
  oceanic: ['#2A8FC8', '#5FD8FF', '#124878'],
  lava:    ['#E24A18', '#FF8C4A', '#A81800'],
  ice:     ['#A8D8EC', '#E8F8FF', '#4A8AC0'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function seededRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural planet texture (512×512 canvas → THREE.CanvasTexture)
// ─────────────────────────────────────────────────────────────────────────────

function makeProcTexture(seed: number): THREE.CanvasTexture {
  const sz = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const c = cv.getContext('2d')!;

  const rng = seededRng(seed);
  const types: PlanetType[] = ['rocky', 'gas', 'oceanic', 'lava', 'ice'];
  const type = types[Math.floor(rng() * types.length)];
  const [base, hi, lo] = PALETTES[type];

  c.fillStyle = base;
  c.fillRect(0, 0, sz, sz);

  if (type === 'rocky') {
    // Noise layer
    for (let i = 0; i < 3000; i++) {
      c.fillStyle = rng() < 0.5 ? hi : lo;
      c.globalAlpha = 0.08 + rng() * 0.18;
      c.fillRect(rng() * sz, rng() * sz, 1 + rng() * 3, 1 + rng() * 3);
    }
    c.globalAlpha = 1;
    // Craters
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
    // Horizontal bands
    const bands = 10 + Math.floor(rng() * 8);
    for (let i = 0; i < bands; i++) {
      c.fillStyle = i % 2 === 0 ? hi : lo;
      c.globalAlpha = 0.35 + rng() * 0.35;
      c.fillRect(0, (i / bands) * sz, sz, (1 / bands) * sz * (0.8 + rng() * 0.5));
    }
    // Storm spot
    c.beginPath();
    c.ellipse(rng() * sz, sz / 2 + (rng() - 0.5) * sz * 0.3, 40 + rng() * 60, 18 + rng() * 20, rng() * 0.3, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,200,100,0.35)';
    c.fill();
    c.globalAlpha = 1;
  } else if (type === 'oceanic') {
    // Continents
    for (let i = 0; i < 5 + Math.floor(rng() * 5); i++) {
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, 18 + rng() * 80, 0, Math.PI * 2);
      c.fillStyle = '#4a8a3a';
      c.globalAlpha = 0.7 + rng() * 0.3;
      c.fill();
    }
    c.globalAlpha = 1;
    // Polar ice caps
    c.fillStyle = 'rgba(210,240,255,0.9)';
    c.fillRect(0, 0, sz, sz * 0.07);
    c.fillRect(0, sz * 0.93, sz, sz * 0.07);
  } else if (type === 'lava') {
    // Lava cracks/veins
    for (let i = 0; i < 20; i++) {
      c.beginPath();
      c.moveTo(rng() * sz, rng() * sz);
      c.bezierCurveTo(rng() * sz, rng() * sz, rng() * sz, rng() * sz, rng() * sz, rng() * sz);
      c.strokeStyle = '#FF6600';
      c.lineWidth = 1 + rng() * 2.5;
      c.globalAlpha = 0.5 + rng() * 0.5;
      c.stroke();
    }
    // Hotspots
    for (let i = 0; i < 10; i++) {
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, 3 + rng() * 14, 0, Math.PI * 2);
      c.fillStyle = rng() < 0.5 ? '#FFCC00' : '#FF8800';
      c.globalAlpha = 0.6 + rng() * 0.4;
      c.fill();
    }
    c.globalAlpha = 1;
  } else {
    // Ice: noise
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = rng() < 0.5 ? '#FFFFFF' : '#C0D8F0';
      c.globalAlpha = 0.05 + rng() * 0.12;
      c.fillRect(rng() * sz, rng() * sz, 1 + rng() * 2, 1 + rng() * 2);
    }
    // Cracks
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

// ─────────────────────────────────────────────────────────────────────────────
// Cover art → planet texture
//
// A 460×215 banner mapped straight onto a sphere's equirectangular UVs looks
// terrible: the artwork wraps the whole globe, the title stretches into
// illegibility and both poles pinch into a smear. Instead the art is composited
// into a proper 2:1 equirectangular canvas — placed as a readable patch on one
// face, feathered into a background sampled from the artwork itself, with the
// poles faded flat so the mapping's convergence stays invisible.
// ─────────────────────────────────────────────────────────────────────────────

// Data-URLs déjà téléchargées, partagées entre planètes et entre rechargements
// de la scène (changement de launcher) pour éviter de refaire les requêtes.
const artCache = new Map<string, string>();

/// Charge une jaquette en `HTMLImageElement` exploitable par canvas.
///
/// Le téléchargement passe par Rust (`fetch_image_base64`) : les CDN qui
/// n'envoient pas d'en-tête CORS — SteamGridDB en particulier — faisaient
/// échouer `TextureLoader`, ce qui laissait la planète en texture procédurale.
/// Le data-URL obtenu ne « tainte » pas la canvas, donc l'échantillonnage des
/// couleurs reste possible.
async function loadArtImage(url: string): Promise<HTMLImageElement> {
  let dataUrl = artCache.get(url);

  if (!dataUrl) {
    dataUrl = url.startsWith('data:')
      ? url
      : await tauriInvoke<string>('fetch_image_base64', { url });
    artCache.set(url, dataUrl);
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Image illisible : ${url}`));
    img.src = dataUrl!;
  });
}

/// Mean colour of an image, used to tint the parts of the globe the artwork
/// doesn't cover so the planet reads as one object.
function averageColor(img: HTMLImageElement): { r: number; g: number; b: number } {
  const s = 16;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, s, s);

  try {
    const d = c.getImageData(0, 0, s, s).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return { r: r / n, g: g / n, b: b / n };
  } catch {
    // Canvas taintée (image chargée sans CORS) — repli neutre
    return { r: 90, g: 100, b: 120 };
  }
}

function makeGameTexture(img: HTMLImageElement, seed: number): THREE.CanvasTexture {
  const w = 1024, h = 512;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  const rng = seededRng(seed);

  // Couleur d'ambiance : la moyenne brute d'une jaquette est presque toujours
  // très sombre, ce qui donnait des billes noires indistinctes. On remonte
  // saturation et luminosité pour que la planète garde l'identité colorée du
  // jeu même vue de loin.
  const avg = averageColor(img);
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(avg.r / 255, avg.g / 255, avg.b / 255).getHSL(hsl);

  const bg = new THREE.Color().setHSL(
    hsl.h,
    Math.min(1, Math.max(0.35, hsl.s * 1.35)),
    Math.min(0.58, Math.max(0.3, hsl.l * 1.7)),
  );
  const poleCol = bg.clone().multiplyScalar(0.55);

  c.fillStyle = '#' + bg.getHexString();
  c.fillRect(0, 0, w, h);

  // La jaquette fait deux fois le tour du globe : quel que soit l'angle de
  // vue, on voit l'artwork. Une seule copie laissait une face vide.
  const bandTop = h * 0.1;
  const bandH   = h * 0.8;

  const band = document.createElement('canvas');
  band.width = w;
  band.height = Math.ceil(bandH);
  const bc = band.getContext('2d')!;

  const copies = 2;
  const cw = w / copies;
  for (let i = 0; i < copies; i++) {
    bc.drawImage(img, i * cw, 0, cw, band.height);
  }

  // Fondu vertical : l'artwork se dissout vers les pôles au lieu de s'arrêter
  // sur une arête franche (c'est ce qui dessinait un anneau sombre).
  bc.globalCompositeOperation = 'destination-in';
  const fade = bc.createLinearGradient(0, 0, 0, band.height);
  fade.addColorStop(0,    'rgba(0,0,0,0)');
  fade.addColorStop(0.22, 'rgba(0,0,0,1)');
  fade.addColorStop(0.78, 'rgba(0,0,0,1)');
  fade.addColorStop(1,    'rgba(0,0,0,0)');
  bc.fillStyle = fade;
  bc.fillRect(0, 0, w, band.height);

  c.drawImage(band, 0, bandTop);

  // Relief de surface léger — assez pour lire comme une planète, pas assez
  // pour salir l'artwork.
  c.globalAlpha = 0.07;
  for (let i = 0; i < 120; i++) {
    const x = rng() * w;
    const y = h * 0.1 + rng() * h * 0.8;
    const r = 4 + rng() * 30;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = rng() < 0.5 ? '#ffffff' : '#000000';
    c.fill();
  }
  c.globalAlpha = 1;

  // Pôles rabattus sur une couleur plate : sans ça, la convergence
  // équirectangulaire transforme la moindre variation en étoile de rayons.
  const poleH = h * 0.16;
  const poleHex = '#' + poleCol.getHexString();

  const gTop = c.createLinearGradient(0, 0, 0, poleH);
  gTop.addColorStop(0, poleHex);
  gTop.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gTop;
  c.fillRect(0, 0, w, poleH);

  const gBot = c.createLinearGradient(0, h, 0, h - poleH);
  gBot.addColorStop(0, poleHex);
  gBot.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gBot;
  c.fillRect(0, h - poleH, w, poleH);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Planetary ring texture — a 1-D strip sampled radially across the ring.
// Encodes banding, a Cassini-style division and soft edges in the alpha channel.
// ─────────────────────────────────────────────────────────────────────────────

function makeRingTexture(seed: number, base: THREE.Color): THREE.CanvasTexture {
  const w = 1024, h = 1;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(w, h);

  const rng = seededRng(seed);
  const p1 = rng() * 6.28, p2 = rng() * 6.28, p3 = rng() * 6.28;
  const f1 = 42 + rng() * 46;          // fine banding frequency
  const f2 = 11 + rng() * 12;          // broad banding frequency
  const gapPos = 0.42 + rng() * 0.28;  // Cassini division position
  const gapW   = 0.035 + rng() * 0.045;

  // Per-band brightness jitter, quantised so bands read as discrete rings
  const bands = 160;
  const jitter = Array.from({ length: bands }, () => 0.75 + rng() * 0.5);

  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);

    // Soft falloff at the inner and outer edges
    let a = Math.pow(Math.sin(Math.PI * t), 0.55);
    // Two banding frequencies stacked
    a *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * f1 + p1));
    a *= 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * f2 + p2));
    // Discrete band jitter
    a *= jitter[Math.min(bands - 1, Math.floor(t * bands))];

    // Cassini-style division: a clean gap carved out of the ring
    const d = Math.abs(t - gapPos);
    if (d < gapW) a *= Math.pow(d / gapW, 1.6);

    a = Math.max(0, Math.min(1, a)) * 0.85;

    // Icier toward the outside, dustier toward the planet
    const col = new THREE.Color().setHSL(
      hsl.h,
      hsl.s * (0.35 + 0.3 * (1 - t)),
      0.55 + 0.28 * t + 0.08 * Math.sin(t * f1 * 0.5 + p3),
    );

    const o = x * 4;
    img.data[o]     = Math.round(col.r * 255);
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

// RingGeometry's default UVs are square-mapped, which is useless for radial
// banding. Rewrite them so u runs 0→1 from the inner edge to the outer edge.
function radialRingGeometry(inner: number, outer: number, segments: number) {
  const geo = new THREE.RingGeometry(inner, outer, segments, 1);
  const pos = geo.attributes.position;
  const uv  = geo.attributes.uv;
  const v   = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Galaxy background — equirectangular nebula painted on a canvas
// ─────────────────────────────────────────────────────────────────────────────

function makeNebulaTexture(tint: number): THREE.CanvasTexture {
  const w = 2048, h = 1024;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;

  c.fillStyle = '#04060d';
  c.fillRect(0, 0, w, h);

  const rng = seededRng(tint);
  const base = new THREE.Color(tint);
  // Derive a few hue-shifted cloud colours from the platform tint.
  // Keep the shift narrow so the nebula stays in one colour family.
  const clouds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const shifted = new THREE.Color().setHSL(
      (hsl.h + (i - 2) * 0.035 + 1) % 1,
      Math.min(1, hsl.s * 0.85),
      0.09 + i * 0.025,
    );
    clouds.push('#' + shifted.getHexString());
  }

  // Soft nebula blobs — kept dim so planets and orbits stay readable.
  // Confined to the equatorial band; the poles stay flat (see below).
  // Each blob is drawn three times (x-w, x, x+w) so it wraps across the
  // texture seam instead of being clipped into a hard vertical edge.
  function blob(x: number, y: number, r: number, col: string) {
    for (const ox of [-w, 0, w]) {
      const cx = x + ox;
      if (cx + r < 0 || cx - r > w) continue;
      const g = c.createRadialGradient(cx, y, 0, cx, y, r);
      g.addColorStop(0,   col + '2a');
      g.addColorStop(0.4, col + '12');
      g.addColorStop(1,   col + '00');
      c.fillStyle = g;
      c.fillRect(cx - r, y - r, r * 2, r * 2);
    }
  }

  for (let i = 0; i < 54; i++) {
    blob(
      rng() * w,
      h * 0.25 + rng() * h * 0.5,
      100 + rng() * 320,
      clouds[Math.floor(rng() * clouds.length)],
    );
  }

  // Equirectangular mapping pinches the top and bottom rows into single points,
  // so any variation there smears into radial streaks. Fade both poles to a
  // flat colour before drawing stars so the convergence is invisible.
  const poleH = h * 0.3;
  const gTop = c.createLinearGradient(0, 0, 0, poleH);
  gTop.addColorStop(0, '#04060d');
  gTop.addColorStop(1, '#04060d00');
  c.fillStyle = gTop;
  c.fillRect(0, 0, w, poleH);

  const gBot = c.createLinearGradient(0, h, 0, h - poleH);
  gBot.addColorStop(0, '#04060d');
  gBot.addColorStop(1, '#04060d00');
  c.fillStyle = gBot;
  c.fillRect(0, h - poleH, w, poleH);

  // Distant star field — density tapers off toward the poles so the pinch
  // doesn't turn them into dense specks.
  for (let i = 0; i < 3200; i++) {
    const x = rng() * w;
    const y = rng() * h;
    // sin weighting matches how equirect texels map onto sphere area
    if (rng() > Math.sin((y / h) * Math.PI)) continue;
    const b = 170 + Math.floor(rng() * 85);
    const sz = rng() < 0.92 ? 1 : 2;
    c.fillStyle = `rgba(${b},${b},${Math.min(255, b + 30)},${0.25 + rng() * 0.75})`;
    c.fillRect(x, y, sz, sz);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping    = THREE.EquirectangularReflectionMapping;
  // Wrap horizontally so sampling across the seam blends instead of clamping
  tex.wrapS      = THREE.RepeatWrapping;
  tex.wrapT      = THREE.ClampToEdgeWrapping;
  tex.minFilter  = THREE.LinearFilter;
  tex.magFilter  = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PlanetEntry = {
  game: Game;
  mesh: THREE.Mesh;
  orbitRadius: number;
  angle: number;
  speed: number;
  paused: boolean;
  radius: number;   // planet size (varies per game)
  inc: number;      // orbital inclination
  node: number;     // longitude of the ascending node
};

// Position sur une orbite circulaire inclinée.
//
// Doit reproduire exactement les rotations appliquées au tore de l'orbite :
//   orbMesh.rotation.x = PI/2 + inc      → Rx(inc) après mise à plat en XZ
//   orbMesh.rotateOnWorldAxis(Y, node)   → Ry(node)
//
// Les deux rotations utilisent donc les conventions standard de three.js :
//   Rx(θ) : y' = y·cosθ − z·sinθ ,  z' = y·sinθ + z·cosθ
//   Ry(θ) : x' = x·cosθ + z·sinθ ,  z' = −x·sinθ + z·cosθ
function orbitPos(r: number, a: number, inc: number, node: number, out: THREE.Vector3) {
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;

  // Rx(inc) appliqué à (x, 0, z)
  const y  = -z * Math.sin(inc);
  const z2 =  z * Math.cos(inc);

  // Ry(node)
  out.set(
    x * Math.cos(node) + z2 * Math.sin(node),
    y,
    -x * Math.sin(node) + z2 * Math.cos(node),
  );
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Right panel — mirrors the library GameCard feature-for-feature
// ─────────────────────────────────────────────────────────────────────────────

const GB = 1024 ** 3;
const TB = 1024 ** 4;
function fmtBytes(b: number): string {
  if (b >= TB) return `${(b / TB).toFixed(1)} TB`;
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  return `${(b / (1024 ** 2)).toFixed(0)} MB`;
}
const lastPlayedFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

type PanelProps = {
  game: Game;
  sgdbKeySet: boolean;
  onClose: () => void;
  onUpdate: (updated: Game) => void;
  onRemove: (id: string) => void;
};

function GamePanel({ game, sgdbKeySet, onClose, onUpdate, onRemove }: PanelProps) {
  const { t } = useTranslation();
  const { dlgState, closeDialog, prompt, confirm } = useDialog();

  const isSteam = game.platform === 'Steam';
  const resolvedAppId =
    game.steamAppId ??
    (isSteam && game.id.startsWith('steam-') ? game.id.slice('steam-'.length) : null);

  const steamDirectUrl = resolvedAppId ? steamCdnUrl(resolvedAppId) : null;
  const [imgSrc, setImgSrc]       = useState<string | null>(steamDirectUrl);
  const [launching, setLaunching] = useState(false);

  const bannerUrl   = game.customImageUrl ?? imgSrc;
  const showFallback = !bannerUrl;
  const col = PLATFORM_CSS[game.platform] ?? '#7a8a9a';
  const canPlay = Boolean(game.installed && game.launchUrl);

  useEffect(() => {
    if (game.customImageUrl) return;
    if (isSteam && resolvedAppId) { setImgSrc(steamCdnUrl(resolvedAppId)); return; }
    if (!isSteam && sgdbKeySet) {
      let cancelled = false;
      fetchRawgImage(game.title).then((url) => { if (!cancelled) setImgSrc(url ?? null); });
      return () => { cancelled = true; };
    }
  }, [game.id, game.title, game.customImageUrl, resolvedAppId, isSteam, sgdbKeySet]);

  function handleImgError() {
    if (game.customImageUrl) { setImgSrc(null); return; }
    if (isSteam && resolvedAppId) {
      const portrait = steamPortraitUrl(resolvedAppId);
      if (imgSrc !== portrait) { setImgSrc(portrait); return; }
      if (sgdbKeySet) fetchRawgImage(game.title).then((url) => setImgSrc(url ?? null));
      else setImgSrc(null);
      return;
    }
    clearRawgCacheEntry(game.title.toLowerCase());
    if (sgdbKeySet) fetchRawgImage(game.title).then((url) => setImgSrc(url ?? null));
    else setImgSrc(null);
  }

  async function handleSetImage() {
    const url = await prompt(t('gameCard.imageUrlPrompt'), game.customImageUrl ?? '');
    if (url === null) return;
    onUpdate({ ...game, customImageUrl: url.trim() || undefined });
    setImgSrc(null);
  }

  async function handlePlay() {
    if (!canPlay || launching) return;
    setLaunching(true);
    try { await launchGame(game); } finally { setLaunching(false); }
  }

  async function handleRemove() {
    const ok = await confirm(t('gameCard.removeConfirm', { name: game.title }), { danger: true });
    if (ok) { onRemove(game.id); onClose(); }
  }

  const lastPlayedLabel = useMemo(() => {
    if (!game.lastPlayedAt) return t('gameCard.neverPlayed');
    const d = new Date(game.lastPlayedAt);
    if (Number.isNaN(d.getTime())) return t('gameCard.unknownDate');
    return t('gameCard.lastPlayed', { date: lastPlayedFmt.format(d) });
  }, [game.lastPlayedAt, t]);

  return (
    <div className={css.panel}>
      {/* Banner — same 460/215 ratio as library card */}
      <div className={css.panelBanner}>
        {!showFallback ? (
          <>
            <img src={bannerUrl!} alt="" className={css.panelBannerImg} onError={handleImgError} />
            {game.customImageUrl && (
              <button type="button" className={css.panelBannerEdit} onClick={handleSetImage} title={t('gameCard.editImage')}>✎</button>
            )}
          </>
        ) : (
          <div className={css.panelBannerFallback} style={{ background: `linear-gradient(135deg,${col}44,${col}11)` }}>
            <span className={css.panelBannerLetter}>{game.title.slice(0, 1).toUpperCase()}</span>
            <button type="button" className={css.panelBannerEditFallback} onClick={handleSetImage} title={t('gameCard.setImage')}>
              {t('gameCard.imageButton')}
            </button>
          </div>
        )}
        <div className={css.panelBannerGrad} />
        <button className={css.panelClose} onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      {/* Body — same structure as GameCard */}
      <div className={css.panelBody}>
        <div className={css.panelTopRow}>
          {/* Left: title + meta */}
          <div className={css.panelTitleWrap}>
            <div className={css.panelTitleRow}>
              <h2 className={css.panelTitle}>{game.title}</h2>
              <button
                type="button"
                className={[css.panelFavBtn, game.favorite ? css.panelFavBtnActive : ''].join(' ')}
                onClick={() => onUpdate({ ...game, favorite: !game.favorite })}
                aria-label={game.favorite ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
                title={game.favorite ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
              >
                {game.favorite ? '★' : '☆'}
              </button>
            </div>
            <div className={css.panelMeta}>
              <span className={css.panelBadge} style={{ background: col + '28', borderColor: col + '55', color: col }}>{game.platform}</span>
              {game.favorite && <span className={css.panelFavPill}>{t('gameCard.favorite')}</span>}
              <span className={css.panelDot}>•</span>
              <span className={css.panelMuted}>{game.installed ? t('gameCard.installed') : t('gameCard.notInstalled')}</span>
              {game.sizeOnDisk != null && game.sizeOnDisk > 0 && (
                <><span className={css.panelDot}>•</span><span className={css.panelMuted}>{fmtBytes(game.sizeOnDisk)}</span></>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className={css.panelActions}>
            <button
              type="button"
              className={[css.panelPlay, launching ? css.panelPlayLaunching : ''].join(' ')}
              onClick={handlePlay}
              disabled={!canPlay || launching}
              title={!canPlay ? t('gameCard.notAvailable') : t('gameCard.launch')}
            >
              {launching ? t('gameCard.opening') : t('gameCard.play')}
            </button>
            {game.installPath && (
              <button type="button" className={css.panelFolder}
                onClick={() => void tauriInvoke('open_folder', { path: game.installPath })}
                title={t('gameCard.openFolder')}>
                📁
              </button>
            )}
            <button type="button" className={css.panelRemove} onClick={handleRemove} title={t('gameCard.remove')}>✕</button>
          </div>
        </div>

        {/* Footer: last played */}
        <div className={css.panelLastPlayed}>{lastPlayedLabel}</div>
      </div>

      {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function SolarSystemPage() {
  const mountRef       = useRef<HTMLDivElement>(null);
  const labelsRef      = useRef<HTMLDivElement>(null);
  const clearPlanetRef = useRef<() => void>(() => {});
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [tooltip, setTooltip] = useState<{ title: string; x: number; y: number } | null>(null);
  const [games, setGames] = useState<Game[]>(() => loadGamesFromStorage());
  const { settings } = useAppSettings();

  function handleGameUpdate(updated: Game) {
    setGames(prev => {
      const next = prev.map(g => g.id === updated.id ? updated : g);
      saveGamesToStorage(next);
      return next;
    });
    setSelectedGame(updated);
  }

  function handleGameRemove(id: string) {
    setGames(prev => {
      const next = prev.filter(g => g.id !== id);
      saveGamesToStorage(next);
      return next;
    });
  }

  // Platforms present in the library, biggest first
  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) {
      const k = g.platform || 'Other';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [games]);

  const [platform, setPlatform] = useState<string>('');

  // Default to the largest platform once games are loaded
  useEffect(() => {
    if (!platform && platforms.length > 0) setPlatform(platforms[0].name);
  }, [platforms, platform]);

  // Only the selected platform's games populate the system
  const stableGames = useMemo(
    () => games.filter(g => (g.platform || 'Other') === platform),
    [games, platform],
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Guards async texture loads against landing after the scene is torn down
    let disposed = false;

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x070b12);
    container.appendChild(renderer.domElement);

    // ── Scene / Camera ─────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      20000,
    );
    // Real position is set once the system size is known (see homeCam below)
    camera.lookAt(INIT_LOOK);

    // ── Controls ───────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.minDistance    = PLN_R * 2.5;
    controls.maxDistance    = 2200;
    controls.target.copy(INIT_LOOK);

    const tint = PLATFORM_COLOR[platform] ?? 0x7a8a9a;
    const planetCount = stableGames.length;

    // Taille des planètes = taille du jeu sur le disque
    const radiusOf = makeRadiusScale(stableGames);

    // Les orbites s'écartent assez pour que la plus grosse planète possible ne
    // touche jamais sa voisine.
    const orbStep = Math.max(ORB_STEP, PLN_R_MAX * 2.3);
    const outerR = planetCount > 0 ? orbitRadius(planetCount - 1, orbStep) : ORB_BASE;

    // Every decorative element scales with the system, so a one-planet system
    // doesn't get a giant sun and a thousand boulders around it.
    // Le plancher garantit que le soleil reste plus gros que toute planète.
    const sunR = THREE.MathUtils.clamp(outerR * 0.055, PLN_R_MAX * 1.3, 26);

    // ── Galaxy background ──────────────────────────────────────────────────
    const nebulaTex = makeNebulaTexture(tint);
    scene.background = nebulaTex;

    // ── Lighting ───────────────────────────────────────────────────────────
    // decay 0 so brightness stays constant no matter how large the system grows
    scene.add(new THREE.AmbientLight(0x2a3a60, 1.1));
    const sunLight = new THREE.PointLight(0xfff2d8, 2.6, 0, 0);
    scene.add(sunLight);

    // ── Foreground star field (parallax over the nebula) ───────────────────
    {
      const n   = 5000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const starMin = Math.max(900, outerR * 2.2);
      for (let i = 0; i < n; i++) {
        const r = starMin + Math.random() * starMin * 1.4;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos[i * 3]     = r * Math.sin(p) * Math.cos(t);
        pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
        pos[i * 3 + 2] = r * Math.cos(p);
        const b = 0.7 + Math.random() * 0.3;
        col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b * 1.08;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.6,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
      })));
    }

    // ── Sun ────────────────────────────────────────────────────────────────
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(sunR, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0xffdd44 }),
    );
    scene.add(sunMesh);

    // Corona layers
    for (const [scale, color, opacity] of [
      [1.35, 0xffaa22, 0.24],
      [1.75, 0xff8800, 0.13],
      [2.4,  0xff5500, 0.06],
      [3.4,  0xff3300, 0.03],
    ] as [number, number, number][]) {
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(sunR * scale, 32, 32),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      ));
    }

    // ── Planet setup ───────────────────────────────────────────────────────

    const planets: PlanetEntry[] = [];
    const orbitLabels: { div: HTMLDivElement; world: THREE.Vector3 }[] = [];
    const planetLabels: { div: HTMLDivElement; entry: PlanetEntry }[] = [];

    // One planet per orbit — every game gets its own ring, like a real system
    const orbColor = tint;
    const tmpVec   = new THREE.Vector3();

    stableGames.forEach((g, k) => {
      const seed = hashStr(g.id);
      const rng  = seededRng(seed + 1);

      const orbit = orbitRadius(k, orbStep);

      // Inclinaison orbitale légèrement exagérée (±8,6° contre ~0–7° dans le
      // vrai système solaire) : assez pour que les orbites ne paraissent pas
      // décalquées les unes sur les autres, pas assez pour désorganiser
      // l'ensemble.
      const inc   = (seededRng(seed + 3)() - 0.5) * 0.30;
      const node  = seededRng(seed + 5)() * Math.PI * 2;
      // Le diamètre reflète l'espace disque occupé par le jeu
      const pr    = radiusOf(g);

      // Orbit ring, tilted to match the planet's orbital plane
      const orbMesh = new THREE.Mesh(
        new THREE.TorusGeometry(orbit, 0.11, 4, 220),
        new THREE.MeshBasicMaterial({
          color: orbColor,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      );
      orbMesh.rotation.set(Math.PI / 2, 0, 0);
      orbMesh.rotation.x += inc;
      orbMesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), node);
      scene.add(orbMesh);

      const appId =
        g.steamAppId ??
        (g.platform === 'Steam' && g.id.startsWith('steam-') ? g.id.slice(6) : null);

      // Start with the procedural texture so the planet is never blank, then
      // swap in the real cover art once it resolves.
      //
      // L'émissif reprend la texture : sans lui, la moitié de chaque planète
      // tournée à l'opposé du soleil est complètement noire, et de loin la
      // scène n'est qu'une poignée de billes sombres. Ici l'artwork reste
      // lisible sous tous les angles tout en gardant un vrai terminateur.
      const initialTex = makeProcTexture(seed);
      const mat = new THREE.MeshStandardMaterial({
        map: initialTex,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: initialTex,
        emissiveIntensity: 0.42,
        roughness: 0.72,
        metalness: 0.03,
      });

      // Charge une jaquette et la compose en texture de planète.
      // Le téléchargement passe par Rust : sans ça les CDN sans en-tête CORS
      // (SteamGridDB) font échouer TextureLoader, et la canvas devient taintée
      // ce qui empêcherait aussi d'échantillonner les couleurs.
      async function applyArt(url: string): Promise<boolean> {
        try {
          const img = await loadArtImage(url);
          if (disposed) return true;
          const prev = mat.map;
          const tex = makeGameTexture(img, seed);
          mat.map = tex;
          mat.emissiveMap = tex;
          mat.needsUpdate = true;
          prev?.dispose();
          return true;
        } catch {
          return false;
        }
      }

      // Ordre de priorité : image utilisateur → CDN Steam → SteamGridDB
      void (async () => {
        if (g.customImageUrl && await applyArt(g.customImageUrl)) return;

        if (appId) {
          if (await applyArt(steamCdnUrl(appId))) return;
          if (await applyArt(steamPortraitUrl(appId))) return;
        }

        const sgdb = await fetchRawgImage(g.title, null);
        if (sgdb && !disposed) await applyArt(sgdb);
      })();
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 36, 36), mat);
      mesh.rotation.z = (seededRng(seed + 7)() - 0.5) * 0.7;
      scene.add(mesh);

      // Atmosphere haze
      const atmTypes: PlanetType[] = ['rocky', 'gas', 'oceanic', 'lava', 'ice'];
      const atmType = atmTypes[Math.floor(rng() * atmTypes.length)];
      const atmCol  = new THREE.Color(PALETTES[atmType][0]);
      mesh.add(new THREE.Mesh(
        new THREE.SphereGeometry(pr * 1.13, 16, 16),
        new THREE.MeshBasicMaterial({
          color: atmCol,
          transparent: true,
          opacity: 0.1,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      ));

      // Larger planets sometimes get a ring system
      // Seuls les « gros » jeux ont droit à un système d'anneaux
      if (pr > (PLN_R_MIN + PLN_R_MAX) * 0.55 && rng() < 0.35) {
        const rInner = pr * (1.38 + rng() * 0.2);
        const rOuter = rInner * (1.6 + rng() * 0.55);
        const ringMesh = new THREE.Mesh(
          radialRingGeometry(rInner, rOuter, 128),
          new THREE.MeshBasicMaterial({
            map: makeRingTexture(seed + 13, new THREE.Color(PALETTES[atmType][1])),
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending,
          }),
        );
        // Ring sits on the planet's equator, with a little tilt variation
        ringMesh.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.35;
        ringMesh.rotation.y = (rng() - 0.5) * 0.25;
        mesh.add(ringMesh);
      }

      // Position de départ répartie tout autour du soleil via l'angle d'or.
      // Le bruit reste faible (±3,4°) : au-delà il referme les écarts que
      // l'angle d'or vient d'ouvrir et les alignements réapparaissent.
      const angle = k * GOLDEN_ANGLE + (seededRng(seed + 9)() - 0.5) * 0.12;
      // Kepler-ish : les orbites extérieures sont plus lentes
      const speed = 0.34 / Math.pow(orbit, 0.82);

      orbitPos(orbit, angle, inc, node, tmpVec);
      mesh.position.copy(tmpVec);

      const entry: PlanetEntry = {
        game: g, mesh, orbitRadius: orbit, angle, speed,
        paused: false, radius: pr, inc, node,
      };
      planets.push(entry);

      // Planet name label
      const nameDiv = document.createElement('div');
      nameDiv.className = css.planetLabel;
      nameDiv.textContent = g.title;
      labelsRef.current?.appendChild(nameDiv);
      planetLabels.push({ div: nameDiv, entry });
    });

    // Platform label sits beyond the outermost orbit
    {
      const lblDiv = document.createElement('div');
      lblDiv.className = css.orbitLabel;
      lblDiv.textContent = platform;
      lblDiv.style.color = PLATFORM_CSS[platform] ?? '#7a8a9a';
      labelsRef.current?.appendChild(lblDiv);
      orbitLabels.push({
        div: lblDiv,
        world: new THREE.Vector3(0, outerR * 0.04, -outerR * 1.5),
      });
    }

    // ── Asteroid belt ──────────────────────────────────────────────────────
    // Sits just outside the outermost orbit, drifting slowly as a whole.
    let belt: THREE.InstancedMesh | null = null;
    if (planetCount > 0) {
      // Radius, thickness, rock count and rock size all track the system size
      const beltR     = outerR * 1.34;
      const spread    = THREE.MathUtils.clamp(outerR * 0.1, 3, 44);
      const rockN     = Math.round(THREE.MathUtils.clamp(planetCount * 75, 120, 1800));
      const rockScale = THREE.MathUtils.clamp(outerR * 0.018, 0.22, 1.25);

      const rockGeo = new THREE.IcosahedronGeometry(1, 0);
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0xa89880,
        roughness: 0.9,
        metalness: 0.08,
        flatShading: true,
      });
      belt = new THREE.InstancedMesh(rockGeo, rockMat, rockN);
      const dummy = new THREE.Object3D();
      const brng  = seededRng(9001);
      for (let i = 0; i < rockN; i++) {
        const a  = brng() * Math.PI * 2;
        const rr = beltR + (brng() - 0.5) * 2 * spread;
        dummy.position.set(
          Math.cos(a) * rr,
          (brng() - 0.5) * spread * 0.3,
          Math.sin(a) * rr,
        );
        dummy.rotation.set(brng() * 6.28, brng() * 6.28, brng() * 6.28);
        const s = (0.3 + brng() * 1.1) * rockScale;
        dummy.scale.set(s, s * (0.6 + brng() * 0.7), s);
        dummy.updateMatrix();
        belt.setMatrixAt(i, dummy.matrix);
      }
      belt.instanceMatrix.needsUpdate = true;
      scene.add(belt);
    }

    // ── Camera animation ───────────────────────────────────────────────────
    // Frame the whole system: pull back proportionally to the outermost orbit
    // Wide enough to include the asteroid belt at outerR * 1.34
    const systemR = outerR * 1.55 + sunR * 2;
    // ~48° d'élévation : plus bas, les orbites s'écrasent sur une ligne et la
    // répartition autour du soleil devient illisible.
    const homeCam = new THREE.Vector3(0, systemR * 1.05, systemR * 0.95);
    camera.position.copy(homeCam);
    controls.target.copy(INIT_LOOK);
    controls.maxDistance = Math.max(900, systemR * 3.5);

    let animating = false;
    const camTargetPos  = new THREE.Vector3().copy(homeCam);
    const camTargetLook = new THREE.Vector3().copy(INIT_LOOK);

    function animateCam(pos: THREE.Vector3, look: THREE.Vector3) {
      animating = true;
      controls.enabled = false;
      camTargetPos.copy(pos);
      camTargetLook.copy(look);
    }

    // ── Click detection ────────────────────────────────────────────────────
    const raycaster  = new THREE.Raycaster();
    const mouse      = new THREE.Vector2();
    let mouseDownPos = new THREE.Vector2();
    const pickVec    = new THREE.Vector3();

    // Distant or small planets cover only a couple of pixels, so an exact
    // raycast misses them. Fall back to picking whichever planet centre is
    // closest to the cursor in screen space.
    const PICK_RADIUS_PX = 26;

    function pickPlanet(clientX: number, clientY: number): PlanetEntry | null {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((clientX - rect.left) / rect.width)  *  2 - 1,
        ((clientY - rect.top)  / rect.height) * -2 + 1,
      );

      // 1. Exact geometry hit always wins
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(planets.map(p => p.mesh), false);
      if (hits.length > 0) {
        const hit = planets.find(p => p.mesh === hits[0].object);
        if (hit) return hit;
      }

      // 2. Otherwise take the nearest planet centre within the pixel radius
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      let best: PlanetEntry | null = null;
      let bestPx = PICK_RADIUS_PX;

      for (const p of planets) {
        pickVec.copy(p.mesh.position).project(camera);
        if (pickVec.z > 1) continue; // behind the camera
        const px = (pickVec.x * 0.5 + 0.5) * rect.width;
        const py = (-pickVec.y * 0.5 + 0.5) * rect.height;
        const d  = Math.hypot(px - cx, py - cy);
        if (d < bestPx) { bestPx = d; best = p; }
      }
      return best;
    }

    function selectPlanet(p: PlanetEntry) {
      for (const pl of planets) pl.paused = true;
      setSelectedGame(p.game);

      // Camera: close-up view of the planet (slightly above + in front)
      const pp = p.mesh.position;
      const offset = new THREE.Vector3(0, p.radius * 3.2, p.radius * 7);
      animateCam(pp.clone().add(offset), pp.clone());
    }

    function clearPlanet() {
      for (const pl of planets) pl.paused = false;
      setSelectedGame(null);
      animateCam(homeCam.clone(), INIT_LOOK.clone());
    }
    clearPlanetRef.current = clearPlanet;

    function onMouseDown(e: MouseEvent) {
      mouseDownPos.set(e.clientX, e.clientY);
    }

    function onMouseUp(e: MouseEvent) {
      if (new THREE.Vector2(e.clientX, e.clientY).distanceTo(mouseDownPos) > 6) return;
      const hit = pickPlanet(e.clientX, e.clientY);
      if (hit) selectPlanet(hit);
      else clearPlanet();
    }

    function onMouseMove(e: MouseEvent) {
      const hit = pickPlanet(e.clientX, e.clientY);
      if (hit) {
        setTooltip({ title: hit.game.title, x: e.clientX, y: e.clientY });
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setTooltip(null);
        renderer.domElement.style.cursor = '';
      }
    }

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup',   onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    // ── Resize ─────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // ── Animation loop ─────────────────────────────────────────────────────
    let prevT = performance.now();
    let rafId = 0;

    function tick(t: number) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min((t - prevT) / 1000, 0.1);
      prevT = t;

      // Everything freezes together while a planet is selected
      const anyPaused = planets.length > 0 && planets[0].paused;

      // Orbit planets along their own inclined orbital planes
      for (const p of planets) {
        if (!p.paused) {
          p.angle += p.speed * dt;
          orbitPos(p.orbitRadius, p.angle, p.inc, p.node, p.mesh.position);
        }
        // Spin planet on its axis
        p.mesh.rotation.y += 0.05 * dt;
      }

      // Sun pulse
      const pulse = 1 + Math.sin(t * 0.0008) * 0.03;
      sunMesh.scale.setScalar(pulse);
      sunMesh.rotation.y += 0.01 * dt;

      // Asteroid belt drifts as one body
      if (belt && !anyPaused) belt.rotation.y += 0.0015 * dt;

      // Camera animation lerp
      if (animating) {
        camera.position.lerp(camTargetPos, 0.06);
        controls.target.lerp(camTargetLook, 0.06);

        // Threshold scales with the system so big systems don't crawl at the end
        if (camera.position.distanceTo(camTargetPos) < Math.max(0.4, systemR * 0.004)) {
          animating = false;
          controls.enabled = true;
        }
      }

      // Damping moves the camera here, so this must run BEFORE the labels are
      // projected — otherwise they lag the render by one frame and jitter.
      controls.update();
      camera.updateMatrixWorld();

      // Update label positions via camera projection
      const labelsEl = labelsRef.current;
      if (labelsEl) {
        const w2 = labelsEl.clientWidth  / 2;
        const h2 = labelsEl.clientHeight / 2;
        // In overview (camera far from origin), show orbit labels; hide when zoomed in
        const camDist = camera.position.length();
        const overview = camDist > systemR * 0.55;

        for (const lbl of orbitLabels) {
          if (!overview) { lbl.div.style.display = 'none'; continue; }
          const projected = lbl.world.clone().project(camera);
          if (projected.z > 1) {
            lbl.div.style.display = 'none';
          } else {
            lbl.div.style.display = '';
            // Whole pixels only — subpixel values make the text shimmer
            const x = Math.round(projected.x * w2 + w2);
            const y = Math.round(-projected.y * h2 + h2);
            lbl.div.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
          }
        }

        for (const lbl of planetLabels) {
          const worldPos = lbl.entry.mesh.position.clone();
          const distToCam = camera.position.distanceTo(worldPos);
          worldPos.y -= lbl.entry.radius * 1.9;
          const projected = worldPos.project(camera);
          if (projected.z > 1 || distToCam > systemR * 2.6) {
            lbl.div.style.display = 'none';
          } else {
            // Fade out labels that are far away, relative to the system size
            const fadeFrom = systemR * 0.5;
            const fadeSpan = systemR * 1.8;
            const opacity = Math.max(0.18, Math.min(1, 1 - (distToCam - fadeFrom) / fadeSpan));
            lbl.div.style.display = '';
            const x = Math.round(projected.x * w2 + w2);
            const y = Math.round(-projected.y * h2 + h2);
            lbl.div.style.transform = `translate(-50%,0) translate(${x}px,${y}px)`;
            lbl.div.style.opacity = String(opacity);
          }
        }
      }

      renderer.render(scene, camera);
    }

    rafId = requestAnimationFrame(tick);

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup',   onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      controls.dispose();
      nebulaTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      // Clear all HTML labels so they don't accumulate on StrictMode re-mount
      if (labelsRef.current) labelsRef.current.innerHTML = '';
    };
  }, [stableGames, platform, settings.sgdbKeySet]);

  return (
    <div className={css.page}>
      {/* Three.js renders into this div */}
      <div ref={mountRef} className={css.canvas} />
      {/* HTML labels overlay — positioned via camera projection each frame */}
      <div ref={labelsRef} className={css.labels} />

      {/* Launcher selector */}
      <div className={css.selector}>
        <label className={css.selectorLabel}>Launcher</label>
        <div className={css.selectorRow}>
          <span
            className={css.selectorDot}
            style={{ background: PLATFORM_CSS[platform] ?? '#7a8a9a' }}
          />
          <select
            className={css.select}
            value={platform}
            onChange={(e) => {
              clearPlanetRef.current();
              setPlatform(e.target.value);
            }}
          >
            {platforms.map(p => (
              <option key={p.name} value={p.name}>
                {p.name} — {p.count} {p.count > 1 ? 'jeux' : 'jeu'}
              </option>
            ))}
          </select>
        </div>
        <div className={css.selectorHint}>
          {stableGames.length} planète{stableGames.length > 1 ? 's' : ''} en orbite
        </div>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className={css.tooltip}
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.title}
        </div>
      )}
      {selectedGame && (
        <GamePanel
          key={selectedGame.id}
          game={selectedGame}
          sgdbKeySet={settings.sgdbKeySet}
          onClose={() => clearPlanetRef.current()}
          onUpdate={handleGameUpdate}
          onRemove={handleGameRemove}
        />
      )}
    </div>
  );
}
