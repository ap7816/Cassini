import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePiegeFocus } from '../../hooks/useFocus';
import { ReglagesContenu } from './ReglagesContenu';
import css from './PanneauReglages.module.css';

type Props = {
  onFermer: () => void;
};

/**
 * Réglages posés sur l'application, sans quitter ce qu'on regarde.
 *
 * Aller aux Paramètres depuis le système solaire démontait la scène — renderer,
 * textures, galaxie — pour la reconstruire au retour. Le panneau supprime ce
 * trajet : un clic pour l'ouvrir, Échap pour le fermer, la vue reste derrière.
 *
 * La recherche est en tête, avant les onglets : parmi une soixantaine de
 * réglages, taper deux lettres est le chemin le plus court. Le contenu, lui,
 * est exactement celui de la page — même composant, pas une seconde interface à
 * tenir à jour.
 */
export function PanneauReglages({ onFermer }: Props) {
  const { t } = useTranslation();
  const [recherche, setRecherche] = useState('');
  const fenetre = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  usePiegeFocus(fenetre);

  // Le focus va à la recherche : c'est par elle qu'on atteint un réglage le
  // plus vite, et elle n'engage rien si on ne tape pas.
  useEffect(() => {
    champ.current?.focus();
  }, []);

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
        aria-label={t('settings.title')}
      >
        <header className={css.entete}>
          <h2 className={css.titre}>{t('settings.title')}</h2>
          <button
            type="button"
            className={css.fermer}
            onClick={onFermer}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </header>

        <input
          ref={champ}
          type="search"
          className={css.recherche}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('settings.searchPlaceholder')}
          aria-label={t('settings.searchPlaceholder')}
        />

        {/* Pas de numéro de version ici : il est affiché sous le bouton qui
            ouvre ce panneau, dans la barre des launchers. */}
        <div className={css.corps}>
          <ReglagesContenu recherche={recherche} />
        </div>
      </div>
    </div>
  );
}
