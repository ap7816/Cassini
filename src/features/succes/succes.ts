import { readSucces, writeSucces } from '../../services/storage';
import type { EvenementCiel } from '../debug/evenementsCiel';

/**
 * Les succès : ce qu'on a vu passer dans le ciel.
 *
 * Un par événement, et rien d'autre pour l'instant. Ce sont des choses rares —
 * un trou noir se montre une fois toutes les trente heures passées devant la
 * galaxie — et la seule façon de savoir qu'on les a toutes vues était de s'en
 * souvenir. Un succès est une trace : il dit « celle-là, tu l'as eue ».
 *
 * **Vu, et non déclenché.** Le succès tombe pendant que la chose est à
 * l'écran, et non quand le tirage la lance : c'est la scène qui le signale à
 * chaque image, tant que l'événement court. La nuance compte pour les deux
 * chemins qui lancent un événement — le hasard et le panneau de débogage —,
 * qui passent ainsi tous les deux par le même endroit.
 *
 * Le module ne sait rien de l'affichage : il garde l'ensemble, le range, et
 * prévient qui s'est abonné. La notification, le son et le panneau de
 * débogage s'y branchent.
 */

/** Les succès existants. Un par événement du ciel. */
export type CleSucces = EvenementCiel;

/**
 * L'ordre d'affichage, et la liste de référence.
 *
 * Du plus courant au plus rare : c'est l'ordre dans lequel on les décroche, et
 * celui dans lequel ils se lisent.
 */
export const SUCCES: readonly CleSucces[] = [
  'trainee',
  'tempete',
  'comete',
  'vaisseau',
  'cometeBleue',
  'supernova',
  'trouNoir',
] as const;

/** Vrai pour une clé qui existe encore : le stockage peut en garder d'anciennes. */
function connue(cle: string): cle is CleSucces {
  return (SUCCES as readonly string[]).includes(cle);
}

let decroches = new Set<CleSucces>(readSucces().filter(connue));
const abonnes = new Set<(cle: CleSucces) => void>();

/** Les succès déjà décrochés, dans l'ordre de `SUCCES`. */
export function succesDecroches(): CleSucces[] {
  return SUCCES.filter((c) => decroches.has(c));
}

export function estDecroche(cle: CleSucces): boolean {
  return decroches.has(cle);
}

/**
 * Décroche un succès. Rend vrai **la première fois seulement**.
 *
 * C'est ce qui permet de l'appeler à chaque image sans y penser : la scène
 * signale ce qu'elle montre, le module décide si c'est une nouvelle.
 */
export function decrocherSucces(cle: CleSucces): boolean {
  if (decroches.has(cle)) return false;
  decroches.add(cle);
  writeSucces(succesDecroches());
  abonnes.forEach((fn) => fn(cle));
  return true;
}

/**
 * Tout remettre à zéro.
 *
 * Pour les essais : sans cela, un succès décroché une fois ne se revoit plus
 * jamais, et sa notification non plus — autant dire qu'on ne peut pas la
 * régler. Le bouton est dans le panneau de débogage, à côté de ceux qui
 * déclenchent les événements.
 */
export function reinitialiserSucces(): void {
  decroches = new Set();
  writeSucces([]);
}

/** Prévenu à chaque succès nouvellement décroché. */
export function abonnerSucces(fn: (cle: CleSucces) => void): () => void {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
