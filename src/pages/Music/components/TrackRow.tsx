import { useEffect, useRef, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLazyCoverArt, type TrackMeta } from '../../../features/music/useTrackMeta';
import type { EnrichedData } from '../../../features/music/enrichMeta';
import type { TrackWithIdx } from '../lib/folderTree';
import { fmtDuration } from '../lib/format';
import { Equalizer } from './Equalizer';
import css from './TrackRow.module.css';

/**
 * En-tête des colonnes, au-dessus de la liste.
 *
 * Il annonce ce que chaque colonne contient — sans lui, une suite de nombres à
 * droite ne se lit pas comme des durées.
 */
export function EnTeteColonnes() {
  const { t } = useTranslation();
  return (
    <div className={css.enTete} aria-hidden="true">
      <span className={css.rang}>#</span>
      <span />
      <span>{t('music.columnTitle')}</span>
      <span className={css.album}>{t('music.columnAlbum')}</span>
      <span className={css.duree}>{t('music.columnDuration')}</span>
    </div>
  );
}

type Props = {
  track: TrackWithIdx;
  /** Rang affiché, à partir de 1. */
  rang: number;
  active: boolean;
  enLecture: boolean;
  meta: TrackMeta | null;
  enriched: EnrichedData | null;
  onSelect: () => void;
  onContextMenu: (e: MouseEvent) => void;
  /** Cible du défilement automatique — la liste principale seulement. */
  cibleDefilement?: boolean;
};

/**
 * Une piste, en ligne.
 *
 * La carte à pochette qu'on affichait convenait à un navigateur de fichiers,
 * pas à un lecteur : elle montrait le titre et l'artiste, et laissait de côté
 * l'album et la durée que les fichiers portent pourtant. Une ligne les donne
 * tous d'un coup d'œil, et vingt pistes tiennent où six cartes tenaient.
 *
 * Le rang laisse place au symbole de lecture au survol : c'est le geste attendu
 * d'un lecteur, et il évite un bouton de plus par ligne.
 */
export function TrackRow({
  track,
  rang,
  active,
  enLecture,
  meta,
  enriched,
  onSelect,
  onContextMenu,
  cibleDefilement = false,
}: Props) {
  const ligne = useRef<HTMLButtonElement>(null);
  // La pochette embarquée n'est lue que lorsque la ligne entre dans la vue.
  const pochetteId3 = useLazyCoverArt(track.path, ligne);

  // Priorité : ce que porte le fichier, puis ce qu'on a trouvé en ligne.
  const pochette = pochetteId3 ?? enriched?.coverUrl ?? null;
  const artiste = meta?.artist ?? enriched?.artist ?? null;
  const album = meta?.album ?? enriched?.album ?? null;
  const duree = meta?.durationSecs ?? null;

  // Ramène la piste en cours dans la vue.
  useEffect(() => {
    if (!active || !cibleDefilement) return;
    const minuteur = setTimeout(
      () => ligne.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      80,
    );
    return () => clearTimeout(minuteur);
  }, [active, cibleDefilement]);

  return (
    <button
      ref={ligne}
      type="button"
      className={[css.ligne, active ? css.ligneActive : ''].filter(Boolean).join(' ')}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      aria-current={active ? 'true' : undefined}
      data-trackactive={active && cibleDefilement ? 'true' : undefined}
    >
      <span className={css.rang}>
        {active && enLecture ? (
          <Equalizer />
        ) : (
          <>
            <span className={css.numero}>{rang}</span>
            <svg className={css.lecture} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </>
        )}
      </span>

      <span className={css.pochette}>
        {pochette && <img src={pochette} alt="" aria-hidden="true" draggable={false} />}
      </span>

      <span className={css.titres}>
        <span className={css.titre}>{track.title}</span>
        {artiste && <span className={css.artiste}>{artiste}</span>}
      </span>

      <span className={css.album}>{album}</span>
      <span className={css.duree}>{duree != null ? fmtDuration(duree) : ''}</span>
    </button>
  );
}
