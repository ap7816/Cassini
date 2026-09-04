/**
 * Placement de la carte de détail à côté de la planète sélectionnée.
 *
 * Isolé de la scène et sans dépendance à Three.js ni au DOM : c'est la partie
 * du comportement qui a des cas limites (planète près d'un bord, carte plus
 * grande que le cadre) et elle se vérifie ainsi sans faire tourner de rendu.
 */

/** Écart en pixels entre la carte et le bord apparent de la planète. */
const GAP = 14;
/**
 * Marge minimale conservée entre la carte et les bords de la zone 3D.
 *
 * Assez large pour dégager les deux languettes de repli, qui empiètent sur la
 * bande : 22 px pour celle de la navigation à gauche, 26 px pour celle de la
 * liste à droite. À 10 px, une carte recadrée contre un bord passait dessous —
 * elle paraissait déborder, et la languette devenait incliquable.
 */
export const MARGIN = 30;
/** Distance minimale entre l'ergot et un coin de la carte. */
const ARROW_INSET = 18;

export type PopupPlacement = {
  /** Coin haut-gauche de la carte, en pixels dans la zone 3D. */
  x: number;
  y: number;
  /** Ergot, en pixels depuis le haut de la carte. */
  arrowY: number;
  /** Côté de la planète où la carte a pu se placer. */
  side: 'left' | 'right';
};

/**
 * @param cx      centre de la planète à l'écran, en pixels
 * @param cy      idem, en ordonnée
 * @param edge    demi-largeur apparente de la planète, en pixels
 * @param popupW  dimensions de la carte
 * @param popupH
 * @param hostW   dimensions de la zone 3D
 * @param hostH
 *
 * Placement latéral et non au-dessus : la carte fait près de 300 px de haut,
 * soit plus de 40 % d'une fenêtre courante. Ni au-dessus ni en dessous elle ne
 * tient sans être recadrée contre un bord — et une carte recadrée ne désigne
 * plus la planète. En largeur, la zone 3D en offre deux fois plus, et la
 * caméra amène toujours la planète en son centre.
 */
export function placePopup(
  cx: number,
  cy: number,
  edge: number,
  popupW: number,
  popupH: number,
  hostW: number,
  hostH: number,
): PopupPlacement {
  // À droite par défaut, à gauche si la carte déborderait du cadre.
  let left = cx + edge + GAP;
  let side: 'left' | 'right' = 'right';
  if (left + popupW > hostW - MARGIN) {
    left = cx - edge - GAP - popupW;
    side = 'left';
  }

  // Recadrage dans la zone 3D. L'ergot, lui, reste sur la planète : c'est ce
  // qui permet de recadrer la carte sans perdre ce qu'elle désigne.
  const x = Math.round(clamp(left, MARGIN, Math.max(MARGIN, hostW - popupW - MARGIN)));
  const y = Math.round(clamp(cy - popupH / 2, MARGIN, Math.max(MARGIN, hostH - popupH - MARGIN)));

  // Borné aux coins : au-delà, l'ergot déborde de l'arrondi de la carte et
  // flotte dans le vide au lieu d'en prolonger le bord.
  const arrowY = Math.round(
    clamp(cy - y, ARROW_INSET, Math.max(ARROW_INSET, popupH - ARROW_INSET)),
  );

  return { x, y, arrowY, side };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
