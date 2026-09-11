import { useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import css from './PoigneeLargeur.module.css';

type Props = {
  /** Largeur actuelle de la colonne, en pixels. */
  valeur: number;
  min: number;
  max: number;
  libelle: string;
  /** Distance au bord droit de la page, en CSS : la frontière à saisir. */
  droite: string;
  /** Pendant le glissement. */
  onChange: (v: number) => void;
  /** Au relâchement : le moment d'enregistrer. */
  onFin: (v: number) => void;
  /** Double-clic : retour à la largeur calculée. */
  onDefaut: () => void;
};

/**
 * Poignée de redimensionnement d'une colonne.
 *
 * Elle mesure le déplacement depuis son point de saisie, et non la position du
 * pointeur dans la page : la largeur suit exactement la main, quelle que soit
 * la géométrie autour, et le calcul ne dépend d'aucun parent.
 *
 * Utilisable au clavier — c'est un `separator` que l'on déplace aux flèches,
 * comme n'importe quel séparateur de volets.
 */
export function PoigneeLargeur({ valeur, min, max, libelle, droite, onChange, onFin, onDefaut }: Props) {
  const { t } = useTranslation();
  const depart = useRef<{ x: number; valeur: number } | null>(null);
  const dernier = useRef(valeur);

  const borner = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const poser = (v: number) => {
    dernier.current = v;
    onChange(v);
  };

  return (
    <div
      className={css.poignee}
      style={{ right: droite } as CSSProperties}
      role="separator"
      aria-orientation="vertical"
      aria-label={libelle}
      aria-valuenow={valeur}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={t('solar.resizeHint', { label: libelle })}
      onDoubleClick={onDefaut}
      onPointerDown={(e) => {
        depart.current = { x: e.clientX, valeur };
        dernier.current = valeur;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!depart.current) return;
        // La colonne est à droite : tirer vers la gauche l'élargit.
        poser(borner(depart.current.valeur + (depart.current.x - e.clientX)));
      }}
      onPointerUp={(e) => {
        if (!depart.current) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        depart.current = null;
        onFin(dernier.current);
      }}
      onKeyDown={(e) => {
        const pas = e.shiftKey ? 32 : 8;
        let v: number | null = null;
        if (e.key === 'ArrowLeft') v = valeur + pas;
        else if (e.key === 'ArrowRight') v = valeur - pas;
        else if (e.key === 'Home') v = max;
        else if (e.key === 'End') v = min;
        if (v === null) return;
        e.preventDefault();
        const borne = borner(v);
        poser(borne);
        onFin(borne);
      }}
    />
  );
}
