// Lecteur de musique d'ambiance — singleton module-level pour éviter plusieurs instances audio.
// Indépendant du lecteur musical principal.
//
// Musique : "Space Galaxy Universe Music" — viacheslavstarostin (Pixabay, ID 473849)
// Licence : Pixabay Content License (libre d'utilisation, aucune attribution requise)

import {
  readAmbientEnabled, writeAmbientEnabled,
  readAmbientVolume, writeAmbientVolume,
} from '../../services/storage';

let _audio: HTMLAudioElement | null = null;
let _enabled = false;
let _volume = 0.25;
const _listeners = new Set<() => void>();

// Retourne true si l'ambiance est active et en lecture
export function isAmbientPlaying(): boolean {
  return _enabled && !!_audio && !_audio.paused;
}

function notify(): void {
  _listeners.forEach(fn => fn());
}

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio('./ambiant.mp3');
    _audio.loop = true;
    _audio.volume = _volume;
  }
  return _audio;
}

// À appeler une fois au démarrage, après initStorage()
export function initAmbient(): void {
  // Adopte l'élément audio du preloader s'il existe — évite toute coupure à la transition
  if (!_audio) {
    const pre = document.getElementById('preloader-ambient') as HTMLAudioElement | null;
    if (pre) {
      _audio = pre;
      _audio.loop = true;
    }
  }

  _enabled = readAmbientEnabled();
  _volume = readAmbientVolume();
  const audio = getAudio();
  audio.volume = _volume;

  if (_enabled) {
    if (audio.paused) {
      audio.play().catch(() => {});
    }
    // Sinon déjà en lecture depuis le preloader — rien à faire
  } else {
    audio.pause();
  }

}

export function getAmbientEnabled(): boolean { return _enabled; }
export function getAmbientVolume(): number   { return _volume; }

export function setAmbientEnabled(v: boolean): void {
  _enabled = v;
  writeAmbientEnabled(v);
  const audio = getAudio();
  if (v) {
    audio.play().catch(() => {});
  } else {
    audio.pause();
  }
  notify();
}

export function setAmbientVolume(v: number): void {
  _volume = v;
  writeAmbientVolume(v);
  getAudio().volume = v;
  notify();
}

const FADE_MS   = 600;
const FADE_STEPS = 30;

let _fadeTimer: ReturnType<typeof setInterval> | null = null;

function clearFade(): void {
  if (_fadeTimer) { clearInterval(_fadeTimer); _fadeTimer = null; }
}

// Fondu sortant → pause (garde la position courante)
export function pauseAmbientForMusic(): void {
  const audio = getAudio();
  if (audio.paused) return;
  clearFade();
  const startVol = audio.volume;
  const step     = startVol / FADE_STEPS;
  _fadeTimer = setInterval(() => {
    audio.volume = Math.max(0, audio.volume - step);
    if (audio.volume <= 0) {
      clearFade();
      audio.pause();
      audio.volume = _volume; // restaure pour le prochain fondu entrant
    }
  }, FADE_MS / FADE_STEPS);
}

// Fondu entrant → reprend là où elle s'était arrêtée
export function resumeAmbientAfterMusic(): void {
  if (!_enabled) return;
  const audio = getAudio();
  // Si déjà en lecture (ex: montage initial, music.isPlaying=false), ne pas interrompre
  if (!audio.paused) return;
  clearFade();
  audio.volume = 0;
  audio.play().catch(() => {});
  const step = _volume / FADE_STEPS;
  _fadeTimer = setInterval(() => {
    audio.volume = Math.min(_volume, audio.volume + step);
    if (audio.volume >= _volume) { audio.volume = _volume; clearFade(); }
  }, FADE_MS / FADE_STEPS);
}

export function subscribeAmbient(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
