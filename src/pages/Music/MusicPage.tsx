import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useMusicPlayer, TrackDto } from '../../features/music/MusicContext';
import { FilterBar, FilterSelect } from '../../components/FilterChips/FilterChips';
import css from './MusicPage.module.css';

type SortMode = 'folder' | 'az' | 'za';
type TrackWithIdx = TrackDto & { originalIndex: number };

/* ─── Tree ─────────────────────────────────────────────────── */
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

function countAllTracks(node: FolderNode): number {
  return node.tracks.length + node.children.reduce((s, c) => s + countAllTracks(c), 0);
}

function hasActive(node: FolderNode, idx: number): boolean {
  if (node.tracks.some(t => t.originalIndex === idx)) return true;
  return node.children.some(c => hasActive(c, idx));
}

/* ─── Helpers ──────────────────────────────────────────────── */
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

/* ─── Durations hook ───────────────────────────────────────── */
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
        slice.map(
          t =>
            new Promise<void>(res => {
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
            }),
        ),
      );
      next();
    }
    next();
    return () => { cancelled = true; };
  }, [tracks]);

  return dur;
}

/* ─── Equalizer component ──────────────────────────────────── */
function Equalizer() {
  return (
    <span className={css.equalizer} aria-hidden="true">
      <span className={css.eqBar} style={{ animationDelay: '0ms' }} />
      <span className={css.eqBar} style={{ animationDelay: '180ms' }} />
      <span className={css.eqBar} style={{ animationDelay: '90ms' }} />
    </span>
  );
}

/* ─── Folder node view (recursive) ────────────────────────── */
interface FolderNodeViewProps {
  node: FolderNode;
  depth: number;
  currentIndex: number;
  isPlaying: boolean;
  expandedFolders: Set<string>;
  toggleFolder: (p: string) => void;
  onSelect: (i: number) => void;
  activeRef: React.MutableRefObject<HTMLDivElement | null>;
  durations: Record<string, number>;
  query: string;
}

