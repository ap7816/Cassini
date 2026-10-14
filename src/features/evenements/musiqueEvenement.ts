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

/**
 * Le volume d'un événement tant que personne n'y a touché.
 *
 * C'est exactement ce que donnait l'ancien calcul — le volume de l'ambiance,
 * relevé de moitié — pour une installation neuve. Autrement dit : rien ne
 * change pour qui ne touche à rien.
 */
export const VOLUME_EVENEMENT_DEFAUT = 0.4;

/** Durée des fondus, à l'entrée comme à la sortie. */
const FONDU_MS = 1800;

let audio: HTMLAudioElement | null = null;
let fondu: ReturnType<typeof setInterval> | null = null;
/** Les réglages courants : un chemin de la machine par événement, ou `null`. */
let choisies: MusiquesEvenements = { supernova: null, cometeBleue: null, trouNoir: null };
let volumes: VolumesEvenements = {
  supernova: VOLUME_EVENEMENT_DEFAUT,
  cometeBleue: VOLUME_EVENEMENT_DEFAUT,
  trouNoir: VOLUME_EVENEMENT_DEFAUT,
};
/**
 * L'événement dont la musique joue, ou `null`.
 *
 * Il sert à deux choses : empêcher deux morceaux de se superposer, et dire à
 * l'interface quoi écrire sur son bouton — « Écouter » ou « Arrêter ».
 */
let enCoursPour: EvenementMusical | null = null;
const abonnes = new Set<() => void>();

/** Quel événement fait du bruit en ce moment. */
export function musiqueEnCours(): EvenementMusical | null {
  return enCoursPour;
}

/** Prévient quand la musique démarre, s'arrête, ou se termine d'elle-même. */
export function abonnerMusiqueEvenement(fn: () => void): () => void {
  abonnes.add(fn);
  return () => { abonnes.delete(fn); };
}

function changer(quoi: EvenementMusical | null): void {
  enCoursPour = quoi;
  abonnes.forEach((fn) => fn());
}

/**
 * Les gros événements, les seuls à avoir droit à une musique.
 *
 * Les étoiles filantes et les passages reviennent toutes les trente secondes —
 * une musique à chaque fois ne serait plus une annonce, seulement du bruit.
 */
export type EvenementMusical = 'supernova' | 'cometeBleue' | 'trouNoir';

/** Un morceau choisi par événement ; `null` en laisse un du dossier au sort. */
export type MusiquesEvenements = Record<EvenementMusical, string | null>;

/** Le volume de chacune, de 0 à 1. */
export type VolumesEvenements = Record<EvenementMusical, number>;

/** La scène ne lit pas les réglages : on les lui apporte. */
export function reglerMusiquesEvenements(musiques: MusiquesEvenements): void {
  choisies = musiques;
}

/**
 * Et de même pour les volumes.
 *
 * Appliqué sur-le-champ si quelque chose joue : un volume se règle en
 * l'écoutant, et le curseur des paramètres doit s'entendre pendant qu'on le
 * tire. Sauf au milieu d'un fondu, qui écrit lui aussi dans ce volume et qu'il
 * ne faut pas contrarier — il finira sur la valeur neuve de toute façon.
 */
export function reglerVolumesEvenements(nouveaux: VolumesEvenements): void {
  volumes = nouveaux;
  if (audio && enCoursPour && !fondu) audio.volume = volumeVoulu(enCoursPour);
}

function volumeVoulu(evenement: EvenementMusical): number {
  // Le sien, et plus celui de l'ambiance : ce n'est pas un fond, et il a
  // maintenant son propre curseur.
  const v = volumes[evenement];
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : VOLUME_EVENEMENT_DEFAUT));
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

/** Démarre la musique d'un événement. Sans effet si une autre joue déjà. */
export function jouerMusiqueEvenement(evenement: EvenementMusical): void {
  if (enCoursPour || !possible()) return;
  // Un fondu encore en cours appartient au morceau précédent : laissé vivant,
  // sa dernière marche mettrait en pause celui qu'on démarre.
  if (fondu) clearInterval(fondu);
  fondu = null;
  changer(evenement);
  const choisie = choisies[evenement];

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
    changer(null);
    return;
  }

  if (!audio) audio = new Audio();
  audio.src = source;
  audio.loop = false;
  audio.volume = 0;
  audio.onended = () => {
    changer(null);
    resumeAmbient('evenement');
  };

  void audio
    .play()
    .then(() => {
      suspendAmbient('evenement');
      fondre(volumeVoulu(evenement));
    })
    // Fichier introuvable, format refusé, lecture bloquée : l'événement se
    // regarde en silence, et c'est tout.
    .catch(() => {
      changer(null);
      resumeAmbient('evenement');
    });
}

/** Éteint la musique en fondu, et rend l'ambiance. */
export function arreterMusiqueEvenement(): void {
  if (!enCoursPour || !possible()) return;
  changer(null);
  if (!audio || audio.paused) {
    resumeAmbient('evenement');
    return;
  }
  fondre(0, () => {
    audio?.pause();
    resumeAmbient('evenement');
  });
}
