import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../../types';
import css from './GameCard.module.css';
import { fetchRawgImage } from '../services/rawgService';

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onSetImageUrl: (id: string, url: string | null) => void;
  rawgApiKey: string;
};

const lastPlayedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatLastPlayed(iso?: string | null) {
  if (!iso) return 'Never played';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `Last played: ${lastPlayedFormatter.format(d)}`;
}

export function GameCard({ game, onRemove, onPlay, onToggleFavorite, onSetImageUrl, rawgApiKey }: Props) {
  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);
  const lastPlayedLabel = useMemo(() => formatLastPlayed(game.lastPlayedAt), [game.lastPlayedAt]);
  const [imgFailed, setImgFailed] = useState(false);
  const [rawgUrl, setRawgUrl] = useState<string | null>(null);

  // Priorité : customImageUrl > RAWG > fallback lettre
  const bannerUrl = game.customImageUrl ?? rawgUrl;
  const showFallback = !bannerUrl || imgFailed;

  // Fetch RAWG pour tous les jeux sans image custom
  useEffect(() => {
    if (game.customImageUrl || !rawgApiKey) return;
    setRawgUrl(null);
    setImgFailed(false);
    fetchRawgImage(game.title, rawgApiKey).then((url) => {
      if (url) setRawgUrl(url);
    });
  }, [game.title, game.customImageUrl, rawgApiKey]);

  function handleSetImage() {
    const current = game.customImageUrl ?? '';
    const url = window.prompt("URL de l'image :", current);
    if (url === null) return;
    onSetImageUrl(game.id, url.trim() || null);
    setImgFailed(false);
  }

  return (
    <article className={[css.card, isFav ? css.cardFavorite : ''].join(' ')}>
      {!showFallback ? (
        <div className={css.banner}>
          <img
            className={css.bannerImg}
            src={bannerUrl!}
            alt=""
            onError={() => setImgFailed(true)}
          />
          {game.customImageUrl && (
            <button
              type="button"
              className={css.bannerEdit}
              onClick={handleSetImage}
              title="Modifier l'image"
            >
              ✎
            </button>
          )}
        </div>
      ) : (
        <div className={css.bannerFallback}>
          <span>{game.title.slice(0, 1).toUpperCase()}</span>
          <button
            type="button"
            className={css.bannerEditFallback}
            onClick={handleSetImage}
            title="Définir une image"
          >
            + image
          </button>
        </div>
      )}

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
