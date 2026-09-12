import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePiegeFocus } from '../../../hooks/useFocus';
import css from './AideRaccourcis.module.css';

type Props = {
  onFermer: () => void;
};

/**
 * Un raccourci n'existe que si on peut le découvrir.
 *
 * Ceux de l'application étaient répartis entre trois fichiers et aucun écran :
 * `Ctrl+M` ouvrait la musique depuis le premier jour sans que rien ne le dise.
 * Cette liste est la seule page où ils sont tous, et `?` l'ouvre de partout.
 *
 * Les touches de déplacement n'y figurent pas : elles se règlent, et les
 * recopier ici aurait créé une seconde source de vérité qui finirait par
 * mentir. Le panneau « Commandes » les affiche, et cette liste y renvoie.
 */
export function AideRaccourcis({ onFermer }: Props) {
  const { t } = useTranslation();
  const fenetre = useRef<HTMLDivElement>(null);
  usePiegeFocus(fenetre);

  // En capture : la scène écoute aussi le clavier, et une touche qui la
  // traverse ferait décoller la caméra derrière le dialogue.
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

  const groupes: Array<{ titre: string; lignes: Array<[string, string]> }> = [
    {
      titre: t('shortcuts.groupView'),
      lignes: [
        ['1 – 9', t('shortcuts.system')],
        ['Ctrl + F', t('shortcuts.search')],
        ['F', t('shortcuts.favorite')],
        ['Échap', t('shortcuts.escape')],
      ],
    },
    {
      titre: t('shortcuts.groupPanels'),
      lignes: [
        ['Ctrl + ,', t('nav.settings')],
        ['Ctrl + M', t('shortcuts.music')],
        ['?', t('shortcuts.help')],
      ],
    },
    {
      titre: t('shortcuts.groupPlayer'),
      lignes: [['Espace', t('shortcuts.playPause')]],
    },
  ];

  return (
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
        aria-label={t('shortcuts.title')}
      >
        <header className={css.entete}>
          <h2 className={css.titre}>{t('shortcuts.title')}</h2>
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

        <div className={css.corps}>
          {groupes.map((g) => (
            <section key={g.titre} className={css.groupe}>
              <h3 className={css.groupeTitre}>{g.titre}</h3>
              <dl className={css.liste}>
                {g.lignes.map(([touche, quoi]) => (
                  <div key={touche} className={css.ligne}>
                    <dt className={css.touche}>{touche}</dt>
                    <dd className={css.quoi}>{quoi}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <p className={css.note}>{t('shortcuts.flyNote')}</p>
      </div>
    </div>
  );
}
