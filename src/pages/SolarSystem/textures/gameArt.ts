import * as THREE from 'three';
import { seededRng } from '../lib/random';
import { tauriInvoke } from '../../../services/tauri';

// ─────────────────────────────────────────────────────────────────────────────
// Jaquette → texture de planète
//
// Une bannière 460×215 plaquée directement sur les UV équirectangulaires d'une
// sphère rend très mal : l'artwork fait le tour du globe, le titre s'étire
// jusqu'à l'illisibilité et les deux pôles s'écrasent en éventail. On la
// recompose donc dans une vraie canvas 2:1, en bande équatoriale, avec un fond
// dérivé de l'image elle-même et des pôles rabattus à plat.
// ─────────────────────────────────────────────────────────────────────────────

// Data-URLs déjà téléchargées, partagées entre planètes et entre rechargements
// de la scène (changement de launcher) pour éviter de refaire les requêtes.
const artCache = new Map<string, string>();

/**
 * Charge une jaquette en `HTMLImageElement` exploitable par canvas.
 *
 * Le téléchargement passe par Rust (`fetch_image_base64`) : les CDN qui
 * n'envoient pas d'en-tête CORS — SteamGridDB en particulier — faisaient
 * échouer `TextureLoader`, ce qui laissait la planète en texture procédurale.
 * Le data-URL obtenu ne « tainte » pas la canvas, donc l'échantillonnage des
 * couleurs reste possible.
 */
export async function loadArtImage(url: string): Promise<HTMLImageElement> {
  let dataUrl = artCache.get(url);

  if (!dataUrl) {
    dataUrl = url.startsWith('data:')
      ? url
      : await tauriInvoke<string>('fetch_image_base64', { url });
    artCache.set(url, dataUrl);
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image illisible : ${url}`));
    img.src = dataUrl;
  });
}

/**
 * Couleur moyenne d'une image, utilisée pour teinter les parties du globe que
 * l'artwork ne couvre pas, afin que la planète se lise comme un seul objet.
 */
function averageColor(img: HTMLImageElement): { r: number; g: number; b: number } {
  const s = 16;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, s, s);

  try {
    const d = c.getImageData(0, 0, s, s).data;
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    return { r: r / n, g: g / n, b: b / n };
  } catch {
    // Canvas taintée (image chargée sans CORS) — repli neutre
    return { r: 90, g: 100, b: 120 };
  }
}

export function makeGameTexture(img: HTMLImageElement, seed: number): THREE.CanvasTexture {
  const w = 1024,
    h = 512;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
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
  const bandH = h * 0.8;

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
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.22, 'rgba(0,0,0,1)');
  fade.addColorStop(0.78, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
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
