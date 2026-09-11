import { useEffect, type RefObject } from 'react';

/**
 * Gestion du focus pour les fenêtres et les panneaux.
 *
 * Deux manques que l'audit d'accessibilité a relevés : la tabulation sortait
 * derrière une fenêtre modale, et à sa fermeture le focus repartait au début du
 * document — on perdait sa place dans l'application.
 */

const FOCALISABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function cibles(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(FOCALISABLES)].filter(
    // `offsetParent` est nul pour un élément masqué : une fenêtre garde parfois
    // des boutons cachés, qui piégeraient la tabulation dans le vide.
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Retient la tabulation dans l'élément, et rend le focus à son point de départ.
 *
 * Ne prend pas le focus de lui-même : chaque fenêtre sait mieux où le poser —
 * un champ de saisie, ou le bouton de confirmation.
 */
export function usePiegeFocus(ref: RefObject<HTMLElement | null>, actif = true): void {
  useEffect(() => {
    if (!actif) return;
    const origine = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const element = ref.current;
      if (!element) return;

      const liste = cibles(element);
      if (liste.length === 0) {
        // Rien où aller : mieux vaut ne pas bouger que sortir de la fenêtre.
        e.preventDefault();
        return;
      }

      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      const actuel = document.activeElement;
      const dehors = !element.contains(actuel);

      if (e.shiftKey && (actuel === premier || dehors)) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && (actuel === dernier || dehors)) {
        e.preventDefault();
        premier.focus();
      }
    };

    // En capture : la fenêtre reprend la main avant tout autre gestionnaire.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Le point de départ a pu disparaître entre-temps.
      if (origine && document.contains(origine)) origine.focus();
    };
  }, [ref, actif]);
}

/**
 * Rend le focus d'où il venait, sans retenir la tabulation.
 *
 * Pour un panneau qu'on garde ouvert à côté de la scène : le piéger empêcherait
 * d'atteindre le reste de l'application, alors qu'elle reste utilisable.
 */
export function useFocusRendu(): void {
  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null;
    return () => {
      if (origine && document.contains(origine)) origine.focus();
    };
  }, []);
}
