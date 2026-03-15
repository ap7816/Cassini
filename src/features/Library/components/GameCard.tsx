import { useMemo } from 'react';
import type { Game } from '../../types';
import css from './GameCard.module.css';
type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
};

const lastPlayedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatLastPlayed(iso?: string | null) {
  if (!iso) return 'Never played';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `Last played: ${lastPlayedFormatter.format(d)}`;
}

export function GameCard({ game, onRemove, onPlay, onToggleFavorite }: Props) {
  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);
  const lastPlayedLabel = useMemo(() => formatLastPlayed(game.lastPlayedAt), [game.lastPlayedAt]);

  return (
    <article className={[css.card, isFav ? css.cardFavorite : ''].join(' ')}>
      <div className={css.cover} aria-hidden="true">
        {game.title.slice(0, 1).toUpperCase()}
      </div>

      <div className={css.body}>
        <div className={css.topRow}>
          <div className={css.titleWrap}>
            <div className={css.titleRow}>
              <div className={css.title}>{game.title}</div>

              <button
                type="button"
                className={[css.fav, isFav ? css.favActive : ''].join(' ')}
                onClick={() => onToggleFavorite(game.id)}
                aria-label={isFav ? `Unfavorite ${game.title}` : `Favorite ${game.title}`}
                aria-pressed={isFav}
                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFav ? '★' : '☆'}
              </button>
            </div>

            <div className={css.meta}>
              <span className={css.badge}>{game.platform}</span>
              {isFav && <span className={css.favPill}>Favorite</span>}
              <span className={css.dot} aria-hidden="true">
                •
              </span>
              <span className={css.muted}>{game.installed ? 'Installed' : 'Not installed'}</span>
            </div>
          </div>

          <div className={css.actions}>
            <button
              type="button"
              className={css.play}
              onClick={() => onPlay(game)}
              disabled={!canPlay}
              title={!canPlay ? 'Not available' : 'Launch'}
            >
              Play
            </button>

            <button
              type="button"
              className={css.remove}
              onClick={() => onRemove(game.id)}
              aria-label={`Remove ${game.title}`}
              title="Remove"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={css.footer}>{lastPlayedLabel}</div>
      </div>
    </article>
  );
}
