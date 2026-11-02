import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { REGLES_IMAGE, preparerImageIcone, type ErreurImage } from '../lib/imageIcone';
import css from './ChoixImageIcone.module.css';

type Props = {
  /** Image importée, déjà préparée ; `null` tant qu'il n'y en a pas. */
  image: string | null;
  /** L'image est-elle l'icône retenue, plutôt qu'un dessin de la grille ? */
  active: boolean;
  /** Une nouvelle image vient d'être préparée : elle devient l'icône. */
  onImage: (image: string) => void;
  /** Reprendre l'image importée comme icône. */
  onActiver: () => void;
  /** Oublier l'image importée. */
  onRetirer: () => void;
};

/**
 * Importer sa propre image comme icône de système.
 *
 * Les règles sont écrites sous le bouton plutôt que découvertes à l'échec. Ce
 * qui les respecte est accepté tel quel, quelle que soit sa taille : une
 * grande image est recadrée, un logo détouré rogné de ses marges, une icône
 * minuscule agrandie sans flou (voir `imageIcone.ts`). Seul ce qui ne peut
 * vraiment pas faire une icône est refusé, avec la raison.
 *
 * Le fichier peut aussi être déposé sur la vignette.
 */
export function ChoixImageIcone({ image, active, onImage, onActiver, onRetirer }: Props) {
  const { t } = useTranslation();
  const champ = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<ErreurImage | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [survol, setSurvol] = useState(false);

  async function traiter(fichier: File | undefined) {
    if (!fichier) return;
    setErreur(null);
    setEnCours(true);
    try {
      const resultat = await preparerImageIcone(fichier);
      if ('erreur' in resultat) setErreur(resultat.erreur);
      else onImage(resultat.image);
    } finally {
      setEnCours(false);
      // Rechoisir le même fichier après une erreur doit relancer le traitement.
      if (champ.current) champ.current.value = '';
    }
  }

  function deposer(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    void traiter(e.dataTransfer.files[0]);
  }

  return (
    <div className={css.bloc}>
      <button
        type="button"
        className={[
          css.vignette,
          active && image ? css.vignetteActive : '',
          survol ? css.vignetteSurvol : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => (image ? onActiver() : champ.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
        aria-pressed={image ? active : undefined}
        aria-label={image ? t('systems.image.use') : t('systems.image.choose')}
        title={image ? t('systems.image.use') : t('systems.image.drop')}
      >
        {image ? (
          <img src={image} alt="" className={css.apercu} draggable={false} />
        ) : (
          <svg viewBox="0 0 24 24" className={css.vide} aria-hidden="true">
            <path d="M4 5h16v14H4z" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 16l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className={css.textes}>
        <div className={css.actions}>
          <button
            type="button"
            className={css.bouton}
            onClick={() => champ.current?.click()}
            disabled={enCours}
          >
            {enCours
              ? t('systems.image.preparing')
              : image
                ? t('systems.image.change')
                : t('systems.image.choose')}
          </button>
          {image && !enCours && (
            <button type="button" className={css.retirer} onClick={onRetirer}>
              {t('systems.image.remove')}
            </button>
          )}
        </div>
        <p className={erreur ? css.erreur : css.regles} aria-live="polite">
          {erreur ? t(`systems.image.errors.${erreur}`) : t('systems.image.rules')}
        </p>
      </div>

      <input
        ref={champ}
        type="file"
        accept={REGLES_IMAGE.types.join(',')}
        className={css.champ}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void traiter(e.target.files?.[0])}
      />
    </div>
  );
}
