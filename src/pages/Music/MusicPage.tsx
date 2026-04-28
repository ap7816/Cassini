import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useMusicPlayer, TrackDto } from '../../features/music/MusicContext';
import { FilterSelect } from '../../components/FilterChips/FilterChips';
import css from './MusicPage.module.css';

type SortMode = 'az' | 'za';
type TrackWithIdx = TrackDto & { originalIndex: number };

/* ─── Color palette ─────────────────────────────────────────── */
const PALETTE = [
  '#e6a817', // Jaune (défaut)
  '#e07020', // Orange
  '#d63b3b', // Rouge
  '#d63b8c', // Rose
  '#8c3bd6', // Violet
  '#3b7fd6', // Bleu
  '#3bbcd6', // Cyan
  '#3bd67a', // Vert
  '#6b7280', // Gris
];

const COLORS_KEY = 'music_folder_colors';

function loadFolderColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(COLORS_KEY) ?? '{}'); }
  catch { return {}; }
}

function saveFolderColors(c: Record<string, string>) {
  localStorage.setItem(COLORS_KEY, JSON.stringify(c));
}

/* ─── Tree ──────────────────────────────────────────────────── */
interface FolderNode {
  name: string;
  fullPath: string;
  tracks: TrackWithIdx[];
  children: FolderNode[];
}

function buildTree(tracks: TrackWithIdx[], extraDirs: string[] = []): FolderNode {
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

  for (const t of tracks) ensureNode(t.folder).tracks.push(t);
  // Also ensure empty directories appear in the tree
  for (const dir of extraDirs) if (dir) ensureNode(dir);
  return root;
}

function getNodeAtPath(tree: FolderNode, path: string[]): FolderNode {
  let node = tree;
  for (const seg of path) {
    const child = node.children.find(c => c.name === seg);
    if (!child) return node;
    node = child;
  }
  return node;
}

function hasActive(node: FolderNode, idx: number): boolean {
  if (node.tracks.some(t => t.originalIndex === idx)) return true;
  return node.children.some(c => hasActive(c, idx));
}

function countTracks(node: FolderNode): number {
  return node.tracks.length + node.children.reduce((s, c) => s + countTracks(c), 0);
}

