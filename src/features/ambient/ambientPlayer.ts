// Lecteur de musique d'ambiance — singleton module-level pour éviter plusieurs instances audio.
// Indépendant du lecteur musical principal.
//
// Enchaîne les pistes de `tracks.ts` : une au hasard au lancement, puis la
// suivante à chaque fin de morceau. Les crédits y sont recensés.

import {
  readAmbientEnabled,
  writeAmbientEnabled,
  readAmbientVolume,
  writeAmbientVolume,
} from '../../services/storage';
import { AMBIENT_TRACKS, ambientIndexOf, randomAmbientIndex } from './tracks';

let _audio: HTMLAudioElement | null = null;
let _enabled = false;
let _volume = 0.25;
let _index = 0;
/** Pistes introuvables enchaînées ; remis à zéro dès qu'une démarre. */
let _misses = 0;
let _wired = false;
/** Fondu de fin déjà armé pour la piste en cours. */
let _fadingOut = false;
const _listeners = new Set<() => void>();

// Retourne true si l'ambiance est active et en lecture
export function isAmbientPlaying(): boolean {
  return _enabled && !!_audio && !_audio.paused;
}

function notify(): void {
  _listeners.forEach((fn) => fn());
}

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    // Sans élément hérité du préchargeur, on tire la piste de départ ici.
    _index = randomAmbientIndex();
    _audio = new Audio(AMBIENT_TRACKS[_index]);
    _audio.volume = _volume;
  }
  return _audio;
}

/** Charge la piste suivante et l'enchaîne, en fondu entrant. */
function playNext(): void {
  const audio = getAudio();
  _index = (_index + 1) % AMBIENT_TRACKS.length;
  _fadingOut = false;
  audio.src = AMBIENT_TRACKS[_index];
  // Démarre à zéro : la piste précédente s'est éteinte en fondu, entrer à
  // plein volume annulerait tout le bénéfice de la transition.
  audio.volume = 0;
  audio.play().catch(() => {});
  fadeTo(_volume, TRACK_FADE_MS);
}

/**
 * Branche l'enchaînement des pistes.
 *
 * `loop` est explicitement désactivé : tant qu'il est actif, le navigateur
 * reboucle sur place et n'émet jamais `ended` — la piste ne changerait
 * jamais.
 */
function wire(audio: HTMLAudioElement): void {
  if (_wired) return;
  _wired = true;
  audio.loop = false;

  audio.addEventListener('ended', () => {
    if (_enabled) playNext();
  });

  // Piste absente ou illisible : on passe à la suivante au lieu de rester
  // muet. Le compteur évite de parcourir la liste indéfiniment si aucune
  // n'est disponible.
  audio.addEventListener('error', () => {
    if (!_enabled) return;
    if (++_misses >= AMBIENT_TRACKS.length) return;
    playNext();
  });

  audio.addEventListener('playing', () => {
    _misses = 0;
  });

  // Fondu de fin de piste, armé à l'approche de la fin.
  //
  // `timeupdate` ne se déclenche que quelques fois par seconde : c'est assez
  // pour armer le fondu, beaucoup trop peu pour le dessiner — d'où le relais
  // par `fadeTo`, qui travaille à 50 Hz.
  audio.addEventListener('timeupdate', () => {
    if (!_enabled || _fadingOut) return;

    const { duration, currentTime } = audio;
    // Inconnue tant que les métadonnées ne sont pas lues, et infinie sur un
    // flux : dans les deux cas il n'y a pas de fin à anticiper.
    if (!Number.isFinite(duration) || duration <= 0) return;

    const restant = (duration - currentTime) * 1000;
    if (restant > TRACK_FADE_MS) return;

    _fadingOut = true;
    // Si l'on franchit le seuil en retard, on ne fond que sur le temps qui
    // reste réellement, sinon la piste se couperait en plein fondu.
    fadeTo(0, Math.max(FADE_TICK_MS, restant));
  });
}

// À appeler une fois au démarrage, après initStorage()
export function initAmbient(): void {
  // Adopte l'élément audio du preloader s'il existe — évite toute coupure à la transition
  if (!_audio) {
    const pre = document.getElementById('preloader-ambient') as HTMLAudioElement | null;
    if (pre) _audio = pre;
  }

  _enabled = readAmbientEnabled();
  _volume = readAmbientVolume();
  const audio = getAudio();
  audio.volume = _volume;

  // Reprend la piste déjà choisie par le préchargeur, sinon la première
  // transition sauterait à un morceau sans rapport avec celui qu'on entend.
  const started = ambientIndexOf(audio.currentSrc || audio.src);
  if (started >= 0) _index = started;

  wire(audio);

  if (_enabled) {
    if (audio.paused) {
      audio.play().catch(() => {});
    }
    // Sinon déjà en lecture depuis le preloader — rien à faire
  } else {
    audio.pause();
  }
}

export function getAmbientEnabled(): boolean {
  return _enabled;
}
export function getAmbientVolume(): number {
  return _volume;
}

