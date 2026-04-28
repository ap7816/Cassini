import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useMusicPlayer, TrackDto } from '../../features/music/MusicContext';
import { FilterSelect } from '../../components/FilterChips/FilterChips';
import css from './MusicPage.module.css';

type SortMode = 'az' | 'za';
type TrackWithIdx = TrackDto & { originalIndex: number };

/* ─── Tree ──────────────────────────────────────────────────── */
interface FolderNode {
  name: string;
  fullPath: string;
  tracks: TrackWithIdx[];
  children: FolderNode[];
}

function buildTree(tracks: TrackWithIdx[]): FolderNode {
  const root: FolderNode = { name: '', fullPath: '', tracks: [], children: [] };
  const map = new Map<string, FolderNode>();
  map.set('', root);

  function ensureNode(path: string): FolderNode {
    if (map.has(path)) return map.get(path)!;
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const parent = ensureNode(parentPath);
    const node: FolderNode = { name, fullPath: path, tracks: [], children: [] };
    map.set(path, node);
    parent.children.push(node);
    return node;
  }

  for (const track of tracks) {
    ensureNode(track.folder).tracks.push(track);
  }
  return root;
}

function getNodeAtPath(tree: FolderNode, path: string[]): FolderNode {
  let node = tree;
  for (const segment of path) {
    const child = node.children.find(c => c.name === segment);
    if (!child) return node;
    node = child;
  }
  return node;
}

function hasActive(node: FolderNode, idx: number): boolean {
  if (node.tracks.some(t => t.originalIndex === idx)) return true;
  return node.children.some(c => hasActive(c, idx));
}

/* ─── Helpers ───────────────────────────────────────────────── */
function folderHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

