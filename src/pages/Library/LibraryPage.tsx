import css from "./LibraryPage.module.css";
import { useLibraryGames } from "../../features/library/hooks/useLibraryGames";
import { EmptyState } from "../../features/library/components/EmptyState";
import { GameCard } from "../../features/library/components/GameCard";
import { launchGame } from "../../features/library/services/launchGame";
import type { Game } from "../../features/library/types";

export function LibraryPage() {
  const { games, isEmpty, installedCount, loadSamples, clearLibrary, removeGame } =
    useLibraryGames();

  async function handlePlay(game: Game) {
    const res = await launchGame(game);
    if (!res.ok) {
      // simple feedback (on pourra faire un toast plus tard)
      console.warn(res.reason, res.message);
    }
  }

  return (
    <div className={css.page}>
      <div className={css.headerRow}>
        <div>
          <h1 className={css.title}>Library</h1>
          <p className={css.subtitle}>
            {isEmpty ? "Your games will appear here." : `${games.length} games • ${installedCount} installed`}
          </p>
        </div>

        <div className={css.actions}>
          <button type="button" className={css.button} onClick={loadSamples}>
            Load samples
          </button>
          <button
            type="button"
            className={css.button}
            onClick={clearLibrary}
            disabled={isEmpty}
            aria-disabled={isEmpty}
          >
            Clear
          </button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState onLoadSamples={loadSamples} />
      ) : (
        <div className={css.grid}>
          {games.map((g) => (
            <GameCard key={g.id} game={g} onRemove={removeGame} onPlay={handlePlay} />
          ))}
        </div>
      )}
    </div>
  );
}
