import { useMemo, useState } from 'react';
import type { Game } from '../../types';
import css from './GameCard.module.css';

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onSetImageUrl: (id: string, url: string | null) => void;
};

const lastPlayedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatLastPlayed(iso?: string | null) {
  if (!iso) return 'Never played';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `Last played: ${lastPlayedFormatter.format(d)}`;
}

function getSteamAppId(launchUrl?: string | null): string | null {
  if (!launchUrl) return null;
  const match = launchUrl.match(/^steam:\/\/(?:rungameid|run|launch)\/(\d+)/i);
  return match ? match[1] : null;
}

export function GameCard({ game, onRemove, onPlay, onToggleFavorite, onSetImageUrl }: Props) {
  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);
  const lastPlayedLabel = useMemo(() => formatLastPlayed(game.lastPlayedAt), [game.lastPlayedAt]);
  const steamAppId = useMemo(() => getSteamAppId(game.launchUrl), [game.launchUrl]);
  const [imgFailed, setImgFailed] = useState(false);

  // Priorité : customImageUrl > CDN Steam > fallback lettre
  const bannerUrl = game.customImageUrl
    ? game.customImageUrl
    : steamAppId
      ? `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`
      : null;

  const showFallback = !bannerUrl || imgFailed;

  function handleSetImage() {
    const current = game.customImageUrl ?? '';
    const url = window.prompt('URL de l\'image :', current);
    if (url === null) return; // annulé
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
