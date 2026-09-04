/// <reference lib="webworker" />

/**
 * Dessine le tunnel de traversée hors du fil principal.
 *
 * Raison d'être : changer de launcher détruit puis reconstruit toute la scène
 * 3D — planètes, textures, ceinture, portails. C'est synchrone, et mesuré à
 * 222 ms sur une bibliothèque de soixante jeux. Une animation pilotée par
 * `requestAnimationFrame` s'arrête net pendant ce temps, en plein vol : le
 * tunnel se figeait précisément là où il devait donner l'impression de vitesse.
 *
 * Un worker n'est pas bloqué par le fil principal, et une `OffscreenCanvas`
 * transférée est composée sans lui repasser. Le tunnel continue donc de couler
 * pendant que la scène suivante se construit.
 */

import { dessinerTunnel, semerParticules, type Particule } from './warpTunnel';

type Demarrer = {
  type: 'demarrer';
  canvas?: OffscreenCanvas;
  largeur: number;
  hauteur: number;
  dpr: number;
  dureeMs: number;
  tint: string;
};

type Message =
  | Demarrer
  | { type: 'teinte'; tint: string }
  | { type: 'arreter' };

let ctx: OffscreenCanvasRenderingContext2D | null = null;
let canvas: OffscreenCanvas | null = null;
let largeur = 0;
let hauteur = 0;
let particules: Particule[] = [];
let dureeMs = 800;
let tint = '#ffffff';
let debut = 0;
let minuteur: ReturnType<typeof setInterval> | undefined;

/** ~60 images par seconde. Un worker n'a pas de `requestAnimationFrame`. */
const PERIODE_MS = 16;

function arreter(): void {
  if (minuteur !== undefined) {
    clearInterval(minuteur);
    minuteur = undefined;
  }
  // La dernière image resterait affichée si le voyage était interrompu avant
  // l'extinction des traits.
  if (ctx && canvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function image(): void {
  if (!ctx) return;
  const u = Math.min((performance.now() - debut) / dureeMs, 1);
  dessinerTunnel(ctx, { largeur, hauteur, u, particules, tint });
  if (u >= 1) arreter();
}

self.onmessage = (e: MessageEvent<Message>) => {
  const m = e.data;

  if (m.type === 'teinte') {
    tint = m.tint;
    return;
  }

  if (m.type === 'arreter') {
    arreter();
    return;
  }

  // Le transfert n'a lieu qu'une fois : une canvas ne peut céder son contrôle
  // qu'à un seul destinataire, et les voyages suivants réutilisent la même.
  if (m.canvas) {
    canvas = m.canvas;
    ctx = canvas.getContext('2d');
  }
  if (!ctx || !canvas) return;

  arreter();

  largeur = m.largeur;
  hauteur = m.hauteur;
  dureeMs = m.dureeMs;
  tint = m.tint;

  canvas.width = Math.round(m.largeur * m.dpr);
  canvas.height = Math.round(m.hauteur * m.dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(m.dpr, m.dpr);

  particules = semerParticules();
  debut = performance.now();
  image();
  minuteur = setInterval(image, PERIODE_MS);
};