function fmt(sec: number): string {
  if (!isFinite(sec) || isNaN(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ─── Durations hook ────────────────────────────────────────── */
function useDurations(tracks: TrackDto[]) {
  const [dur, setDur] = useState<Record<string, number>>({});

  useEffect(() => {
    if (tracks.length === 0) return;
    let cancelled = false;
    const BATCH = 20;
    let i = 0;

    async function next() {
      if (cancelled || i >= tracks.length) return;
      const slice = tracks.slice(i, i + BATCH);
      i += BATCH;
      await Promise.all(
        slice.map(t => new Promise<void>(res => {
          const a = new Audio();
          a.preload = 'metadata';
          a.src = convertFileSrc(t.path);
          const done = () => {
            if (!cancelled && isFinite(a.duration) && a.duration > 0)
              setDur(prev => ({ ...prev, [t.path]: a.duration }));
            res();
          };
          a.addEventListener('loadedmetadata', done, { once: true });
          a.addEventListener('error', done, { once: true });
        }))
      );
      next();
    }
    next();
    return () => { cancelled = true; };
  }, [tracks]);

  return dur;
}

/* ─── Equalizer ─────────────────────────────────────────────── */
function Equalizer() {
  return (
    <span className={css.equalizer} aria-hidden="true">
      <span className={css.eqBar} style={{ animationDelay: '0ms' }} />
      <span className={css.eqBar} style={{ animationDelay: '180ms' }} />
      <span className={css.eqBar} style={{ animationDelay: '90ms' }} />
    </span>
  );
}

/* ─── Breadcrumb ────────────────────────────────────────────── */
function Breadcrumb({ rootName, path, onNavigate }: {
  rootName: string;
  path: string[];
  onNavigate: (idx: number) => void;
}) {
  const segments = [rootName, ...path];
  return (
    <nav className={css.breadcrumb}>
      {segments.map((seg, i) => (
        <span key={i} className={css.breadcrumbItem}>
          {i > 0 && <span className={css.breadcrumbSep} aria-hidden="true">›</span>}
          <button
            className={`${css.breadcrumbBtn} ${i === segments.length - 1 ? css.breadcrumbCurrent : ''}`}
            onClick={() => onNavigate(i - 1)}
            disabled={i === segments.length - 1}
            title={seg}
          >
            {seg}
          </button>
        </span>
      ))}
    </nav>
  );
}

/* ─── Folder card ───────────────────────────────────────────── */
function FolderCard({ folder, currentIndex, isPlaying, onClick }: {
  folder: FolderNode;
  currentIndex: number;
  isPlaying: boolean;
  onClick: () => void;
}) {
  const hue = folderHue(folder.name);
  const active = hasActive(folder, currentIndex);
  const total = folder.tracks.length + folder.children.reduce((s, c) => s + c.tracks.length, 0);

  return (
    <button
      className={`${css.gridItem} ${active ? css.gridItemFolderActive : ''}`}
      onClick={onClick}
      title={folder.name}
    >
      <div
        className={css.folderShape}
        style={{ '--fhue': hue } as React.CSSProperties}
      >
        <div className={css.folderShapeTab} />
        <div className={css.folderShapeBody}>
          {active && isPlaying
            ? <Equalizer />
            : active
              ? <span className={css.folderActiveDot} />
              : <span className={css.folderCount}>{total}</span>
          }
        </div>
      </div>
      <span className={css.gridLabel}>{folder.name}</span>
    </button>
  );
}

/* ─── Track card ────────────────────────────────────────────── */
function TrackCard({ track, index, isActive, isPlaying, onSelect, duration, activeRef }: {
  track: TrackWithIdx;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  duration: number | undefined;
  activeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={isActive ? activeRef : undefined}
      className={`${css.gridItem} ${isActive ? css.gridItemTrackActive : ''}`}
      onClick={onSelect}
      title={track.title}
    >
      <div className={css.trackShape}>
        {isActive && isPlaying
          ? <Equalizer />
          : <span className={css.trackNum}>{index + 1}</span>
        }
        {duration != null && (
          <span className={css.trackDurationGrid}>{fmt(duration)}</span>
        )}
      </div>
      <span className={css.gridLabel}>{track.title}</span>
    </button>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export function MusicPage() {
  const { t } = useTranslation();
  const music = useMusicPlayer();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') ?? '').toLowerCase().trim();
  const sortMode = (searchParams.get('sort') ?? 'az') as SortMode;
  const durations = useDurations(music.tracks);
  const activeRef = useRef<HTMLButtonElement>(null);

  const [currentPath, setCurrentPath] = useState<string[]>([]);

  // Reset path when folder root changes
  useEffect(() => {
    setCurrentPath([]);
  }, [music.folderPath]);

  // Handle ?navTo=folder/path from mini-player click
  useEffect(() => {
    const navTo = searchParams.get('navTo');
    if (!navTo) return;
    setCurrentPath(navTo.split('/').filter(Boolean));
    const p = new URLSearchParams(searchParams);
    p.delete('navTo');
    setSearchParams(p, { replace: true });
  }, [searchParams]);

  // Scroll to active track card after navigation
  useEffect(() => {
    if (music.currentIndex < 0) return;
    const t = setTimeout(() => {
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => clearTimeout(t);
  }, [currentPath, music.currentIndex]);

  function setSortMode(v: SortMode) {
    const p = new URLSearchParams(searchParams);
    if (v === 'az') p.delete('sort');
    else p.set('sort', v);
    setSearchParams(p, { replace: true });
  }

  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      localStorage.setItem('music_folder', selected);
      await music.loadFolder(selected);
    }
  }

  // Build tree
  const allTracks = useMemo(
    () => music.tracks.map((t, i) => ({ ...t, originalIndex: i })),
    [music.tracks],
  );
  const tree = useMemo(() => buildTree(allTracks), [allTracks]);
  const currentNode = useMemo(() => getNodeAtPath(tree, currentPath), [tree, currentPath]);

  // Sort contents
  const sortFn = (a: string, b: string) =>
    sortMode === 'za' ? b.localeCompare(a) : a.localeCompare(b);

  const sortedFolders = useMemo(
    () => [...currentNode.children].sort((a, b) => sortFn(a.name, b.name)),
    [currentNode.children, sortMode],
  );
  const sortedTracks = useMemo(
    () => [...currentNode.tracks].sort((a, b) => sortFn(a.title, b.title)),
    [currentNode.tracks, sortMode],
  );

  // Flat search results
  const searchResults = useMemo(() => {
    if (!query) return [];
    return allTracks
      .filter(t =>
        t.title.toLowerCase().includes(query) ||
        t.folder.toLowerCase().includes(query),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allTracks, query]);

  const folderName = music.folderPath ? music.folderPath.split(/[\\/]/).pop() : null;
  const isEmpty = !music.loading && music.tracks.length === 0;

  return (
    <div className={css.page}>

      {/* ── Header ── */}
      <div className={css.header}>
        <button className={css.chooseBtn} onClick={handleChooseFolder}>
          {t('music.chooseFolder')}
        </button>
        {folderName && (
          <span className={css.selectedFolderName} title={music.folderPath}>
            {folderName}
          </span>
        )}
        {music.loading && <span className={css.loadingText}>{t('music.scanning')}</span>}
        {!music.loading && music.tracks.length > 0 && (
          <span className={css.trackCount}>
            {t('music.trackCount', { count: music.tracks.length })}
          </span>
        )}
      </div>

      {music.error && <div className={css.errorMsg}>{music.error}</div>}

      {/* ── Nav bar (breadcrumb + back + sort) ── */}
      {music.tracks.length > 0 && folderName && (
        <div className={css.navBar}>
          <button
            className={css.backBtn}
            onClick={() => setCurrentPath(p => p.slice(0, -1))}
            disabled={currentPath.length === 0}
            aria-label="Retour"
          >
            ←
          </button>
          <Breadcrumb
            rootName={folderName}
            path={currentPath}
            onNavigate={(idx) => {
              if (idx < 0) setCurrentPath([]);
              else setCurrentPath(currentPath.slice(0, idx + 1));
            }}
          />
          <FilterSelect<SortMode>
            label={t('filters.sort')}
            options={[
              { value: 'az', label: t('filters.az') },
              { value: 'za', label: t('filters.za') },
            ]}
            value={sortMode}
            onChange={setSortMode}
          />
        </div>
      )}

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className={css.emptyState}>
          {music.folderPath ? t('music.noAudio') : t('music.chooseFirst')}
        </div>
      )}

      {/* ── Search results (flat list) ── */}
      {!isEmpty && query && (
        <div className={css.trackList}>
          {searchResults.length === 0 ? (
            <div className={css.emptyState}>{t('music.noResults', { query })}</div>
          ) : (
            searchResults.map((track, idx) => {
              const isActive = track.originalIndex === music.currentIndex;
              return (
                <div
                  key={track.path}
                  className={`${css.trackItem} ${isActive ? css.trackItemActive : ''}`}
                  onClick={() => music.selectTrack(track.originalIndex)}
                  title={track.path}
                >
                  {isActive && music.isPlaying
                    ? <Equalizer />
                    : <span className={css.trackIndex}>{idx + 1}</span>
                  }
                  <span className={css.trackTitle}>{track.title}</span>
                  {track.folder && (
                    <span className={css.trackFolderTag}>{track.folder.split('/').pop()}</span>
                  )}
                  {durations[track.path]
                    ? <span className={css.trackDuration}>{fmt(durations[track.path])}</span>
                    : <span className={css.trackDurationPlaceholder} />
                  }
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Grid browser ── */}
      {!isEmpty && !query && (
        <div className={css.gridScroll}>
          <div className={css.fileGrid}>
            {sortedFolders.map(folder => (
              <FolderCard
                key={folder.fullPath}
                folder={folder}
                currentIndex={music.currentIndex}
                isPlaying={music.isPlaying}
                onClick={() => setCurrentPath([...currentPath, folder.name])}
              />
            ))}
            {sortedTracks.map((track, idx) => {
              const isActive = track.originalIndex === music.currentIndex;
              return (
                <TrackCard
                  key={track.path}
                  track={track}
                  index={idx}
                  isActive={isActive}
                  isPlaying={music.isPlaying}
                  onSelect={() => music.selectTrack(track.originalIndex)}
                  duration={durations[track.path]}
                  activeRef={activeRef}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