function FolderNodeView({
  node, depth, currentIndex, isPlaying,
  expandedFolders, toggleFolder, onSelect,
  activeRef, durations, query,
}: FolderNodeViewProps) {
  const isExpanded = !!query || expandedFolders.has(node.fullPath);
  const active = hasActive(node, currentIndex);
  const hue = folderHue(node.name);
  const total = countAllTracks(node);
  const indent = depth * 18;

  return (
    <div className={css.folderGroup}>
      <div
        className={`${css.folderHeader} ${active ? css.folderHeaderActive : ''}`}
        style={{ paddingLeft: 12 + indent }}
        onClick={() => toggleFolder(node.fullPath)}
      >
        <span className={css.folderChevron}>{isExpanded ? '▾' : '▸'}</span>
        <span
          className={css.folderCover}
          style={{
            background: `hsl(${hue}, 42%, 26%)`,
            color: `hsl(${hue}, 75%, 72%)`,
            borderColor: `hsl(${hue}, 45%, 38%)`,
          }}
        >
          {node.name[0]?.toUpperCase() ?? '?'}
        </span>
        <span className={css.folderName}>{node.name}</span>
        <span className={css.folderCount}>{total}</span>
        {active && !isExpanded && (
          <span className={css.folderPlayingDot} title="Piste en cours dans ce dossier">●</span>
        )}
      </div>

      {isExpanded && (
        <div className={css.folderContent} style={{ '--indent': `${indent + 18}px` } as React.CSSProperties}>
          {node.children.map(child => (
            <FolderNodeView
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              currentIndex={currentIndex}
              isPlaying={isPlaying}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              onSelect={onSelect}
              activeRef={activeRef}
              durations={durations}
              query={query}
            />
          ))}
          {node.tracks.map((track, relIdx) => {
            const isActive = track.originalIndex === currentIndex;
            return (
              <div
                key={track.path}
                ref={isActive ? activeRef : undefined}
                className={`${css.trackItem} ${isActive ? css.trackItemActive : ''}`}
                style={{ paddingLeft: `calc(var(--indent) + 20px)` }}
                onClick={() => onSelect(track.originalIndex)}
                title={track.path}
              >
                {isActive && isPlaying
                  ? <Equalizer />
                  : <span className={css.trackIndex}>{relIdx + 1}</span>
                }
                <span className={css.trackTitle}>{track.title}</span>
                {durations[track.path]
                  ? <span className={css.trackDuration}>{fmt(durations[track.path])}</span>
                  : <span className={css.trackDurationPlaceholder} />
                }
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ────────────────────────────────────────────── */
export function MusicPage() {
  const { t } = useTranslation();
  const music = useMusicPlayer();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') ?? '').toLowerCase().trim();
  const sortMode = (searchParams.get('sort') ?? 'folder') as SortMode;
  const durations = useDurations(music.tracks);

  function setSortMode(v: SortMode) {
    const p = new URLSearchParams(searchParams);
    if (v === 'folder') p.delete('sort');
    else p.set('sort', v);
    setSearchParams(p, { replace: true });
  }

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const activeRef = useRef<HTMLDivElement>(null);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Expand all ancestor folders of current track
  useEffect(() => {
    if (music.currentIndex < 0 || music.tracks.length === 0) return;
    const folder = music.tracks[music.currentIndex].folder;
    if (!folder) return;
    const parts = folder.split('/');
    const paths = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    setExpandedFolders(prev => {
      if (paths.every(p => prev.has(p))) return prev;
      return new Set([...prev, ...paths]);
    });
  }, [music.currentIndex, music.tracks]);

  // Scroll to active track after folder expansion
  useEffect(() => {
    if (music.currentIndex < 0) return;
    const t = setTimeout(() => {
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    return () => clearTimeout(t);
  }, [music.currentIndex, expandedFolders]);

  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      localStorage.setItem('music_folder', selected);
      await music.loadFolder(selected);
    }
  }

  // Filter
  let filtered: TrackWithIdx[] = music.tracks.map((t, i) => ({ ...t, originalIndex: i }));
  if (query) {
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.folder.toLowerCase().includes(query),
    );
  }

  const useGroups = sortMode === 'folder';
  const tree = useGroups ? buildTree(filtered) : null;
  const flatSorted = useGroups
    ? []
    : [...filtered].sort((a, b) =>
        sortMode === 'az' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title),
      );

  const folderName = music.folderPath ? music.folderPath.split(/[\\/]/).pop() : null;

  return (
    <div className={css.page}>
      {/* Header */}
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

      {music.tracks.length > 0 && (
        <div className={css.filterRow}>
          <FilterBar>
            {useGroups && (
              <button className={css.collapseBtn} onClick={() => setExpandedFolders(new Set())}>
                {t('filters.collapseAll')}
              </button>
            )}
            <FilterSelect<SortMode>
              label={t('filters.sort')}
              options={[
                { value: 'folder', label: t('filters.byFolder') },
                { value: 'az', label: t('filters.az') },
                { value: 'za', label: t('filters.za') },
              ]}
              value={sortMode}
              onChange={setSortMode}
            />
          </FilterBar>
        </div>
      )}

      <div className={css.trackList}>
        {music.tracks.length === 0 && !music.loading && (
          <div className={css.emptyState}>
            {music.folderPath ? t('music.noAudio') : t('music.chooseFirst')}
          </div>
        )}
        {query && filtered.length === 0 && music.tracks.length > 0 && (
          <div className={css.emptyState}>{t('music.noResults', { query })}</div>
        )}

        {/* Flat A-Z / Z-A */}
        {!useGroups && flatSorted.map(track => {
          const isActive = track.originalIndex === music.currentIndex;
          return (
            <div
              key={track.path}
              ref={isActive ? activeRef : undefined}
              className={`${css.trackItem} ${isActive ? css.trackItemActive : ''}`}
              onClick={() => music.selectTrack(track.originalIndex)}
              title={track.path}
            >
              {isActive && music.isPlaying
                ? <Equalizer />
                : <span className={css.trackIndex}>{track.originalIndex + 1}</span>
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
        })}

        {/* Tree grouped */}
        {useGroups && tree && (
          <>
            {tree.children.map(node => (
              <FolderNodeView
                key={node.fullPath}
                node={node}
                depth={0}
                currentIndex={music.currentIndex}
                isPlaying={music.isPlaying}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onSelect={music.selectTrack}
                activeRef={activeRef}
                durations={durations}
                query={query}
              />
            ))}
            {tree.tracks.map((track, relIdx) => {
              const isActive = track.originalIndex === music.currentIndex;
              return (
                <div
                  key={track.path}
                  ref={isActive ? activeRef : undefined}
                  className={`${css.trackItem} ${isActive ? css.trackItemActive : ''}`}
                  onClick={() => music.selectTrack(track.originalIndex)}
                  title={track.path}
                >
                  {isActive && music.isPlaying
                    ? <Equalizer />
                    : <span className={css.trackIndex}>{relIdx + 1}</span>
                  }
                  <span className={css.trackTitle}>{track.title}</span>
                  {durations[track.path]
                    ? <span className={css.trackDuration}>{fmt(durations[track.path])}</span>
                    : <span className={css.trackDurationPlaceholder} />
                  }
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
