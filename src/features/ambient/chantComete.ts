/**
 * Le chant de la comète bleue.
 *
 * Quelques notes jouées par le navigateur lui-même, à la demande : une boîte à
 * musique lente, très lointaine, qui ne monte que lorsqu'on pose le curseur sur
 * la comète et retombe dès qu'on le retire.
 *
 * Synthétisé plutôt qu'enregistré, et c'est délibéré à deux titres. Une musique
 * du commerce ne s'embarque pas dans une application sans la permission de
 * celui qui l'a écrite — et une poignée d'oscillateurs ne pèse rien, là où un
 * fichier audio pèserait quelques mégaoctets pour douze secondes.
 *
 * Le timbre vise la célesta : une sinusoïde qui s'éteint vite, doublée à
 * l'octave plus faiblement, et un écho long qui tient lieu de salle. C'est
 * grossier au regard d'un instrument réel ; c'est juste à travers un hublot.
 */

/**
 * Le motif, en demi-tons depuis la fondamentale.
 *
 * Des notes tirées au hasard dans une gamme ne font pas une mélodie : elles ne
 * sonnent jamais faux, et c'est tout — on entend un carillon, pas un air. Un
 * motif, lui, revient, et c'est en revenant qu'il devient reconnaissable.
 *
 * Celui-ci est en mineur pentatonique : la quinte ouverte du début, la montée,
 * puis la retombée sur la tierce. Rien d'original, et c'est voulu — ce qui doit
 * se remarquer ici, c'est la comète.
 */
const MOTIF = [0, 7, 12, 10, 7, 12, 15, 12];
/** Les transpositions possibles d'une reprise à l'autre, en demi-tons. */
const TRANSPOSITIONS = [0, 0, 0, -5, 3, 7];
/** La fondamentale : un la, assez grave pour que l'ensemble reste calme. */
const FONDAMENTALE = 220;
/** Intervalle entre deux notes, en secondes. */
const PAS = 0.78;

export type ChantComete = {
  /** Règle le niveau, de 0 (silence) à 1. Démarre le chant au premier appel. */
  niveau: (v: number) => void;
  arreter: () => void;
};

export function createChantComete(): ChantComete {
  let contexte: AudioContext | null = null;
  let maitre: GainNode | null = null;
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let index = 0;
  let transposition = 0;

  function demarrer(): void {
    if (contexte) return;
    const Contexte = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexte) return;
    contexte = new Contexte();

    maitre = contexte.createGain();
    maitre.gain.value = 0;

    // L'écho tient lieu de distance : sans lui, la boîte à musique est dans la
    // pièce ; avec lui, elle est à l'autre bout du ciel.
    const echo = contexte.createDelay(2);
    echo.delayTime.value = 0.52;
    const retour = contexte.createGain();
    retour.gain.value = 0.5;
    const doux = contexte.createBiquadFilter();
    doux.type = 'lowpass';
    doux.frequency.value = 2600;

    maitre.connect(doux);
    doux.connect(contexte.destination);
    doux.connect(echo);
    echo.connect(retour);
    retour.connect(echo);
    retour.connect(contexte.destination);

    nappe(contexte, maitre);
    jouerUneNote();
  }

  /**
   * La nappe : deux cordes désaccordées, très basses et très douces.
   *
   * C'est elle qui fait la différence entre « des notes » et « de la musique ».
   * Le léger désaccord entre les deux produit un battement lent, de l'ordre de
   * la seconde, qui empêche le son de paraître figé.
   */
  function nappe(ctx: AudioContext, sortie: GainNode): void {
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.value = 420;
    const volume = ctx.createGain();
    volume.gain.value = 0.1;
    filtre.connect(volume);
    volume.connect(sortie);

    for (const desaccord of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = FONDAMENTALE / 2;
      o.detune.value = desaccord;
      o.connect(filtre);
      o.start();
    }
  }

  function jouerUneNote(): void {
    if (!contexte || !maitre) return;

    // Fin du motif : on le reprend, parfois ailleurs.
    if (index >= MOTIF.length) {
      index = 0;
      transposition = TRANSPOSITIONS[Math.floor(Math.random() * TRANSPOSITIONS.length)];
    }
    const demiTons = MOTIF[index++] + transposition;
    const frequence = FONDAMENTALE * 2 ** (demiTons / 12);
    const debut = contexte.currentTime;

    // Trois partiels : la fondamentale, l'octave, et la quinte au-dessus, de
    // plus en plus faibles et de plus en plus brefs. C'est ce qui donne à une
    // célesta son attaque claire et sa queue douce.
    for (const [facteur, poids, duree] of [[1, 1, 3.4], [2, 0.3, 2.2], [3, 0.12, 1.4]] as const) {
      const o = contexte.createOscillator();
      o.type = 'sine';
      o.frequency.value = frequence * facteur;
      const g = contexte.createGain();
      g.gain.setValueAtTime(0, debut);
      g.gain.linearRampToValueAtTime(0.16 * poids, debut + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
      o.connect(g);
      g.connect(maitre);
      o.start(debut);
      o.stop(debut + duree + 0.1);
    }

    // Une respiration à la fin de chaque phrase : sans elle, le motif devient
    // une sonnerie.
    const attente = PAS * (index >= MOTIF.length ? 2.2 : 1);
    minuteur = setTimeout(jouerUneNote, attente * 1000);
  }

  return {
    niveau(v) {
      const vise = Math.max(0, Math.min(1, v));
      if (vise > 0) demarrer();
      if (!contexte || !maitre) return;
      // Un fondu d'une demi-seconde : le chant ne doit ni surgir ni se couper,
      // seulement s'approcher.
      maitre.gain.cancelScheduledValues(contexte.currentTime);
      maitre.gain.setTargetAtTime(vise * 0.6, contexte.currentTime, 0.4);
    },
    arreter() {
      if (minuteur) clearTimeout(minuteur);
      minuteur = null;
      void contexte?.close();
      contexte = null;
      maitre = null;
    },
  };
}
