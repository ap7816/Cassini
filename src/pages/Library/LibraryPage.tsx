import { useEffect, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import css from './LibraryPage.module.css';
import { useLibraryGames } from '../../features/library/hooks/useLibraryGames';
import { EmptyState } from '../../features/library/components/EmptyState';
import { GameCard } from '../../features/library/components/GameCard';
import { launchGame } from '../../features/library/services/launchGame';
import type { Game, GamePlatform } from '../../features/types';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { FilterBar, FilterSelect } from '../../components/FilterChips/FilterChips';
import { useToast } from '../../features/toast/ToastContext';
import { tauriInvoke } from '../../services/tauri';
import { formaterTaille } from '../../i18n/formats';

type ViewMode = 'games' | 'favorites';
type PlatformFilter = 'all' | 'Steam' | 'Epic' | 'BattleNet' | 'Riot' | 'Rockstar' | 'Ubisoft' | 'Hytale' | 'HoYoPlay' | 'Other';
type InstalledFilter = 'all' | 'yes' | 'no';
type SortMode = 'recent' | 'az' | 'za';

// Comparateur de titres insensible à la casse et aux accents pour le tri alphabétique
const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

// Convertit une date ISO en timestamp numérique pour le tri par date de jeu récente
function getTimestamp(iso?: string | null): number {
  if (!iso) return -1;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : -1;
}

// Page principale de la bibliothèque avec filtres, tri, onglets et lancement de jeux
export function LibraryPage() {
  const { t, i18n } = useTranslation();
  const { settings } = useAppSettings();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const qRaw = searchParams.get('q') ?? '';
  const q = qRaw.trim().toLowerCase();
  // Différé pour ne pas bloquer la frappe clavier en filtrant à chaque touche
  const deferredQ = useDeferredValue(q);

  const view: ViewMode = searchParams.get('view') === 'favorites' ? 'favorites' : 'games';

  const platformFilter = (searchParams.get('platform') ?? 'all') as PlatformFilter;
  const installedFilter = (searchParams.get('installed') ?? 'all') as InstalledFilter;
  const sortMode = (searchParams.get('sort') ?? 'recent') as SortMode;

  // Met à jour un paramètre d'URL sans créer d'entrée dans l'historique
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
    totalSizeBytes,
    loadSamples,
    removeGame,
    toggleFavorite,
    setGameImageUrl,
    markPlayed,
    scanPcSteam,
    scanPcEpic,
    scanPcBattlenet,
    scanPcRiot,
    scanPcRockstar,
    scanPcUbisoft,
    scanPcHytale,
    scanPcHoYoPlay,
    isScanning,
    scanError,
  } = useLibraryGames();

  const [diskInfo, setDiskInfo] = useState<{ freeBytes: number; totalBytes: number } | null>(null);

  useEffect(() => {
    tauriInvoke<{ freeBytes: number; totalBytes: number }>('get_disk_free_space')
      .then(setDiskInfo)
      .catch(() => {});
  }, []);

  // Lance un rescan simultané sur toutes les plateformes
  async function handleRefresh() {
    await Promise.all([
      scanPcSteam(),
      scanPcEpic(),
      scanPcBattlenet(),
      scanPcRiot(),
      scanPcRockstar(),
      scanPcUbisoft(),
      scanPcHytale(),
      scanPcHoYoPlay(),
    ]);
  }

  // Plateformes réellement présentes dans la bibliothèque, dans l'ordre
  // canonique. Proposer un launcher qu'on n'a pas donne un filtre qui ne
  // renvoie jamais rien — et laisse croire que la détection a échoué.
  const platformOptions = useMemo(() => {
    const presentes = new Set(games.map((g) => g.platform || 'Other'));
    // Intersection des deux types : une plateforme détectable mais absente du
    // filtre — GOG aujourd'hui — ne peut pas être proposée, et le compilateur
    // le rappellera si l'un des deux ensembles évolue sans l'autre.
    const libelles: [Extract<GamePlatform, PlatformFilter>, string][] = [
      ['Steam', 'Steam'],
      ['Epic', 'Epic'],
      ['BattleNet', t('filters.battlenet')],
      ['Riot', 'Riot'],
      ['Rockstar', 'Rockstar'],
      ['Ubisoft', 'Ubisoft Connect'],
      ['Hytale', 'Hytale'],
      ['HoYoPlay', 'HoYoPlay'],
      ['Other', t('filters.other')],
    ];
    return [
      { value: 'all' as PlatformFilter, label: t('filters.all') },
      ...libelles
        .filter(([v]) => presentes.has(v))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [games, t]);

  // Bascule entre l'onglet "Tous les jeux" et "Favoris"
  function setView(next: ViewMode) {
    const p = new URLSearchParams(searchParams);
    if (next === 'favorites') p.set('view', 'favorites');
    else p.delete('view');
    setSearchParams(p, { replace: true });
  }

  // Supprime le paramètre de recherche de l'URL
  function clearSearch() {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  }

  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchOverlay, setLaunchOverlay] = useState<{ title: string; phase: 'opening' | 'launched' } | null>(null);

  // Lance un jeu et affiche un overlay de feedback pendant le démarrage
  async function handlePlay(game: Game) {
    setLaunchingId(game.id);
    setLaunchOverlay({ title: game.title, phase: 'opening' });
    const res = await launchGame(game);
    setLaunchingId(null);
    if (!res.ok) {
      setLaunchOverlay(null);
      toast.error(res.message);
      return;
    }
    markPlayed(game.id);
    setLaunchOverlay({ title: game.title, phase: 'launched' });
    setTimeout(() => setLaunchOverlay(null), 2500);
  }

  // Pré-calcule les champs de tri pour éviter de recalculer à chaque comparaison
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

  // Filtre la liste de base selon l'onglet actif (tous / favoris)
  const baseList = useMemo(() => {
    if (view === 'favorites') return preparedGames.filter((g) => g.favorite);
    return preparedGames;
  }, [preparedGames, view]);

  // Applique la recherche, les filtres de plateforme/installation et le tri
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

  // Texte dynamique du sous-titre selon l'état courant (vide, favoris, recherche, normal)
  const subtitleText = isEmpty
    ? t('library.subtitleEmpty')
    : view === 'favorites'
      ? t('library.subtitleFavorites', { count: favoritesCount, total: games.length })
      : q
        ? t('library.subtitleSearch', { count: filteredGames.length, total: games.length })
        // Deux nombres, donc deux accords : chacun porte son propre pluriel.
        : `${t('library.gameCount', { count: games.length })} • ${t('library.installedCount', { count: installedCount })}`;

  return (
    <div className={css.page}>
      <div className={css.headerRow}>
        <div>
          <h1 className={css.title}>{t('library.title')}</h1>
          <p className={css.subtitle}>{subtitleText}</p>
          {(totalSizeBytes > 0 || diskInfo) && (
            <p className={css.diskLine}>
              {totalSizeBytes > 0 && t('library.diskUsed', { size: formaterTaille(totalSizeBytes, i18n.language) })}
              {totalSizeBytes > 0 && diskInfo && ' · '}
              {diskInfo && t('library.diskFree', { free: formaterTaille(diskInfo.freeBytes, i18n.language) })}
            </p>
          )}
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
          options={platformOptions}
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
              sgdbKeySet={settings.sgdbKeySet}
              isLaunching={launchingId === g.id}
            />
          ))}
        </div>
      )}

      {/* Overlay plein écran affiché pendant le lancement d'un jeu */}
      {launchOverlay && (
        <div className={css.launchOverlay}>
          <div className={css.launchCard}>
            {launchOverlay.phase === 'opening' ? (
              <>
                <div className={css.launchSpinner} />
                <div className={css.launchText}>{t('library.launchOpening')}</div>
                <div className={css.launchTitle}>{launchOverlay.title}</div>
              </>
            ) : (
              <>
                <div className={css.launchCheck}>✓</div>
                <div className={css.launchTitle}>{launchOverlay.title}</div>
                <div className={css.launchText}>{t('library.launchDone')}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
