import type { ReactNode } from 'react';

/**
 * Icônes de commande, en trait et à la couleur du texte.
 *
 * Les commandes utilisaient des emojis : 🔀, 🔁, 📁. Sous Windows ils sortent en
 * pastilles de couleur — bleues, jaunes — qui ne suivent ni la couleur du
 * bouton, ni son état, ni le reste de l'interface. Même les symboles de lecture
 * (⏮ ⏸ ⏭) basculent en emoji selon la police disponible. Des tracés vectoriels
 * prennent `currentColor` : le survol, l'état actif et le thème s'appliquent
 * d'eux-mêmes.
 *
 * Toujours décoratives : le bouton qui les porte a son propre nom accessible.
 */

export type NomIconeHud =
  | 'dossier'
  | 'aleatoire'
  | 'repeter'
  | 'repeterUn'
  | 'precedent'
  | 'suivant'
  | 'lecture'
  | 'pause'
  | 'arret'
  | 'volume'
  | 'volumeBas'
  | 'volumeMuet'
  | 'desinstaller'
  | 'actualiser'
  | 'valide';

const TRACES: Record<NomIconeHud, ReactNode> = {
  dossier: <path d="M3 7h6l2 2h10v10H3z" />,
  aleatoire: (
    <>
      <path d="M3 7h4l10 10h4" />
      <path d="M3 17h4l3-3M14 10l3-3h4" />
      <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
    </>
  ),
  repeter: (
    <>
      <path d="M4 11V9a2 2 0 0 1 2-2h13" />
      <path d="M16 4l3 3-3 3" />
      <path d="M20 13v2a2 2 0 0 1-2 2H5" />
      <path d="M8 20l-3-3 3-3" />
    </>
  ),
  repeterUn: (
    <>
      <path d="M4 11V9a2 2 0 0 1 2-2h13" />
      <path d="M16 4l3 3-3 3" />
      <path d="M20 13v2a2 2 0 0 1-2 2H5" />
      <path d="M8 20l-3-3 3-3" />
      <path d="M11.5 10.5l1-.5v4" />
    </>
  ),
  precedent: (
    <>
      <path d="M6 5v14" />
      <path d="M19 5l-10 7 10 7z" fill="currentColor" />
    </>
  ),
  suivant: (
    <>
      <path d="M18 5v14" />
      <path d="M5 5l10 7-10 7z" fill="currentColor" />
    </>
  ),
  lecture: <path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" />,
  pause: (
    <>
      <path d="M7 5h3v14H7z" fill="currentColor" />
      <path d="M14 5h3v14h-3z" fill="currentColor" />
    </>
  ),
  arret: <path d="M6 6l12 12M18 6L6 18" />,
  // Coche : l'action a abouti.
  valide: <path d="M4.5 12.5l5 5 10-11" />,
  // Deux flèches qui tournent : le symbole d'actualisation partout reconnu.
  actualiser: (
    <>
      <path d="M20 12a8 8 0 0 1-14.3 4.9" />
      <path d="M4 12a8 8 0 0 1 14.3-4.9" />
      <path d="M18.5 3.5v4h-4" />
      <path d="M5.5 20.5v-4h4" />
    </>
  ),
  // Un bac et son couvercle : ce que Windows montre pour « désinstaller ».
  desinstaller: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  // Le haut-parleur est commun ; les ondes disent le niveau.
  volume: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M18.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  volumeBas: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  volumeMuet: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
};

type Props = {
  nom: NomIconeHud;
  /** Côté en pixels ; suit la taille de police du bouton par défaut. */
  taille?: number | string;
  className?: string;
};

export function IconeHud({ nom, taille = '1.15em', className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={taille}
      height={taille}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {TRACES[nom]}
    </svg>
  );
}
