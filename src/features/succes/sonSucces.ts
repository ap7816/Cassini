/**
 * Le petit air qui accompagne un succès.
 *
 * Trois notes montantes, synthétisées à la volée plutôt que lues dans un
 * fichier. Deux raisons : un succès se décroche une fois, et un fichier de
 * quelques centaines de kilo-octets pour une seconde de son qu'on entend sept
 * fois dans une vie d'installation est cher payé ; et une note calculée ne pose
 * aucune question de licence ni de chargement — elle est là, tout de suite,
 * même hors ligne.
 *
 * L'enveloppe compte plus que les notes : une attaque de dix millisecondes et
 * une décroissance exponentielle. Sans elle, un oscillateur qu'on démarre et
 * qu'on arrête fait deux claquements secs, parce que l'onde saute de zéro à sa
 * valeur et retombe.
 */

/** Une quinte et une octave au-dessus de la fondamentale : un accord qui monte. */
const NOTES = [660, 880, 1320];

/** Le niveau de chaque note. Volontairement bas : c'est une ponctuation. */
const NIVEAU = 0.22;

let contexte: AudioContext | null = null;

/** Le contexte audio, créé au premier besoin et gardé ensuite. */
function obtenirContexte(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!contexte) contexte = new AudioContext();
  // Les navigateurs suspendent le contexte tant que rien n'a été cliqué ; à ce
  // stade quelqu'un a forcément agi dans l'application, mais le contexte peut
  // avoir été créé avant.
  if (contexte.state === 'suspended') void contexte.resume();
  return contexte;
}

/** Joue l'air. Sans effet là où il n'y a pas de son — les tests, par exemple. */
export function jouerSonSucces(): void {
  const ctx = obtenirContexte();
  if (!ctx) return;

  const debut = ctx.currentTime + 0.02;
  NOTES.forEach((frequence, i) => {
    const depart = debut + i * 0.11;
    const osc = ctx.createOscillator();
    // Un triangle plutôt qu'une sinusoïde : il porte ses harmoniques et
    // s'entend par-dessus la musique, sans la dureté d'un carré.
    osc.type = 'triangle';
    osc.frequency.value = frequence;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, depart);
    gain.gain.exponentialRampToValueAtTime(NIVEAU, depart + 0.01);
    // La dernière note traîne : c'est elle qui termine la phrase.
    const duree = i === NOTES.length - 1 ? 0.75 : 0.26;
    gain.gain.exponentialRampToValueAtTime(0.0001, depart + duree);

    osc.connect(gain).connect(ctx.destination);
    osc.start(depart);
    osc.stop(depart + duree + 0.02);
  });
}
