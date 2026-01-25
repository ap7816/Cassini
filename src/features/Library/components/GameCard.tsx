import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../../types';
import css from './GameCard.module.css';

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleInstalled: (id: string) => void;
  onToggleFavorite: (id: string) => void; // NEW
};

function formatLastPlayed(iso?: string | null) {
  if (!iso) return 'Never played';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `Last played: ${d.toLocaleDateString()}`;
}

function isLocalWindowsPath(input: string): boolean {
  // ex: C:\... or \\server\share\...
  return /^[a-zA-Z]:\\/.test(input) || input.startsWith('\\\\');
}

export function GameCard({ game, onRemove, onPlay, onToggleInstalled, onToggleFavorite }: Props) {
  const canPlay = Boolean(game.installed && game.launchUrl);

  // coverUrl peut être:
  // - null/undefined (pas d’icône)
  // - un path local Windows (icône Steam)
  // - une URL web (si plus tard tu ajoutes d'autres plateformes)
  const initialCover = useMemo(() => game.coverUrl ?? null, [game.coverUrl]);

  const [coverUrl, setCoverUrl] = useState<string | null>(initialCover);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  // reset quand le jeu change / cover change
  useEffect(() => {
    setCoverUrl(initialCover);
    setImgSrc(null);
  }, [initialCover, game.id]);

  // transforme un path local -> src affichable via Tauri
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!coverUrl) {
        if (!cancelled) setImgSrc(null);
        return;
      }

      // URL web -> direct
      if (!isLocalWindowsPath(coverUrl)) {
        if (!cancelled) setImgSrc(coverUrl);
        return;
      }

      // path local -> convertFileSrc
      try {
        const mod = await import('@tauri-apps/api/core');
        const converted = mod.convertFileSrc(coverUrl);
        if (!cancelled) setImgSrc(converted);
      } catch {
        // si pas dans Tauri, ça ne marchera probablement pas, mais on tente
        if (!cancelled) setImgSrc(coverUrl);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  function handleToggleInstalled() {
    if (game.installed) {
      const ok = window.confirm(`Uninstall "${game.title}" ?`);
      if (!ok) return;
    }
    onToggleInstalled(game.id);
  }

  function handleImageError() {
    // IMPORTANT: pas de fallback web pour Steam icon.
    setCoverUrl(null);
    setImgSrc(null);
  }

  const showLetter = !imgSrc;
  const isFav = Boolean(game.favorite);

  return (
    <article className={css.card}>
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
            <div className={css.title}>{game.title}</div>
            <div className={css.meta}>
              <span className={css.badge}>{game.platform}</span>
              <span className={css.dot} aria-hidden="true">
                •
              </span>
              <span className={css.muted}>{game.installed ? 'Installed' : 'Not installed'}</span>
            </div>
          </div>

          <div className={css.actions}>
            <button
              type="button"
              className={[css.fav, isFav ? css.favActive : ''].join(' ')}
              onClick={() => onToggleFavorite(game.id)}
              aria-label={isFav ? `Remove ${game.title} from favorites` : `Add ${game.title} to favorites`}
              title={isFav ? 'Unfavorite' : 'Favorite'}
            >
              ★
            </button>

            <button
              type="button"
              className={css.secondary}
              onClick={handleToggleInstalled}
              title={game.installed ? 'Uninstall' : 'Install'}
            >
              {game.installed ? 'Uninstall' : 'Install'}
            </button>

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

        <div className={css.footer}>{formatLastPlayed(game.lastPlayedAt)}</div>
      </div>
    </article>
  );
}
