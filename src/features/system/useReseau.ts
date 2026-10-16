import { useEffect, useState } from 'react';
import { estEnLigne, surEtatReseau } from './reseau';

/**
 * L'état du réseau, pour un composant.
 *
 * Deux usages, et ils comptent autant l'un que l'autre : prévenir
 * l'utilisateur qu'il n'y a plus de réseau, et **redemander** ce qui n'avait
 * pas pu arriver quand il revient. Une vignette qui met ce booléen dans ses
 * dépendances retente sa jaquette au retour du wifi, sans que personne ait à
 * actualiser quoi que ce soit.
 */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(estEnLigne);
  useEffect(() => surEtatReseau(setEnLigne), []);
  return enLigne;
}

/**
 * Un numéro qui change à chaque **retour** du réseau.
 *
 * Il sert d'étiquette : une source d'image résolue porte l'époque où elle l'a
 * été, et celle qui vient d'une époque révolue est ignorée. La vignette repart
 * alors de son adresse de départ sans que personne ait à remettre un état à
 * zéro dans un effet — ce que ce dépôt refuse, et à juste titre : une remise à
 * zéro par effet provoque un rendu en cascade.
 */
export function useEpoqueReseau(): number {
  const [epoque, setEpoque] = useState(0);
  useEffect(() => {
    let avant = estEnLigne();
    return surEtatReseau((maintenant) => {
      // L'abonnement appelle tout de suite avec l'état courant : à cet
      // instant `avant` lui est égal, et rien ne bouge.
      if (maintenant && !avant) setEpoque((n) => n + 1);
      avant = maintenant;
    });
  }, []);
  return epoque;
}
