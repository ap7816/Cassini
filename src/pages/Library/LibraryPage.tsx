import css from "./LibraryPage.module.css";
import { useLibraryGames } from "../../features/Library/hooks/useLibraryGames";
import { EmptyState } from "../../features/Library/components/EmptyState";
import { GameCard } from "../../features/Library/components/GameCard";

export function LibraryPage() {
  const { games, isEmpty, installedCount, loadSamples, clearLibrary, removeGame } =
    useLibraryGames();

  return (
    <div className={css.page}>
      <div className={css.headerRow}>
        <div>
          <h1 className={css.title}>Library</h1>
          <p className={css.subtitle}>
            {isEmpty
              ? "Your games will appear here."
              : `${games.length} games • ${installedCount} installed`}
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
            <GameCard key={g.id} game={g} onRemove={removeGame} />
          ))}
        </div>
      )}
    </div>
  );
}