export function setAmbientEnabled(v: boolean): void {
  _enabled = v;
  writeAmbientEnabled(v);
  const audio = getAudio();
  // Une action explicite l'emporte sur un fondu en cours. Sans cette coupure,
  // réactiver l'ambiance pendant un fondu de fin la relancerait à volume nul,
  // puis le fondu résiduel finirait de la faire taire.
  clearFade();
  if (v && _suspensions.size === 0) {
    audio.volume = _volume;
    audio.play().catch(() => {});
  } else {
    // Activée mais retenue : elle reprendra d'elle-même à la levée du motif.
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

/** Fondu court, pour céder la place au lecteur principal et la reprendre. */
const FADE_MS = 600;
/** Fondu de fin de piste, nettement plus long : c'est un enchaînement musical
 *  et non une interruption, l'oreille attend une transition douce. */
const TRACK_FADE_MS = 2200;
/** Cadence des paliers — 50 Hz, imperceptible à l'oreille et sans coût. */
const FADE_TICK_MS = 20;

let _fadeTimer: ReturnType<typeof setInterval> | null = null;

function clearFade(): void {
  if (_fadeTimer) {
    clearInterval(_fadeTimer);
    _fadeTimer = null;
  }
}

/**
 * Amène le volume à `target` en `ms`, puis appelle `onDone`.
 *
 * Le dernier palier écrit la valeur cible telle quelle : accumuler des pas
 * flottants laisse sinon un résidu, et un volume qui s'arrête à 0.003 au lieu
 * de 0 reste faiblement audible.
 */
function fadeTo(target: number, ms: number, onDone?: () => void): void {
  const audio = getAudio();
  clearFade();

  const steps = Math.max(1, Math.round(ms / FADE_TICK_MS));
  const step = (target - audio.volume) / steps;
  let left = steps;

  _fadeTimer = setInterval(() => {
    left -= 1;
    audio.volume = left <= 0 ? target : Math.min(1, Math.max(0, audio.volume + step));
    if (left <= 0) {
      clearFade();
      onDone?.();
    }
  }, FADE_TICK_MS);
}

/**
 * Raisons de suspendre l'ambiance.
 *
 * Un ensemble, et non un booléen : les motifs se cumulent, et lever l'un ne
 * doit pas passer outre les autres. Un morceau du lecteur qui démarre pendant
 * que la fenêtre est réduite, puis la fenêtre qu'on rouvre — avec un simple
 * drapeau, l'ambiance repartirait par-dessus le morceau.
 */
/**
 * Ce qui fait taire l'ambiance : le lecteur de musique, une fenêtre qui n'est
 * plus à l'écran, ou la musique d'un événement rare du ciel.
 */
export type AmbientSuspension = 'music' | 'window' | 'evenement';

const _suspensions = new Set<AmbientSuspension>();

/** L'ambiance est-elle retenue par au moins un motif ? */
export function isAmbientSuspended(): boolean {
  return _suspensions.size > 0;
}

/** Suspend l'ambiance pour le motif donné. Idempotent. */
export function suspendAmbient(reason: AmbientSuspension): void {
  const nouveau = !_suspensions.has(reason);
  _suspensions.add(reason);
  const audio = getAudio();

  if (reason === 'window') {
    // Coupure franche, sans fondu.
    //
    // Un fondu s'appuie sur `setInterval`, or le moteur bride les minuteurs
    // d'une fenêtre qui n'est plus à l'écran — de l'ordre d'un tick par
    // seconde. Les trente paliers du fondu s'étaleraient alors sur une
    // demi-minute de musique qu'on croyait avoir arrêtée. Et réduire une
    // fenêtre est un geste qui demande le silence tout de suite.
    //
    // Exécutée même si un autre motif retient déjà l'ambiance : celui-ci a pu
    // demander un fondu qui n'est pas terminé, et ce fondu ne s'achèvera plus
    // une fois la fenêtre masquée. Sans cela, réduire pendant la première
    // seconde d'un morceau laissait l'ambiance audible en sourdine.
    clearFade();
    audio.pause();
    audio.volume = _volume;
    return;
  }

  // Motif déjà posé, ou ambiance déjà retenue par un autre : rien à couper une
  // seconde fois.
  if (!nouveau || _suspensions.size > 1) return;
  if (audio.paused) return;

  fadeTo(0, FADE_MS, () => {
    audio.pause();
    audio.volume = _volume; // restaure pour le prochain fondu entrant
  });
}

/** Lève le motif donné, et relance si plus rien ne retient l'ambiance. */
export function resumeAmbient(reason: AmbientSuspension): void {
  // Motif absent : rien à lever. Sans ce test, un appel en double relancerait
  // l'ambiance alors qu'un autre motif la retient encore.
  if (!_suspensions.delete(reason)) return;
  if (_suspensions.size > 0) return;
  if (!_enabled) return;

  const audio = getAudio();
  // Si déjà en lecture (ex: montage initial), ne pas interrompre
  if (!audio.paused) return;
  audio.volume = 0;
  audio.play().catch(() => {});
  fadeTo(_volume, FADE_MS);
}

export function subscribeAmbient(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
