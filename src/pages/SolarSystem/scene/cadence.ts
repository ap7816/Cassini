/**
 * La limite d'images par seconde.
 *
 * Le navigateur appelle la boucle à la cadence de l'écran — souvent 60 fois
 * par seconde, parfois 165. Au-delà de ce qu'on veut, chaque image est du
 * travail que personne ne verra : la carte chauffe, le ventilateur part, et la
 * batterie se vide pour une galaxie qui tourne déjà sans saccade.
 *
 * Limiter, ici, c'est sauter l'image : on laisse la boucle revenir et on ne
 * dessine que si le temps voulu s'est écoulé.
 *
 * Conséquence à connaître : on ne peut obtenir que des sous-multiples de la
 * cadence de l'écran. À 144 Hz, une image sur deux fait 72, une sur trois 48 —
 * demander 60 donne donc 48. C'est le prix de la régularité : viser 60 au plus
 * près obligerait à alterner deux et trois images d'écran, et cette alternance
 * se voit bien plus qu'une cadence un peu basse mais stable.
 */

/**
 * Faut-il sauter cette image ?
 *
 * `maintenant` et `derniere` sont deux horodatages en millisecondes, et
 * `limite` le nombre d'images voulu par seconde — zéro valant « sans limite ».
 *
 * La demi-milliseconde de marge n'est pas une coquetterie. Les images arrivent
 * à la cadence de l'écran, donc par pas fixes : à 60 Hz, l'écart voulu pour 60
 * images par seconde vaut exactement un pas, et la moindre imprécision d'horloge
 * fait arriver l'image un cheveu trop tôt. Sans marge, elle est sautée, la
 * suivante n'arrive qu'un pas plus tard — et demander soixante images par
 * seconde en donne trente.
 */
export function doitSauterImage(maintenant: number, derniere: number, limite: number): boolean {
  if (limite <= 0) return false;
  return maintenant - derniere < 1000 / limite - 0.5;
}
