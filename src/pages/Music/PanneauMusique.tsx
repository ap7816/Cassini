import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePiegeFocus } from '../../hooks/useFocus';
import { LecteurRapide } from './LecteurRapide';
import css from './PanneauMusique.module.css';

type Props = {
  onFermer: () => void;
};

/**
 * La musique posée sur la vue, et non dans une page à part.
 *
 * Un lecteur, pas une bibliothèque : quitter le système solaire pour changer
 * d'album, c'est perdre ce qu'on regardait. Le panneau tient donc dans une
 * colonne étroite, comme celui des réglages — le rangement, lui, reste à la
 * page, qu'un lien du lecteur ouvre.
 */
export function PanneauMusique({ onFermer }: Props) {
  const { t } = useTranslation();
  const fenetre = useRef<HTMLDivElement>(null);
  usePiegeFocus(fenetre);

  // Échap ferme. En capture : la scène écoute aussi le clavier, et une touche
  // qui la traverse ferait décoller la caméra derrière le panneau.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onFermer();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onFermer]);

  return (
    <div
      className={css.fond}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        ref={fenetre}
        className={css.panneau}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.music')}
      >
        <header className={css.entete}>
          <h2 className={css.titre}>{t('nav.music')}</h2>
          <button
            type="button"
            className={css.fermer}
            onClick={onFermer}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            ✕
          </button>
        </header>

        <LecteurRapide onFermer={onFermer} />
      </div>
    </div>
  );
}
