import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import css from './LibraryPage.module.css';
import { useLibraryGames } from '../../features/Library/hooks/useLibraryGames';
import { EmptyState } from '../../features/Library/components/EmptyState';
import { GameCard } from '../../features/Library/components/GameCard';
import { launchGame } from '../../features/Library/services/launchGame';
import type { Game } from '../../features/types';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { FilterBar, FilterSelect } from '../../components/FilterChips/FilterChips';

type ViewMode = 'games' | 'favorites';
type PlatformFilter = 'all' | 'Steam' | 'Epic' | 'BattleNet' | 'Other';
type InstalledFilter = 'all' | 'yes' | 'no';
type SortMode = 'recent' | 'az' | 'za';

const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

function getTimestamp(iso?: string | null): number {
  if (!iso) return -1;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : -1;
}

export function LibraryPage() {
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();

  const qRaw = searchParams.get('q') ?? '';
  const q = qRaw.trim().toLowerCase();
  const deferredQ = useDeferredValue(q);

  const view: ViewMode = searchParams.get('view') === 'favorites' ? 'favorites' : 'games';

  const platformFilter = (searchParams.get('platform') ?? 'all') as PlatformFilter;
  const installedFilter = (searchParams.get('installed') ?? 'all') as InstalledFilter;
  const sortMode = (searchParams.get('sort') ?? 'recent') as SortMode;

  function setParam(key: string, value: string, defaultValue: string) {
    const p = new URLSearchParams(searchParams);
    if (value === defaultValue) p.delete(key);
    else p.set(key, value);
    setSearchParams(p, { replace: true });
  }

  const {
    games,
    isEmpty,
    installedCount,
    favoritesCount,
    loadSamples,
    removeGame,
    toggleFavorite,
    setGameImageUrl,
    markPlayed,
    scanPcSteam,
    scanPcEpic,
    scanPcBattlenet,
    isScanning,
    scanError,
  } = useLibraryGames();

  async function handleRefresh() {
    await Promise.all([scanPcSteam(), scanPcEpic(), scanPcBattlenet()]);
  }

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

  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchOverlay, setLaunchOverlay] = useState<{ title: string; phase: 'opening' | 'launched' } | null>(null);

  async function handlePlay(game: Game) {
    setLaunchingId(game.id);
    setLaunchOverlay({ title: game.title, phase: 'opening' });
    const res = await launchGame(game);
    setLaunchingId(null);
    if (!res.ok) {
      setLaunchOverlay(null);
      window.alert(res.message);
      return;
    }
    markPlayed(game.id);
    setLaunchOverlay({ title: game.title, phase: 'launched' });
    setTimeout(() => setLaunchOverlay(null), 2500);
  }

  const preparedGames = useMemo(
    () =>
      games.map((g) => ({
        game: g,
        titleLower: g.title.toLowerCase(),
        lastPlayedTs: getTimestamp(g.lastPlayedAt),
        favorite: Boolean(g.favorite),
      })),
    [games],
  );

  const baseList = useMemo(() => {
    if (view === 'favorites') return preparedGames.filter((g) => g.favorite);
    return preparedGames;
  }, [preparedGames, view]);

  const filteredGames = useMemo(() => {
    let list = deferredQ ? baseList.filter((g) => g.titleLower.includes(deferredQ)) : baseList;
    if (platformFilter !== 'all')
      list = list.filter((g) => g.game.platform === platformFilter);
    if (installedFilter === 'yes')
      list = list.filter((g) => g.game.installed !== false);
    if (installedFilter === 'no')
      list = list.filter((g) => g.game.installed === false);
    return list
      .slice()
      .sort((a, b) => {
        if (sortMode === 'az') return titleCollator.compare(a.game.title, b.game.title);
        if (sortMode === 'za') return titleCollator.compare(b.game.title, a.game.title);
        if (b.lastPlayedTs !== a.lastPlayedTs) return b.lastPlayedTs - a.lastPlayedTs;
        return titleCollator.compare(a.game.title, b.game.title);
      })
      .map((g) => g.game);
  }, [baseList, deferredQ, platformFilter, installedFilter, sortMode]);

  const showNoResults = baseList.length > 0 && deferredQ.length > 0 && filteredGames.length === 0;
  const isFavoritesEmpty = view === 'favorites' && favoritesCount === 0 && !q;

  const subtitleText = isEmpty
    ? t('library.subtitleEmpty')
    : view === 'favorites'
      ? t('library.subtitleFavorites', { count: favoritesCount, total: games.length })
      : q
        ? t('library.subtitleSearch', { count: filteredGames.length, total: games.length })
        : t('library.subtitleDefault', { count: games.length, installed: installedCount });

  return (
    <div className={css.page}>
      <div className={css.headerRow}>
        <div>
          <h1 className={css.title}>{t('library.title')}</h1>
          <p className={css.subtitle}>{subtitleText}</p>
        </div>
        <button
          type="button"
          className={css.button}
          onClick={() => void handleRefresh()}
          disabled={isScanning}
        >
          {isScanning ? t('library.scanning') : t('library.refresh')}
        </button>
      </div>

      <div className={css.tabs} role="tablist" aria-label={t('library.title')}>
        <button
          type="button"
          className={[css.tab, view === 'games' ? css.tabActive : ''].join(' ')}
          onClick={() => setView('games')}
          role="tab"
          aria-selected={view === 'games'}
        >
          {t('library.tabGames')} <span className={css.count}>{games.length}</span>
        </button>

        <button
          type="button"
          className={[css.tab, view === 'favorites' ? css.tabActive : ''].join(' ')}
          onClick={() => setView('favorites')}
          role="tab"
          aria-selected={view === 'favorites'}
        >
          {t('library.tabFavorites')} <span className={css.count}>{favoritesCount}</span>
        </button>
      </div>

      {scanError && <div className={css.error}>{scanError}</div>}

      <FilterBar>
        <FilterSelect<PlatformFilter>
          label={t('filters.platform')}
          options={[
            { value: 'all', label: t('filters.all') },
            { value: 'Steam', label: 'Steam' },
            { value: 'Epic', label: 'Epic' },
            { value: 'BattleNet', label: t('filters.battlenet') },
            { value: 'Other', label: t('filters.other') },
          ]}
          value={platformFilter}
          onChange={(v) => setParam('platform', v, 'all')}
        />
        <FilterSelect<InstalledFilter>
          label={t('filters.status')}
          options={[
            { value: 'all', label: t('filters.all') },
            { value: 'yes', label: t('filters.installedOnly') },
            { value: 'no', label: t('filters.notInstalled') },
          ]}
          value={installedFilter}
          onChange={(v) => setParam('installed', v, 'all')}
        />
        <FilterSelect<SortMode>
          label={t('filters.sort')}
          options={[
            { value: 'recent', label: t('filters.recent') },
            { value: 'az', label: t('filters.az') },
            { value: 'za', label: t('filters.za') },
          ]}
          value={sortMode}
          onChange={(v) => setParam('sort', v, 'recent')}
        />
      </FilterBar>

      {isEmpty ? (
        <EmptyState onLoadSamples={loadSamples} />
      ) : isFavoritesEmpty ? (
        <div className={css.empty}>
          <div className={css.emptyTitle}>{t('library.noFavoritesTitle')}</div>
          <div className={css.emptyText}>{t('library.noFavoritesText')}</div>
          <button type="button" className={css.button} onClick={() => setView('games')}>
            {t('library.goToGames')}
          </button>
        </div>
      ) : showNoResults ? (
        <div className={css.noResults}>
          <div className={css.noResultsTitle}>{t('library.noResultsTitle')}</div>
          <div className={css.noResultsText}>
            {t('library.noResultsText')} <span className={css.query}>"{qRaw.trim()}"</span>
          </div>
          <button type="button" className={css.button} onClick={clearSearch}>
            {t('library.clearSearch')}
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
              onToggleFavorite={toggleFavorite}
              onSetImageUrl={setGameImageUrl}
              rawgApiKey={settings.rawgApiKey}
              isLaunching={launchingId === g.id}
            />
          ))}
        </div>
      )}
      {launchOverlay && (
        <div className={css.launchOverlay}>
          <div className={css.launchCard}>
            {launchOverlay.phase === 'opening' ? (
              <>
                <div className={css.launchSpinner} />
                <div className={css.launchText}>Ouverture de</div>
                <div className={css.launchTitle}>{launchOverlay.title}</div>
              </>
            ) : (
              <>
                <div className={css.launchCheck}>✓</div>
                <div className={css.launchTitle}>{launchOverlay.title}</div>
                <div className={css.launchText}>lancé</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
