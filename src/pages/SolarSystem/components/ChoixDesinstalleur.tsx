import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { usePiegeFocus } from '../../../hooks/useFocus';
import type { EntreeDesinstallation } from '../../../features/library/services/uninstallGame';
import css from './ChoixDesinstalleur.module.css';

type Props = {
  /** Titre du jeu, rappelé en tête : c'est lui qu'on cherche à désinstaller. */
  jeu: string;
  entrees: EntreeDesinstallation[];
  /** L'utilisateur a désigné l'entrée à désinstaller. */
  onChoisir: (entree: EntreeDesinstallation) => void;
  onFermer: () => void;
};

/**
 * Choisir soi-même le programme à désinstaller.
 *
 * La recherche automatique n'accepte que le nom exact ou le même dossier : un
 * jeu déclaré autrement dans Windows — Hytale sous « Hytale Launcher » — ne
 * serait jamais désinstallable. Assouplir la règle serait pire : c'est ainsi
 * qu'on désinstalle « Portal 2 » en croyant retirer « Portal ».
 *
 * Alors on montre ce que Windows connaît, les plus ressemblants d'abord, et
 * c'est l'utilisateur qui tranche. Chaque entrée affiche son éditeur et son
 * dossier : de quoi reconnaître le bon programme avant de le lancer.
 */
export function ChoixDesinstalleur({ jeu, entrees, onChoisir, onFermer }: Props) {
  const { t } = useTranslation();
  const fenetre = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  usePiegeFocus(fenetre);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    champ.current?.focus();
  }, []);

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

  const q = recherche.trim().toLowerCase();
  const visibles = useMemo(
    () => (q ? entrees.filter((e) => e.nom.toLowerCase().includes(q)) : entrees).slice(0, 200),
    [entrees, q],
  );

  return createPortal(
    <div
      className={css.fond}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        ref={fenetre}
        className={css.fenetre}
        role="dialog"
        aria-modal="true"
        aria-label={t('gameCard.uninstallPickTitle', { name: jeu })}
      >
        <header className={css.entete}>
          <div>
            <h2 className={css.titre}>{t('gameCard.uninstallPickTitle', { name: jeu })}</h2>
            <p className={css.explication}>{t('gameCard.uninstallPickHint')}</p>
          </div>
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

        <input
          ref={champ}
          className={css.recherche}
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('gameCard.uninstallPickSearch')}
          aria-label={t('gameCard.uninstallPickSearch')}
        />

        <ul className={css.liste}>
          {visibles.map((e) => (
            <li key={e.cle}>
              <button
                type="button"
                className={e.proche ? `${css.entree} ${css.entreeProche}` : css.entree}
                onClick={() => onChoisir(e)}
              >
                <span className={css.nom}>{e.nom}</span>
                <span className={css.details}>
                  {[e.editeur, e.emplacement].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className={css.vide}>{t('gameCard.uninstallPickNone')}</li>}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
