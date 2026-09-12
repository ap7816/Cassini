import { createContext } from 'react';

export type PanneauReglages = {
  /** Le panneau est-il ouvert ? Pour marquer le bouton qui l'a appelé. */
  ouvert: boolean;
  ouvrir: () => void;
};

export const PanneauReglagesContext = createContext<PanneauReglages | null>(null);
