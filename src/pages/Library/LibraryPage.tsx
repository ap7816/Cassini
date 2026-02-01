import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import css from './LibraryPage.module.css';
import { useLibraryGames } from '../../features/library/hooks/useLibraryGames';
import { EmptyState } from '../../features/library/components/EmptyState';
import { GameCard } from '../../features/library/components/GameCard';
import { launchGame } from '../../features/library/services/launchGame';
import type { Game } from '../../features/types';

type ViewMode = 'all' | 'favorites';

function getTimestamp(iso?: string | null): number {
  if (!iso) return -1;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : -1;
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Search (URL param: q)
  const qRaw = searchParams.get('q') ?? '';
  const q = qRaw.trim().toLowerCase();

  // View mode (URL param: view=favorites)
  const view: ViewMode = searchParams.get('view') === 'favorites' ? 'favorites' : 'all';

  const {
    games,
    isEmpty,
    installedCount,
    favoritesCount,
    loadSamples,
    removeGame,
    toggleInstalled,
    toggleFavorite,
    markPlayed,
    scanError,
  } = useLibraryGames();

  function setView(next: ViewMode) {
    const p = new URLSearchParams(searchParams);
    if (next === 'favorites') p.set('view', 'favorites');
    else p.delete('view');
    setSearchParams(p, { replace: true });
  }

  function clearSearch() {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  }

  async function handlePlay(game: Game) {
    const res = await launchGame(game);
    if (!res.ok) {
      window.alert(res.message);
      return;
    }
    // update UI instantly
    markPlayed(game.id);
  }

  const baseList = useMemo(() => {
    if (view === 'favorites') return games.filter((g) => Boolean(g.favorite));
    return games;
  }, [games, view]);

  const filteredGames = useMemo(() => {
    const list = q ? baseList.filter((g) => g.title.toLowerCase().includes(q)) : baseList;

    // tri: lastPlayed desc, puis alpha
    return list.slice().sort((a, b) => {
      const tb = getTimestamp(b.lastPlayedAt);
      const ta = getTimestamp(a.lastPlayedAt);
      if (tb !== ta) return tb - ta;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
  }, [baseList, q]);

  const showNoResults = baseList.length > 0 && q.length > 0 && filteredGames.length === 0;

  // États vides
  const isFavoritesEmpty = view === 'favorites' && favoritesCount === 0 && !q;

  return (
    <div className={css.page}>
      <div className={css.headerRow}>
        <div>
          <h1 className={css.title}>Library</h1>
          <p className={css.subtitle}>
            {isEmpty
              ? 'Your games will appear here.'
              : view === 'favorites'
                ? `${favoritesCount} favorite(s) • ${games.length} total`
                : q
                  ? `${filteredGames.length} result(s) • ${games.length} total`
                  : `${games.length} games • ${installedCount} installed`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className={css.tabs} role="tablist" aria-label="Library view">
        <button
          type="button"
          className={[css.tab, view === 'all' ? css.tabActive : ''].join(' ')}
          onClick={() => setView('all')}
          role="tab"
          aria-selected={view === 'all'}
        >
          All <span className={css.count}>{games.length}</span>
        </button>

        <button
          type="button"
          className={[css.tab, view === 'favorites' ? css.tabActive : ''].join(' ')}
          onClick={() => setView('favorites')}
          role="tab"
          aria-selected={view === 'favorites'}
        >
          Favorites <span className={css.count}>{favoritesCount}</span>
        </button>
      </div>

      {scanError && <div className={css.error}>{scanError}</div>}

      {isEmpty ? (
        <EmptyState onLoadSamples={loadSamples} />
      ) : isFavoritesEmpty ? (
        <div className={css.empty}>
          <div className={css.emptyTitle}>No favorites yet</div>
          <div className={css.emptyText}>Click ★ on a game to add it to favorites.</div>
          <button type="button" className={css.button} onClick={() => setView('all')}>
            Go to all games
          </button>
        </div>
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
        <>
          {/* In Favorites view: show titles list */}
          {view === 'favorites' && filteredGames.length > 0 && (
            <div className={css.favTitles}>
              <div className={css.favTitlesLabel}>Favorite titles</div>
              <ul className={css.favTitlesList}>
                {filteredGames.map((g) => (
                  <li key={`fav-title-${g.id}`} className={css.favTitleItem}>
                    {g.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={css.grid}>
            {filteredGames.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                onRemove={removeGame}
                onPlay={handlePlay}
                onToggleInstalled={toggleInstalled}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
