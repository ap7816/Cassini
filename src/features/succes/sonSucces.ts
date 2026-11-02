/**
 * Le petit air qui accompagne une observation consignée.
 *
 * Synthétisé à la volée plutôt que lu dans un fichier. Deux raisons : un succès
 * se décroche une fois, et quelques centaines de kilo-octets pour une seconde
 * de son qu'on entend sept fois dans une vie d'installation sont chers payés ;
 * et une note calculée ne pose aucune question de licence ni de chargement —
 * elle est là, tout de suite, même hors ligne.
 *
 * **Ce que c'est censé faire entendre** : une récompense, pas une alarme. Trois
 * notes qui montent, vite, et une dernière qui reste. On doit pouvoir la
 * reconnaître au bout d'une demi-seconde et avoir envie de l'entendre encore.
 *
 * Ce qui a changé par rapport au premier essai, et pourquoi :
 *
 * - **Une quinte plus bas.** Il montait à 1320 Hz, soit le haut du clavier :
 *   perçant. La phrase tient maintenant entre sol3 et sol5, là où l'oreille
 *   entend de la musique et non un signal.
 * - **Des cloches, et non des triangles.** Une onde triangulaire porte toutes
 *   ses harmoniques au même rang, ce qui sonne jouet. Une cloche est une
 *   fondamentale et deux partiels qui s'éteignent **plus vite qu'elle** — c'est
 *   cette extinction inégale, et rien d'autre, qui fait le timbre.
 * - **Une basse sous la phrase**, une octave sous la fondamentale et à peine
 *   audible : c'est elle qui donne le poids, et son absence rendait le tout
 *   mince.
 * - **Un écho unique**, à cent quarante millisecondes. Une pièce, pas une
 *   cathédrale — mais sans lui le son s'arrête net, et un son qui s'arrête net
 *   sonne comme une erreur.
 * - **Un dédoublement désaccordé** sur la dernière note : deux oscillateurs à
 *   six centièmes de ton l'un de l'autre battent lentement, et c'est ce
 *   battement qui fait qu'elle brille au lieu de tenir.
 */

/** Sol3, sol4, ré5, sol5 : une quinte puis l'octave, avec la basse dessous. */
const BASSE = 196.0;
const PHRASE = [
  { frequence: 392.0, depart: 0.0, duree: 0.55, niveau: 0.5 },
  { frequence: 587.33, depart: 0.085, duree: 0.65, niveau: 0.55 },
  { frequence: 783.99, depart: 0.17, duree: 1.6, niveau: 0.6, dedouble: true },
];

/**
 * Les partiels d'une cloche : rang, part du niveau, et part de la durée.
 *
 * Les aigus meurent les premiers. C'est toute la recette — mêmes durées, on
 * obtient un orgue ; durées décroissantes, une cloche.
 */
const PARTIELS = [
  { rang: 1, part: 1.0, tenue: 1.0 },
  { rang: 2, part: 0.3, tenue: 0.5 },
  { rang: 3, part: 0.08, tenue: 0.26 },
];

/** Le niveau d'ensemble. Volontairement bas : c'est une ponctuation. */
const NIVEAU = 0.3;

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
  const contexteOuRien = obtenirContexte();
  if (!contexteOuRien) return;
  // Repris dans une constante non nulle : le compilateur perd l'affinement du
  // type au passage de la fonction imbriquée plus bas.
  const ctx: AudioContext = contexteOuRien;

  const sortie = ctx.createGain();
  sortie.gain.value = NIVEAU;

  // Un voile sur les aigus : les partiels de rang trois montent à deux mille
  // hertz et piquent sans lui. Pente douce (Q bas), sinon il siffle là où il
  // coupe.
  const voile = ctx.createBiquadFilter();
  voile.type = 'lowpass';
  voile.frequency.value = 2400;
  voile.Q.value = 0.4;
  voile.connect(sortie);
  sortie.connect(ctx.destination);

  // L'écho, une seule fois : le retour ne se reboucle pas sur le retard.
  const retard = ctx.createDelay(0.5);
  retard.delayTime.value = 0.14;
  const retour = ctx.createGain();
  retour.gain.value = 0.26;
  sortie.connect(retard);
  retard.connect(retour);
  retour.connect(ctx.destination);

  const debut = ctx.currentTime + 0.02;

  /** Une note de cloche : sa fondamentale et ses deux partiels. */
  function cloche(
    frequence: number,
    depart: number,
    duree: number,
    niveau: number,
    dedouble = false,
  ): void {
    for (const { rang, part, tenue } of PARTIELS) {
      const voix = dedouble && rang === 1 ? [0, 6] : [0];
      for (const desaccord of voix) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequence * rang;
        osc.detune.value = desaccord;

        const g = ctx.createGain();
        const fin = depart + duree * tenue;
        // Une rampe exponentielle ne part pas de zéro : d'où la valeur
        // minuscule au départ. Huit millisecondes d'attaque — assez pour ne
        // pas claquer, assez peu pour que le coup se sente.
        g.gain.setValueAtTime(0.0001, depart);
        g.gain.exponentialRampToValueAtTime((niveau * part) / voix.length, depart + 0.008);
        // L'extinction est une constante de temps, et non une rampe jusqu'à
        // zéro. Une rampe exponentielle vers une valeur presque nulle tombe en
        // ligne droite vers sa cible : mesurée, elle ne laissait plus rien au
        // bout de trois cents millisecondes, et la note « longue » s'arrêtait
        // avec les autres. Une constante de temps décroît toujours dans la
        // même proportion — c'est ainsi que s'éteint tout ce qui résonne.
        g.gain.setTargetAtTime(0.0001, depart + 0.012, (duree * tenue) / 3.2);

        osc.connect(g).connect(voile);
        osc.start(depart);
        osc.stop(fin + 0.12);
      }
    }
  }

  // La basse d'abord, pour que la phrase ait un sol sous les pieds.
  cloche(BASSE, debut, 1.3, 0.34);
  for (const { frequence, depart, duree, niveau, dedouble } of PHRASE) {
    cloche(frequence, debut + depart, duree, niveau, dedouble);
  }
}
