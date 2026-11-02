/**
 * Icônes proposées pour un système solaire personnalisé.
 *
 * Dessinées ici plutôt que tirées d'une police d'icônes : aucune dépendance de
 * plus, et chaque tracé se teinte de la couleur choisie. Carré de 24 unités,
 * silhouettes pleines — à la taille d'un bouton de la barre, un trait fin se
 * perd. Les sous-tracés intérieurs sont des évidements (règle evenodd).
 */

export type Calque = {
  d: string;
  /** Tracé en trait plutôt qu'en aplat — l'anneau d'une planète, par exemple. */
  trait?: boolean;
};

export type DessinIcone = {
  /**
   * Identifiant stable, enregistré avec le système. Il sert aussi de clé à son
   * nom affiché, traduit (`systems.icons.<nom>`).
   */
  nom: string;
  calques: readonly Calque[];
};

export const ICONES_SYSTEME: readonly DessinIcone[] = [
  {
    nom: 'etoile',
    calques: [
      {
        d: 'M12 2.5l2.94 6.26 6.86.72-5.14 4.61 1.46 6.76L12 17.4l-6.12 3.45 1.46-6.76L2.2 9.48l6.86-.72z',
      },
    ],
  },
  {
    nom: 'coeur',
    calques: [
      {
        d: 'M12 20.5s-7.8-4.9-9.4-9.6C1.5 7.6 3.7 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.3 0 5.5 3.1 4.4 6.4-1.6 4.7-9.4 9.6-9.4 9.6z',
      },
    ],
  },
  {
    nom: 'couronne',
    calques: [{ d: 'M3 7.5l4.5 4.2L12 4.5l4.5 7.2L21 7.5 19 18H5zM5 19.5h14V21H5z' }],
  },
  {
    nom: 'manette',
    calques: [
      {
        d:
          'M7.5 7h9A5.5 5.5 0 0 1 22 12.6l-.4 3.3a2.7 2.7 0 0 1-4.6 1.6L15 15.5H9l-2 2a2.7 2.7 0 0 1-4.6-1.6L2 12.6A5.5 5.5 0 0 1 7.5 7z' +
          'M6.3 9.8h1.4v1.5h1.5v1.4H7.7v1.5H6.3v-1.5H4.8v-1.4h1.5z' +
          'M16.6 9.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM18.6 12a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z',
      },
    ],
  },
  {
    nom: 'fusee',
    calques: [
      {
        d:
          'M12 2c2.8 1.9 4.5 5.4 4.5 9.2V16h-9v-4.8C7.5 7.4 9.2 3.9 12 2z' +
          'M12 6.7a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8z' +
          'M7.2 12.4L4.5 15.8V19l2.7-1.4zM16.8 12.4l2.7 3.4V19l-2.7-1.4zM10 17.2h4l-.9 3.8h-2.2z',
      },
    ],
  },
  {
    nom: 'planete',
    calques: [
      { d: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z' },
      { d: 'M3.2 16.6c1.4 1.7 7.6-.2 12-3.4s6.5-6 5.7-7.4', trait: true },
    ],
  },
  {
    nom: 'flamme',
    calques: [
      {
        d: 'M12 2.5c.9 3.7 5.6 5.7 5.6 11.2A5.6 5.6 0 0 1 12 19.4a5.6 5.6 0 0 1-5.6-5.7c0-2.8 1.6-4.4 2.6-6.2.3 1.9 1.2 2.9 2.4 3.2-.3-3.1-.3-5.4.6-8.2z',
      },
    ],
  },
  {
    nom: 'eclair',
    calques: [{ d: 'M13.5 2L4.5 13.5h6.2L9.5 22l9-11.5h-6.2z' }],
  },
  {
    nom: 'lune',
    calques: [{ d: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z' }],
  },
  {
    nom: 'trophee',
    calques: [
      { d: 'M7 3h10v4.5a5 5 0 0 1-10 0zM11 12.3h2V16h-2zM8 17h8v3.5H8z' },
      { d: 'M7 5H4.8a2.4 2.4 0 0 0 2.6 4.2M17 5h2.2a2.4 2.4 0 0 1-2.6 4.2', trait: true },
    ],
  },
  {
    nom: 'musique',
    calques: [{ d: 'M9 18.5a3 3 0 1 1-2-2.83V5.2l12-2.6V14a3 3 0 1 1-2-2.83V6.3L9 8z' }],
  },
  {
    nom: 'feuille',
    calques: [
      {
        d: 'M20.5 3.5C11 3.5 4 8 4 15.5c0 1.3.3 2.6.8 3.7C6.5 12.5 12 9 16 8c-4.5 2.2-8.3 6.2-10 12.3.8.2 1.6.2 2.5.2 7.5 0 12-7 12-17z',
      },
    ],
  },
];

export const ICONE_PAR_DEFAUT = 'etoile';

/** Le dessin d'une icône, ou celui par défaut si le nom n'est plus connu. */
export function iconeParNom(nom: string): DessinIcone {
  return ICONES_SYSTEME.find((i) => i.nom === nom) ?? ICONES_SYSTEME[0];
}
