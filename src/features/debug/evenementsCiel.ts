/**
 * Déclencher à la main ce qui n'arrive que par hasard.
 *
 * Les événements du ciel sont rares par construction — une étoile filante par
 * minute, une tempête par heure, une supernova par session au mieux. C'est ce
 * qui leur donne leur prix, et c'est aussi ce qui rend leur mise au point
 * impossible : attendre une heure pour voir si une couleur convient n'est pas
 * une méthode.
 *
 * Ce registre donne au panneau de débogage un fil jusqu'à la scène. La scène
 * s'y inscrit à son montage et s'en retire à son démontage : rien ne subsiste
 * d'une scène libérée.
 *
 * Il ne contient aucune logique d'événement — seulement l'adresse de celui qui
 * sait les déclencher.
 */

export type EvenementCiel =
  | 'trainee'
  | 'tempete'
  | 'comete'
  | 'vaisseau'
  | 'supernova'
  | 'cometeBleue';

export const EVENEMENTS_CIEL: Array<{ cle: EvenementCiel; libelle: string }> = [
  { cle: 'trainee', libelle: 'Étoile filante' },
  { cle: 'tempete', libelle: 'Tempête magnétique' },
  { cle: 'comete', libelle: 'Comète' },
  { cle: 'vaisseau', libelle: 'Passage' },
  { cle: 'supernova', libelle: 'Supernova' },
  { cle: 'cometeBleue', libelle: 'Comète bleue' },
];

type Declencheur = (evenement: EvenementCiel) => void;

let declencheur: Declencheur | null = null;

/** La scène s'inscrit ; la fonction rendue la retire. */
export function enregistrerCiel(fn: Declencheur): () => void {
  declencheur = fn;
  return () => {
    if (declencheur === fn) declencheur = null;
  };
}

/** Le panneau appelle ; sans scène montée, il ne se passe rien. */
export function declencherCiel(evenement: EvenementCiel): void {
  declencheur?.(evenement);
}
