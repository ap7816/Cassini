import { useEffect, useRef } from 'react';
import { useLazyCoverArt, type TrackMeta } from '../../../features/music/useTrackMeta';
import type { EnrichedData } from '../../../features/music/enrichMeta';
import { countTracks, hasActive, type FolderNode, type TrackWithIdx } from '../lib/folderTree';
import { fmtDuration } from '../lib/format';
import { Equalizer } from './Equalizer';
import css from './GridCards.module.css';

type FolderCardProps = {
  folder: FolderNode;
  color: string;
  currentIndex: number;
  isPlaying: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
};

/** Carte de dossier : compte les pistes, signale la lecture en cours. */
export function FolderCard({
  folder, color, currentIndex, isPlaying, onClick, onContextMenu,
}: FolderCardProps) {
  const active = hasActive(folder, currentIndex);
  const total = countTracks(folder);

  return (
    <button
      className={`${css.gridItem} ${active ? css.gridItemFolderActive : ''}`}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
    >
      <div
        className={css.folderShape}
        style={{ '--fc': color, '--fc-dark': color + 'bb' } as React.CSSProperties}
      >
        <div className={css.folderShapeTab} />
        <div className={css.folderShapeBody}>
          {active && isPlaying ? (
            <Equalizer />
          ) : active ? (
            <span className={css.folderActiveDot} />
          ) : (
            <span className={css.folderCount}>{total}</span>
          )}
        </div>
      </div>
      <span className={css.gridLabel}>{folder.name}</span>
    </button>
  );
}

type TrackCardProps = {
  track: TrackWithIdx;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  meta: TrackMeta | null;
  enriched: EnrichedData | null;
  /** true = cible du défilement automatique (grille principale uniquement). */
  scrollTarget?: boolean;
};

/** Carte de piste : pochette, artiste et durée. */
export function TrackCard({
  track, index, isActive, isPlaying, onSelect, onContextMenu,
  meta, enriched, scrollTarget = false,
}: TrackCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  // La pochette ID3 n'est lue que lorsque la carte entre dans la vue
  const coverArt = useLazyCoverArt(track.path, cardRef);
  const duration = meta?.durationSecs ?? undefined;

  // Priorité pochette : ID3 embarquée > URL enrichie iTunes/Deezer
  const cover = coverArt ?? enriched?.coverUrl ?? null;
  // Priorité artiste : tag ID3 > artiste enrichi
  const artist = meta?.artist ?? enriched?.artist ?? null;

  // Centre automatiquement la piste active dans la vue
  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(
      () => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      80,
    );
    return () => clearTimeout(timer);
  }, [isActive]);

  return (
    <button
      ref={cardRef}
      className={[
        css.gridItem,
        isActive ? css.gridItemTrackActive : '',
        cover ? css.gridItemWithArt : '',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e);
      }}
      data-trackactive={isActive && scrollTarget ? 'true' : undefined}
    >
      <div className={`${css.trackShape}${cover ? ` ${css.trackShapeWithArt}` : ''}`}>
        {cover && (
          <img
            src={cover}
            className={css.trackArt}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        )}

        <div
          className={`${css.trackShapeContent}${
            cover && isActive ? ` ${css.trackShapeActiveArtOverlay}` : ''
          }`}
        >
          {isActive && isPlaying ? (
            <Equalizer />
          ) : !cover ? (
            <span className={css.trackNum}>{index + 1}</span>
          ) : null}

          {!cover && duration != null && (
            <span className={css.trackDurationGrid}>{fmtDuration(duration)}</span>
          )}
        </div>

        {/* Badge de durée en coin, uniquement quand une pochette est affichée */}
        {cover && duration != null && (
          <span className={css.trackDurationBadge}>{fmtDuration(duration)}</span>
        )}
      </div>

      <span className={css.gridLabel}>{track.title}</span>
      {artist && <span className={css.trackArtist}>{artist}</span>}
    </button>
  );
}
