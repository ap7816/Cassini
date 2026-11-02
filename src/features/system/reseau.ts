import { tauriInvoke } from '../../services/tauri';
import { surEtatFenetre } from './etatFenetre';

/**
 * Y a-t-il un réseau ?
 *
 * Deux voix, comme pour l'état de la fenêtre — et pour la même raison : aucune
 * des deux ne suffit.
 *
 * **Le moteur web** répond vite et sans rien demander à personne, mais il ment
 * dans l'application. WebView2 laisse `navigator.onLine` à `true` quand on
 * coupe le wifi, et n'émet pas davantage d'événement `offline` : c'est le
 * défaut qu'on répare ici. En revanche, dans un navigateur ordinaire — le
 * développement — il est exact et instantané.
 *
 * **Le natif** va voir. Il interroge l'adresse que Windows interroge lui-même
 * pour allumer son propre voyant « pas d'Internet », et c'est la seule réponse
 * à laquelle on puisse se fier. Elle coûte un aller-retour, donc on ne la
 * demande pas à chaque image : toutes les dix secondes quand on se croit hors
 * ligne — pour que le retour soit rapide —, toutes les trente quand on se croit
 * en ligne, et jamais quand la fenêtre n'est pas devant l'utilisateur.
 *
 * Le natif a le dernier mot : s'il voit passer les octets, il y a un réseau,
 * quoi qu'en dise le moteur web, et réciproquement.
 *
 * Ce que cela sert : prévenir l'utilisateur, et surtout **redemander tout seul**
 * ce qui n'avait pas pu arriver. Sans réseau, les jaquettes ne se chargent pas —
 * c'est normal ; ce qui ne l'était pas, c'est qu'elles ne reviennent jamais.
 */

/** Toutes les dix secondes quand on se croit coupé : le retour doit se voir. */
const SONDE_HORS_LIGNE = 10_000;
/** Toutes les trente quand tout va bien : juste de quoi remarquer une coupure. */
const SONDE_EN_LIGNE = 30_000;

const abonnes = new Set<(enLigne: boolean) => void>();
let branche = false;
/** L'avis du natif, ou `null` tant qu'il n'a pas parlé (navigateur, démarrage). */
let avisNatif: boolean | null = null;
/** Le dernier état annoncé aux abonnés : sert à ne pas les prévenir pour rien. */
let dernierAnnonce: boolean | null = null;
let minuterie: ReturnType<typeof setTimeout> | null = null;
let fenetreDevant = true;

/** Y a-t-il un réseau ? Le natif fait foi dès qu'il a répondu. */
export function estEnLigne(): boolean {
  if (avisNatif !== null) return avisNatif;
  if (typeof navigator === 'undefined') return true;
  // `onLine` peut manquer sur un vieux moteur : son absence ne doit pas faire
  // croire à une panne.
  return navigator.onLine !== false;
}

/**
 * S'abonne aux allées et venues du réseau.
 *
 * L'abonné est appelé tout de suite avec l'état courant, comme pour l'état de
 * la fenêtre : l'application peut être lancée hors ligne.
 */
export function surEtatReseau(fn: (enLigne: boolean) => void): () => void {
  brancher();
  abonnes.add(fn);
  if (dernierAnnonce === null) dernierAnnonce = estEnLigne();
  fn(estEnLigne());
  return () => {
    abonnes.delete(fn);
  };
}

/**
 * Va voir tout de suite, sans attendre la prochaine sonde.
 *
 * Appelée au retour de la fenêtre au premier plan — c'est le moment où l'on
 * regarde, donc celui où l'état doit être juste.
 */
export function verifierLeReseau(): void {
  void sonder();
}

/**
 * Prévient les abonnés, si et seulement si le verdict a changé.
 *
 * Le verdict se **recalcule** au lieu d'être tenu à jour : les deux voix
 * changent chacune de son côté, et c'est la seule façon de ne pas se tromper
 * sur laquelle l'emporte.
 */
function annoncer(): void {
  const etat = estEnLigne();
  if (etat === dernierAnnonce) return;
  dernierAnnonce = etat;
  abonnes.forEach((fn) => fn(etat));
}

async function sonder(): Promise<void> {
  try {
    const joignable = await tauriInvoke<boolean>('reseau_joignable');
    avisNatif = joignable === true;
    annoncer();
  } catch {
    // Pas de côté natif : on est dans un navigateur, et son avis à lui suffit.
    // Surtout ne pas conclure à une panne de réseau — ce serait un faux négatif
    // à chaque démarrage en développement.
  }
  replanifier();
}

function replanifier(): void {
  if (minuterie) clearTimeout(minuterie);
  minuterie = null;
  // Fenêtre réduite ou derrière une autre application : personne ne regarde les
  // jaquettes, et une sonde toutes les dix secondes dans le vide n'a aucun
  // sens. On reprendra en revenant.
  if (!fenetreDevant) return;
  minuterie = setTimeout(() => void sonder(), estEnLigne() ? SONDE_EN_LIGNE : SONDE_HORS_LIGNE);
}

function brancher(): void {
  if (branche || typeof window === 'undefined') return;
  branche = true;

  // La voix du moteur web : fausse dans l'application, juste dans un
  // navigateur. Elle sert tant que le natif n'a pas répondu, et donne une
  // réaction immédiate là où elle fonctionne.
  window.addEventListener('online', () => {
    annoncer();
    // Le moteur dit que ça revient : on va vérifier sur-le-champ plutôt que
    // d'attendre la prochaine sonde.
    void sonder();
  });
  window.addEventListener('offline', () => annoncer());

  // La sonde ne tourne que fenêtre devant, et repart au retour.
  surEtatFenetre((enArrierePlan) => {
    fenetreDevant = !enArrierePlan;
    if (fenetreDevant) void sonder();
    else replanifier();
  });
}

/** Remet le module à zéro, et impose un état. Réservé aux tests. */
export function _simulerReseau(enLigne: boolean): void {
  branche = true; // n'attache aucun écouteur pendant les tests
  if (minuterie) clearTimeout(minuterie);
  minuterie = null;
  avisNatif = enLigne;
  annoncer();
}

/** Rend la parole au moteur web, comme avant toute sonde. Réservé aux tests. */
export function _oublierAvisNatif(): void {
  avisNatif = null;
  annoncer();
}
