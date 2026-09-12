import { createContext } from 'react';

/** Les calques que l'application sait poser sur la vue. */
export type Calque = 'reglages' | 'musique';

export type Calques = {
  /** Calque affiché, ou `null`. Sert aussi à marquer le bouton qui l'a ouvert. */
  ouvert: Calque | null;
  ouvrir: (calque: Calque) => void;
  /** Ouvre, ou referme si c'est déjà celui-là — pour un bouton de barre. */
  basculer: (calque: Calque) => void;
  fermer: () => void;
};

export const CalquesContext = createContext<Calques | null>(null);
