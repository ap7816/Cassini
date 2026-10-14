/**
 * La musique des événements rares du ciel.
 *
 * Une supernova, la comète bleue, le trou noir : trois choses qu'on ne voit
 * qu'une fois ou deux par session, et qui méritent qu'on lève les yeux. Une
 * musique les annonce — celle que l'application apporte, ou celle que
 * l'utilisateur a choisie sur sa machine.
 *
 * Le morceau n'est pas bouclé : il dure ce qu'il dure, et s'éteint en fondu
 * quand l'événement se termine si le morceau est plus long que lui.
 *
 * L'ambiance se tait pendant ce temps, comme elle le fait déjà quand le lecteur
 * de musique joue : deux musiques à la fois ne sont pas deux fois mieux.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { readAmbientVolume } from '../../services/storage';
import { resumeAmbient, suspendAmbient } from '../ambient/ambientPlayer';

/**
 * Les musiques fournies : tout ce qui se trouve dans `pistes/`.
 *
 * Le dossier est ramassé à la construction, et un morceau y est **tiré au sort
 * à chaque événement**. Déposer un fichier suffit donc à l'ajouter : rien à
 * déclarer ici, et deux événements de suite n'ont pas la même musique.
 *
 * Dossier vide, rien ne se passe : l'événement est muet et aucune erreur ne
 * remonte. C'est volontaire — un morceau manquant ne doit pas gâcher ce qu'on
 * regarde.
 */
const FOURNIES = Object.values(
  import.meta.glob('./pistes/*.{mp3,ogg,m4a,wav}', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
) as string[];

/** Y a-t-il de quoi jouer sans que l'utilisateur ait rien choisi ? */
export function aUneMusiqueFournie(): boolean {
  return FOURNIES.length > 0;
}

/** Un morceau du dossier, au hasard. */
function fournieAuHasard(): string | null {
  if (FOURNIES.length === 0) return null;
  return FOURNIES[Math.floor(Math.random() * FOURNIES.length)];
}

/** Durée des fondus, à l'entrée comme à la sortie. */
const FONDU_MS = 1800;

let audio: HTMLAudioElement | null = null;
let fondu: ReturnType<typeof setInterval> | null = null;
/** Le réglage courant : un chemin de la machine, ou `null`. */
let choisie: string | null = null;
/** Vrai entre le début et la fin d'un événement, pour ne pas empiler. */
let enCours = false;

/** La scène ne lit pas les réglages : on les lui apporte. */
export function reglerMusiqueEvenement(chemin: string | null): void {
  choisie = chemin;
}

function volumeVoulu(): number {
  // Un peu au-dessus de l'ambiance : c'est un événement, pas un fond.
  return Math.min(1, readAmbientVolume() * 1.6);
}

function fondre(vers: number, apres?: () => void): void {
  if (fondu) clearInterval(fondu);
  const el = audio;
  if (!el) return;
  const depart = el.volume;
  const pas = 24;
  let i = 0;
  fondu = setInterval(() => {
    i++;
    el.volume = Math.max(0, Math.min(1, depart + (vers - depart) * (i / pas)));
    if (i >= pas) {
      if (fondu) clearInterval(fondu);
      fondu = null;
      apres?.();
    }
  }, FONDU_MS / pas);
}

/** Vrai là où il y a de quoi jouer un son : pas dans les tests, qui tournent hors navigateur. */
function possible(): boolean {
  return typeof Audio !== 'undefined';
}

/** Démarre la musique de l'événement. Sans effet si une autre joue déjà. */
export function jouerMusiqueEvenement(): void {
  if (enCours || !possible()) return;
  enCours = true;

  // Le morceau choisi par l'utilisateur l'emporte sur le dossier ; à défaut,
  // on en tire un au sort. Un chemin de la machine passe par le protocole
  // d'actifs de Tauri — hors Tauri, il n'y a pas de chemin à convertir.
  let source: string | null = fournieAuHasard();
  if (choisie) {
    try {
      source = convertFileSrc(choisie);
    } catch {
      source = fournieAuHasard();
    }
  }
  if (!source) {
    enCours = false;
    return;
  }

  if (!audio) audio = new Audio();
  audio.src = source;
  audio.loop = false;
  audio.volume = 0;
  audio.onended = () => {
    enCours = false;
    resumeAmbient('evenement');
  };

  void audio
    .play()
    .then(() => {
      suspendAmbient('evenement');
      fondre(volumeVoulu());
    })
    // Fichier introuvable, format refusé, lecture bloquée : l'événement se
    // regarde en silence, et c'est tout.
    .catch(() => {
      enCours = false;
      resumeAmbient('evenement');
    });
}

/** Éteint la musique en fondu, et rend l'ambiance. */
export function arreterMusiqueEvenement(): void {
  if (!enCours || !possible()) return;
  enCours = false;
  if (!audio || audio.paused) {
    resumeAmbient('evenement');
    return;
  }
  fondre(0, () => {
    audio?.pause();
    resumeAmbient('evenement');
  });
}
