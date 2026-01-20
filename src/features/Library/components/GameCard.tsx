import type { Game } from "../types";
import css from "./GameCard.module.css";

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
};

function formatLastPlayed(iso?: string | null) {
  if (!iso) return "Never played";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return `Last played: ${d.toLocaleDateString()}`;
}

export function GameCard({ game, onRemove, onPlay }: Props) {
  const canPlay = Boolean(game.installed && game.launchUrl);

  return (
    <article className={css.card}>
      <div className={css.cover} aria-hidden="true">
        {game.title.slice(0, 1).toUpperCase()}
      </div>

      <div className={css.body}>
        <div className={css.topRow}>
          <div className={css.titleWrap}>
            <div className={css.title}>{game.title}</div>
            <div className={css.meta}>
              <span className={css.badge}>{game.platform}</span>
              <span className={css.dot} aria-hidden="true">•</span>
              <span className={css.muted}>
                {game.installed ? "Installed" : "Not installed"}
              </span>
            </div>
          </div>

          <div className={css.actions}>
            <button
              type="button"
              className={css.play}
              onClick={() => onPlay(game)}
              disabled={!canPlay}
              title={!canPlay ? "Not available" : "Launch"}
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