/* ─── Helpers ───────────────────────────────────────────────── */
function fmt(sec: number): string {
  if (!isFinite(sec) || isNaN(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function absPath(root: string, rel: string) {
  return rel ? `${root}/${rel}` : root;
}

/* ─── Durations hook ────────────────────────────────────────── */
function useDurations(tracks: TrackDto[]) {
  const [dur, setDur] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!tracks.length) return;
    let cancelled = false;
    const BATCH = 20; let i = 0;
    async function next() {
      if (cancelled || i >= tracks.length) return;
      const slice = tracks.slice(i, i + BATCH); i += BATCH;
      await Promise.all(slice.map(t => new Promise<void>(res => {
        const a = new Audio(); a.preload = 'metadata';
        a.src = convertFileSrc(t.path);
        const done = () => { if (!cancelled && isFinite(a.duration) && a.duration > 0) setDur(p => ({ ...p, [t.path]: a.duration })); res(); };
        a.addEventListener('loadedmetadata', done, { once: true });
        a.addEventListener('error', done, { once: true });
      })));
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
  rootName: string; path: string[]; onNavigate: (idx: number) => void;
}) {
  return (
    <nav className={css.breadcrumb}>
      {[rootName, ...path].map((seg, i, arr) => (
        <span key={i} className={css.breadcrumbItem}>
          {i > 0 && <span className={css.breadcrumbSep}>›</span>}
          <button
            className={`${css.breadcrumbBtn} ${i === arr.length - 1 ? css.breadcrumbCurrent : ''}`}
            onClick={() => onNavigate(i - 1)}
            disabled={i === arr.length - 1}
            title={seg}
          >{seg}</button>
        </span>
      ))}
    </nav>
  );
}

/* ─── Context menu ──────────────────────────────────────────── */
type CtxMenu =
  | { kind: 'folder'; x: number; y: number; node: FolderNode }
  | { kind: 'color'; x: number; y: number; folderPath: string };

function ContextMenu({ menu, onClose, onDelete, onRename, onColorPick }: {
  menu: CtxMenu;
  onClose: () => void;
  onDelete?: (node: FolderNode) => void;
  onRename?: (node: FolderNode) => void;
  onColorPick: (path: string, color: string) => void;
}) {
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener('mousedown', h, true);
    return () => window.removeEventListener('mousedown', h, true);
  }, [onClose]);

  const stopBoth = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };

  if (menu.kind === 'color') {
    return (
      <div className={css.ctxMenu} style={{ left: menu.x, top: menu.y }} onMouseDown={stopBoth} onClick={stopBoth}>
        <div className={css.ctxPalette}>
          {PALETTE.map(c => (
            <button
              key={c}
              className={css.ctxColorSwatch}
              style={{ background: c }}
              onClick={(e) => { e.stopPropagation(); onColorPick(menu.folderPath, c); onClose(); }}
              title={c}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={css.ctxMenu} style={{ left: menu.x, top: menu.y }} onMouseDown={stopBoth} onClick={stopBoth}>
      <button className={css.ctxItem} onClick={(e) => {
        e.stopPropagation();
        onColorPick(menu.node.fullPath, '');
      }}>
        🎨 Changer la couleur
      </button>
      {onRename && (
        <button className={css.ctxItem} onClick={(e) => { e.stopPropagation(); onClose(); onRename(menu.node); }}>
          ✏️ Renommer
        </button>
      )}
      <div className={css.ctxDivider} />
      {onDelete && (
        <button className={`${css.ctxItem} ${css.ctxItemDanger}`} onClick={(e) => { e.stopPropagation(); onClose(); onDelete(menu.node); }}>
          🗑️ Supprimer
        </button>
      )}
    </div>
  );
}

/* ─── Folder card ───────────────────────────────────────────── */
function FolderCard({ folder, color, currentIndex, isPlaying, isDragOver, onClick, onContextMenu, onDragOver, onDragLeave, onDrop }: {
  folder: FolderNode; color: string; currentIndex: number; isPlaying: boolean;
  isDragOver: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragOver: () => void; onDragLeave: () => void; onDrop: () => void;
}) {
  const active = hasActive(folder, currentIndex);
  const total = countTracks(folder);

  return (
    <button
      className={`${css.gridItem} ${active ? css.gridItemFolderActive : ''} ${isDragOver ? css.gridItemDropTarget : ''}`}
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e); }}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      title={folder.name}
    >
      <div className={css.folderShape} style={{ '--fc': color, '--fc-dark': color + 'bb' } as React.CSSProperties}>
        <div className={css.folderShapeTab} />
        <div className={css.folderShapeBody}>
          {isDragOver
            ? <span className={css.dropHint}>+</span>
            : active && isPlaying
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
  track: TrackWithIdx; index: number; isActive: boolean; isPlaying: boolean;
  onSelect: () => void; duration: number | undefined;
  activeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={isActive ? activeRef : undefined}
      className={`${css.gridItem} ${isActive ? css.gridItemTrackActive : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('trackPath', track.path);
        e.dataTransfer.setData('trackIdx', String(track.originalIndex));
      }}
      title={track.title}
    >
      <div className={css.trackShape}>
        {isActive && isPlaying ? <Equalizer /> : <span className={css.trackNum}>{index + 1}</span>}
        {duration != null && <span className={css.trackDurationGrid}>{fmt(duration)}</span>}
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
  const [folderColors, setFolderColors] = useState<Record<string, string>>(loadFolderColors);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [allDirs, setAllDirs] = useState<string[]>([]);

  // Reset path when root folder changes
  useEffect(() => { setCurrentPath([]); }, [music.folderPath]);

  // Load all subdirectory paths (including empty ones)
  useEffect(() => {
    if (!music.folderPath || music.loading) return;
    invoke<string[]>('list_music_dirs', { root: music.folderPath })
      .then(setAllDirs)
      .catch(() => setAllDirs([]));
  }, [music.folderPath, music.loading, music.tracks.length]);

  // Handle ?navTo= from mini-player
  useEffect(() => {
    const navTo = searchParams.get('navTo');
    if (!navTo) return;
    setCurrentPath(navTo.split('/').filter(Boolean));
    const p = new URLSearchParams(searchParams);
    p.delete('navTo'); setSearchParams(p, { replace: true });
  }, [searchParams]);

  // Scroll to active track
  useEffect(() => {
    if (music.currentIndex < 0) return;
    const t = setTimeout(() => activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => clearTimeout(t);
  }, [currentPath, music.currentIndex]);

  function setSortMode(v: SortMode) {
    const p = new URLSearchParams(searchParams);
    if (v === 'az') p.delete('sort'); else p.set('sort', v);
    setSearchParams(p, { replace: true });
  }

  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      localStorage.setItem('music_folder', selected);
      await music.loadFolder(selected);
    }
  }

  // ── Folder color ──────────────────────────────────────────────
  const getFolderColor = useCallback(
    (fullPath: string) => folderColors[fullPath] ?? PALETTE[0],
    [folderColors],
  );

  function applyFolderColor(folderPath: string, color: string) {
    const next = { ...folderColors, [folderPath]: color };
    setFolderColors(next);
    saveFolderColors(next);
    setCtxMenu(null);
  }

  // ── Create folder ─────────────────────────────────────────────
  async function handleCreateFolder() {
    const name = window.prompt('Nom du nouveau dossier :');
    if (!name?.trim()) return;
    const root = music.folderPath;
    if (!root) return;
    const targetAbs = absPath(absPath(root, currentPath.join('/')), name.trim());
    try {
      await invoke('create_music_folder', { path: targetAbs });
      await music.loadFolder(root);
    } catch (e) { window.alert('Erreur : ' + e); }
  }

  // ── Delete folder ─────────────────────────────────────────────
  async function handleDeleteFolder(node: FolderNode) {
    const n = countTracks(node);
    const msg = n > 0
      ? `Supprimer "${node.name}" et ses ${n} musique(s) définitivement ?`
      : `Supprimer le dossier vide "${node.name}" ?`;
    if (!window.confirm(msg)) return;
    const root = music.folderPath;
    if (!root) return;
    try {
      await invoke('delete_music_folder', { path: absPath(root, node.fullPath) });
      await music.loadFolder(root);
    } catch (e) { window.alert('Erreur : ' + e); }
  }

  // ── Drag & drop ───────────────────────────────────────────────
  async function handleDropOnFolder(folder: FolderNode, e: React.DragEvent) {
    e.preventDefault();
    setDragOverPath(null);
    const trackPath = e.dataTransfer.getData('trackPath');
    if (!trackPath || !music.folderPath) return;
    const dstAbs = absPath(music.folderPath, folder.fullPath);
    try {
      await invoke('move_music_file', { src: trackPath, dstFolder: dstAbs });
      await music.loadFolder(music.folderPath);
    } catch (err) { window.alert('Erreur : ' + err); }
  }

  // ── Tree ──────────────────────────────────────────────────────
  const allTracks = useMemo(() => music.tracks.map((t, i) => ({ ...t, originalIndex: i })), [music.tracks]);
  const tree = useMemo(() => buildTree(allTracks, allDirs), [allTracks, allDirs]);
  const currentNode = useMemo(() => getNodeAtPath(tree, currentPath), [tree, currentPath]);

  const sortFn = useCallback(
    (a: string, b: string) => sortMode === 'za' ? b.localeCompare(a) : a.localeCompare(b),
    [sortMode],
  );
  const sortedFolders = useMemo(
    () => [...currentNode.children].sort((a, b) => sortFn(a.name, b.name)),
    [currentNode.children, sortFn],
  );
  const sortedTracks = useMemo(
    () => [...currentNode.tracks].sort((a, b) => sortFn(a.title, b.title)),
    [currentNode.tracks, sortFn],
  );

  const searchResults = useMemo(() => {
    if (!query) return [];
    return allTracks
      .filter(t => t.title.toLowerCase().includes(query) || t.folder.toLowerCase().includes(query))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allTracks, query]);

  const folderName = music.folderPath ? music.folderPath.split(/[\\/]/).pop() : null;
  const isEmpty = !music.loading && music.tracks.length === 0;

  return (
    <div className={css.page} onClick={() => setCtxMenu(null)}>

      {/* ── Header ── */}
      <div className={css.header}>
        <button className={css.chooseBtn} onClick={handleChooseFolder}>{t('music.chooseFolder')}</button>
        {folderName && <span className={css.selectedFolderName} title={music.folderPath}>{folderName}</span>}
        {music.loading && <span className={css.loadingText}>{t('music.scanning')}</span>}
        {!music.loading && music.tracks.length > 0 && (
          <span className={css.trackCount}>{t('music.trackCount', { count: music.tracks.length })}</span>
        )}
      </div>

      {music.error && <div className={css.errorMsg}>{music.error}</div>}

      {/* ── Nav bar ── */}
      {music.tracks.length > 0 && folderName && (
        <div className={css.navBar}>
          <button className={css.backBtn} onClick={() => setCurrentPath(p => p.slice(0, -1))} disabled={currentPath.length === 0}>←</button>
          <Breadcrumb
            rootName={folderName}
            path={currentPath}
            onNavigate={idx => idx < 0 ? setCurrentPath([]) : setCurrentPath(currentPath.slice(0, idx + 1))}
          />
          <button className={css.newFolderBtn} onClick={handleCreateFolder} title="Nouveau dossier">+ Dossier</button>
          <FilterSelect<SortMode>
            label={t('filters.sort')}
            options={[{ value: 'az', label: t('filters.az') }, { value: 'za', label: t('filters.za') }]}
            value={sortMode}
            onChange={setSortMode}
          />
        </div>
      )}

      {isEmpty && <div className={css.emptyState}>{music.folderPath ? t('music.noAudio') : t('music.chooseFirst')}</div>}

      {/* ── Search results ── */}
      {!isEmpty && query && (
        <div className={css.trackList}>
          {searchResults.length === 0
            ? <div className={css.emptyState}>{t('music.noResults', { query })}</div>
            : searchResults.map((track, idx) => {
              const isActive = track.originalIndex === music.currentIndex;
              return (
                <div key={track.path} className={`${css.trackItem} ${isActive ? css.trackItemActive : ''}`} onClick={() => music.selectTrack(track.originalIndex)}>
                  {isActive && music.isPlaying ? <Equalizer /> : <span className={css.trackIndex}>{idx + 1}</span>}
                  <span className={css.trackTitle}>{track.title}</span>
                  {track.folder && <span className={css.trackFolderTag}>{track.folder.split('/').pop()}</span>}
                  {durations[track.path] ? <span className={css.trackDuration}>{fmt(durations[track.path])}</span> : <span className={css.trackDurationPlaceholder} />}
                </div>
              );
            })
          }
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
                color={getFolderColor(folder.fullPath)}
                currentIndex={music.currentIndex}
                isPlaying={music.isPlaying}
                isDragOver={dragOverPath === folder.fullPath}
                onClick={() => setCurrentPath([...currentPath, folder.name])}
                onContextMenu={e => setCtxMenu({ kind: 'folder', x: e.clientX, y: e.clientY, node: folder })}
                onDragOver={() => setDragOverPath(folder.fullPath)}
                onDragLeave={() => setDragOverPath(null)}
                onDrop={e => handleDropOnFolder(folder, e)}
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

      {/* ── Context menu ── */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onDelete={ctxMenu.kind === 'folder' ? handleDeleteFolder : undefined}
          onColorPick={
            ctxMenu.kind === 'color'
              ? applyFolderColor
              : (path) => setCtxMenu(prev => prev ? { kind: 'color', x: prev.x, y: prev.y, folderPath: path } : null)
          }
        />
      )}
    </div>
  );
}
