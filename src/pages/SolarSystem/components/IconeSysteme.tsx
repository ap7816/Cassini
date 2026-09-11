import { iconeParNom } from '../lib/iconesSysteme';

/**
 * Icône d'un système personnalisé, teintée de sa couleur.
 *
 * `taille` fixe les attributs du SVG ; une classe CSS qui impose largeur et
 * hauteur l'emporte, ce qui permet à la barre des launchers de suivre le
 * réglage de taille des icônes.
 */
export function IconeSysteme({
  nom,
  couleur,
  taille = 20,
  className,
}: {
  nom: string;
  couleur: string;
  taille?: number;
  className?: string;
}) {
  const dessin = iconeParNom(nom);
  return (
    <svg className={className} width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true">
      {dessin.calques.map((c, i) =>
        c.trait ? (
          <path
            key={i}
            d={c.d}
            fill="none"
            stroke={couleur}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path key={i} d={c.d} fill={couleur} fillRule="evenodd" />
        ),
      )}
    </svg>
  );
}
