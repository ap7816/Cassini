import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import css from './LibraryPage.module.css';
import { useLibraryGames } from '../../features/library/hooks/useLibraryGames';
import { EmptyState } from '../../features/library/components/EmptyState';
import { GameCard } from '../../features/library/components/GameCard';
import { launchGame } from '../../features/library/services/launchGame';
import type { Game } from '../../features/types';

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qRaw = searchParams.get('q') ?? '';
  const q = qRaw.trim().toLowerCase();

  const {
    games,
    isEmpty,
    installedCount,
    loadSamples,
    clearLibrary,
    removeGame,
    toggleInstalled,
    exportToFile,
    importFromFile,
    addGameFromPicker,

    // Steam scan
    scanPcSteam,
    isScanning,
    scanError,
  } = useLibraryGames();

  const filteredGames = useMemo(() => {
    if (!q) return games;
    return games.filter((g) => g.title.toLowerCase().includes(q));
  }, [games, q]);

  function clearSearch() {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  }

  async function handlePlay(game: Game) {
    const res = await launchGame(game);
    if (!res.ok) window.alert(res.message);
  }

  async function handleExport() {
    try {
      await exportToFile();
    } catch {
      window.alert('Export failed.');
    }
  }

  async function handleImport() {
    try {
      await importFromFile();
    } catch {
      window.alert('Import failed (invalid file).');
    }
  }

  async function handleAddGame() {
    const res = await addGameFromPicker();
    if (!res.ok && res.message !== 'Cancelled.') window.alert(res.message);
  }

  async function handleScanPc() {
    const res = await scanPcSteam();
    if (!res.ok) {
      // message déjà exposé via scanError, mais on peut aussi alerter
      // window.alert(res.message);
      return;
    }
    if (res.added > 0) {
      // petit feedback (optionnel)
      // window.alert(`${res.added} game(s) added from Steam.`);
    }
  }

  const showNoResults = !isEmpty && q.length > 0 && filteredGames.length === 0;

  return (
    <div className={css.page}>
      <div className={css.headerRow}>
        <div>
          <h1 className={css.title}>Library</h1>
          <p className={css.subtitle}>
            {isEmpty
              ? 'Your games will appear here.'
              : q
                ? `${filteredGames.length} result(s) • ${games.length} total`
                : `${games.length} games • ${installedCount} installed`}
          </p>
        </div>

        <div className={css.actions}>
          <button
            type="button"
            className={css.button}
            onClick={handleScanPc}
            disabled={isScanning}
            aria-disabled={isScanning}
            title="Scan Steam installed games"
          >
            {isScanning ? 'Scanning...' : 'Scan PC'}
          </button>

          <button type="button" className={css.primaryButton} onClick={handleAddGame}>
            Add game
          </button>

          <button type="button" className={css.button} onClick={handleImport}>
            Import
          </button>

          <button
            type="button"
            className={css.button}
            onClick={handleExport}
            disabled={isEmpty}
            aria-disabled={isEmpty}
          >
            Export
          </button>

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

      {scanError && <div className={css.error}>{scanError}</div>}

      {isEmpty ? (
        <EmptyState onLoadSamples={loadSamples} />
      ) : showNoResults ? (
        <div className={css.noResults}>
          <div className={css.noResultsTitle}>No results</div>
          <div className={css.noResultsText}>
            Nothing matches <span className={css.query}>"{qRaw.trim()}"</span>
          </div>
          <button type="button" className={css.button} onClick={clearSearch}>
            Clear search
          </button>
        </div>
      ) : (
        <div className={css.grid}>
          {filteredGames.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              onRemove={removeGame}
              onPlay={handlePlay}
              onToggleInstalled={toggleInstalled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
