import { useEffect, useMemo, useState } from 'react';
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

function isLocalWindowsPath(input: string): boolean {
  return /^[a-zA-Z]:\\/.test(input) || input.startsWith('\\\\');
}

export function GameCard({ game, onRemove, onPlay, onToggleFavorite }: Props) {
  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);

  const [coverUrl, setCoverUrl] = useState<string | null>(game.coverUrl ?? null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  useEffect(() => {
    setCoverUrl(game.coverUrl ?? null);
    setImgSrc(null);
  }, [game.coverUrl, game.id]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!coverUrl) {
        if (!cancelled) setImgSrc(null);
        return;
      }

      if (!isLocalWindowsPath(coverUrl)) {
        if (!cancelled) setImgSrc(coverUrl);
        return;
      }

      try {
        const mod = await import('@tauri-apps/api/core');
        const converted = mod.convertFileSrc(coverUrl);
        if (!cancelled) setImgSrc(converted);
      } catch {
        if (!cancelled) setImgSrc(coverUrl);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  function handleImageError() {
    setCoverUrl(null);
    setImgSrc(null);
  }

  const showLetter = !imgSrc;
  const lastPlayedLabel = useMemo(() => formatLastPlayed(game.lastPlayedAt), [game.lastPlayedAt]);

  return (
    <article className={[css.card, isFav ? css.cardFavorite : ''].join(' ')}>
      <div className={css.cover} aria-hidden="true">
        {!showLetter ? (
          <img
            className={css.coverImg}
            src={imgSrc}
            alt=""
            loading="lazy"
            draggable={false}
            onError={handleImageError}
          />
        ) : (
          game.title.slice(0, 1).toUpperCase()
        )}
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
