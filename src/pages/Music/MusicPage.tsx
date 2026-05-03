import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useMusicPlayer, TrackDto } from '../../features/music/MusicContext';
import { useBasicBatch, useLazyCoverArt, type TrackMeta } from '../../features/music/useTrackMeta';
import css from './MusicPage.module.css';

type SortBy  = 'name' | 'dur' | 'ext';
type SortDir = 'asc'  | 'desc';
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

import { readMusicFolderColors, writeMusicFolderColors, writeMusicFolder as storageWriteMusicFolder } from '../../services/storage';
import { useDialog } from '../../hooks/useDialog';
import { AppDialog } from '../../components/AppDialog/AppDialog';
import { useToast } from '../../features/toast/ToastContext';

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
type CtxMenu = { x: number; y: number; node: FolderNode };

function ContextMenu({ menu, currentColor, onClose, onRename, onDelete, onColorPreview, onColorSave }: {
  menu: CtxMenu;
  currentColor: string;
  onClose: () => void;
  onRename?: (node: FolderNode) => void;
  onDelete?: (node: FolderNode) => void;
  onColorPreview: (path: string, color: string) => void; // live, no localStorage
  onColorSave: (path: string, color: string) => void;    // on picker close, writes localStorage
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [onClose]);

  // Native 'change' fires only when the picker is dismissed → save then
  useEffect(() => {
    const input = colorRef.current;
    if (!input) return;
    const h = () => onColorSave(menu.node.fullPath, input.value);
    input.addEventListener('change', h);
    return () => input.removeEventListener('change', h);
  }, [menu.node.fullPath, onColorSave]);

  return (
    <div ref={menuRef} className={css.ctxMenu} style={{ left: menu.x, top: menu.y }}
      onClick={e => e.stopPropagation()}>

      <label className={css.ctxColorRow}>
        <span className={css.ctxColorLabel}>{t('music.ctxColor')}</span>
        <input
          ref={colorRef}
          type="color"
          className={css.ctxColorInput}
          value={currentColor}
          onChange={e => onColorPreview(menu.node.fullPath, e.target.value)}
        />
      </label>

      <div className={css.ctxDivider} />

      {onRename && (
        <button className={css.ctxItem}
          onClick={() => { onClose(); onRename(menu.node); }}>
          {t('music.ctxRename')}
        </button>
      )}

      {onDelete && (
        <button className={`${css.ctxItem} ${css.ctxItemDanger}`}
          onClick={() => { onClose(); onDelete(menu.node); }}>
          {t('music.ctxDelete')}
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
  onDragOver: () => void; onDragLeave: () => void; onDrop: (e: React.DragEvent<HTMLButtonElement>) => void;
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
      onDrop={e => { e.preventDefault(); onDrop(e); }}
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
function TrackCard({ track, index, isActive, isPlaying, onSelect, meta }: {
  track: TrackWithIdx; index: number; isActive: boolean; isPlaying: boolean;
  onSelect: () => void;
  meta: TrackMeta | null;
}) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const coverArt = useLazyCoverArt(track.path, cardRef);
  const duration = meta?.durationSecs ?? undefined;

  // Scroll active track into view
  useEffect(() => {
    if (!isActive) return;
    const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => clearTimeout(t);
  }, [isActive]);

  return (
    <button
      ref={cardRef}
      className={`${css.gridItem} ${isActive ? css.gridItemTrackActive : ''} ${coverArt ? css.gridItemWithArt : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('trackPath', track.path);
        e.dataTransfer.setData('trackIdx', String(track.originalIndex));
      }}
      title={track.title}
    >
      <div className={`${css.trackShape}${coverArt ? ` ${css.trackShapeWithArt}` : ''}`}>
        {coverArt && (
          <img src={coverArt} className={css.trackArt} alt="" aria-hidden="true" />
        )}
        {/* Overlay: active state or no-art fallback */}
        <div className={`${css.trackShapeContent}${coverArt && isActive ? ` ${css.trackShapeActiveArtOverlay}` : ''}`}>
          {isActive && isPlaying
            ? <Equalizer />
            : !coverArt
              ? <span className={css.trackNum}>{index + 1}</span>
              : null
          }
          {!coverArt && duration != null && (
            <span className={css.trackDurationGrid}>{fmt(duration)}</span>
          )}
        </div>
        {/* Duration badge in corner (only when art is present) */}
        {coverArt && duration != null && (
          <span className={css.trackDurationBadge}>{fmt(duration)}</span>
        )}
      </div>
      <span className={css.gridLabel}>{track.title}</span>
      {meta?.artist && <span className={css.trackArtist}>{meta.artist}</span>}
    </button>
  );
}

/* ─── Sort dropdown (style Explorateur Windows) ─────────────── */
function SortDropdown({ sortBy, sortDir, onChange }: {
  sortBy: SortBy; sortDir: SortDir;
  onChange: (by: SortBy, dir: SortDir) => void;
}) {
  const { t } = useTranslation();
  const SORT_BY_LABELS: Record<SortBy, string>  = { name: t('music.sortByName'), dur: t('music.sortByDuration'), ext: t('music.sortByType') };
  const SORT_DIR_LABELS: Record<SortDir, string> = { asc: t('music.sortAsc'), desc: t('music.sortDesc') };

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={rootRef} className={css.sortRoot}>
      <button
        className={`${css.sortBtn} ${open ? css.sortBtnOpen : ''}`}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        {t('music.sortBtn')} <span className={css.sortArrow}>↕</span>
      </button>

      {open && (
        <div className={css.sortPanel} onClick={e => e.stopPropagation()}>
          {/* Critère */}
          {(['name', 'dur', 'ext'] as SortBy[]).map(v => (
            <button key={v} className={css.sortOption} onClick={() => onChange(v, sortDir)}>
              <span className={css.sortCheck}>{sortBy === v ? '●' : ''}</span>
              {SORT_BY_LABELS[v]}
            </button>
          ))}
          <div className={css.sortPanelDivider} />
          {/* Direction */}
          {(['asc', 'desc'] as SortDir[]).map(v => (
            <button key={v} className={css.sortOption} onClick={() => onChange(sortBy, v)}>
              <span className={css.sortCheck}>{sortDir === v ? '●' : ''}</span>
              {SORT_DIR_LABELS[v]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export function MusicPage() {
  const { t } = useTranslation();
  const music = useMusicPlayer();
  const [searchParams, setSearchParams] = useSearchParams();
  const query   = (searchParams.get('q') ?? '').toLowerCase().trim();
  const sortBy  = (searchParams.get('sb')  ?? 'name') as SortBy;
  const sortDir = (searchParams.get('sd')  ?? 'asc')  as SortDir;
  const { getMeta, loading: metaLoading } = useBasicBatch(music.tracks.map(t => t.path));

  const { dlgState, closeDialog, prompt, confirm } = useDialog();
  const toast = useToast();

  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [folderColors, setFolderColors] = useState<Record<string, string>>(readMusicFolderColors);
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

  function setSort(by: SortBy, dir: SortDir) {
    const p = new URLSearchParams(searchParams);
    if (by  === 'name') p.delete('sb'); else p.set('sb', by);
    if (dir === 'asc')  p.delete('sd'); else p.set('sd', dir);
    setSearchParams(p, { replace: true });
  }

  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      storageWriteMusicFolder(selected);
      await music.loadFolder(selected);
    }
  }

  // ── Folder color ──────────────────────────────────────────────
  const getFolderColor = useCallback(
    (fullPath: string) => folderColors[fullPath] ?? PALETTE[0],
    [folderColors],
  );

  // Live preview while dragging: update React state only (no localStorage write)
  function previewFolderColor(folderPath: string, color: string) {
    setFolderColors(prev => ({ ...prev, [folderPath]: color }));
  }

  // Called when the native picker is dismissed: persist to storage
  function saveFolderColor(folderPath: string, color: string) {
    setFolderColors(prev => {
      const next = { ...prev, [folderPath]: color };
      writeMusicFolderColors(next);
      return next;
    });
  }

  // ── Create folder ─────────────────────────────────────────────
  async function handleCreateFolder() {
    const name = await prompt(t('music.newFolderPrompt'));
    if (!name) return;
    const root = music.folderPath;
    if (!root) return;
    const targetAbs = absPath(absPath(root, currentPath.join('/')), name);
    try {
      await invoke('create_music_folder', { path: targetAbs });
      await music.loadFolder(root);
    } catch (e) { toast.error(t('music.errorGeneric', { error: String(e) })); }
  }

  // ── Rename folder ─────────────────────────────────────────────
  async function handleRenameFolder(node: FolderNode) {
    const newName = await prompt(t('music.renameFolderPrompt'), node.name);
    if (!newName || newName === node.name) return;
    const root = music.folderPath;
    if (!root) return;
    try {
      await invoke('rename_music_folder', { path: absPath(root, node.fullPath), newName });

      // Update navigation path if the renamed folder is an ancestor of currentPath
      const nodeSegs = node.fullPath ? node.fullPath.split('/') : [];
      const matchesPrefix = nodeSegs.length > 0 && nodeSegs.every((seg, i) => currentPath[i] === seg);
      if (matchesPrefix) {
        const updated = [...currentPath];
        updated[nodeSegs.length - 1] = newName;
        setCurrentPath(updated);
      }

      await music.loadFolder(root);
    } catch (e) { toast.error(t('music.errorGeneric', { error: String(e) })); }
  }

  // ── Delete folder ─────────────────────────────────────────────
  async function handleDeleteFolder(node: FolderNode) {
    const n = countTracks(node);
    const msg = n > 0
      ? t('music.deleteFolderWithTracks', { name: node.name, count: n })
      : t('music.deleteFolderEmpty', { name: node.name });
    const ok = await confirm(msg, { danger: true });
    if (!ok) return;
    const root = music.folderPath;
    if (!root) return;
    try {
      await invoke('delete_music_folder', { path: absPath(root, node.fullPath) });
      await music.loadFolder(root);
    } catch (e) { toast.error(t('music.errorGeneric', { error: String(e) })); }
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
    } catch (err) { toast.error(t('music.errorGeneric', { error: String(err) })); }
  }

  // ── Tree ──────────────────────────────────────────────────────
  const allTracks = useMemo(() => music.tracks.map((t, i) => ({ ...t, originalIndex: i })), [music.tracks]);
  const tree = useMemo(() => buildTree(allTracks, allDirs), [allTracks, allDirs]);
  const currentNode = useMemo(() => getNodeAtPath(tree, currentPath), [tree, currentPath]);

  // Helpers d'extraction
  const trackExt = (path: string) => path.split('.').pop()?.toLowerCase() ?? '';

  const sortedFolders = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...currentNode.children].sort((a, b) =>
      dir * a.name.localeCompare(b.name)  // dossiers toujours par nom
    );
  }, [currentNode.children, sortDir]);

  const sortedTracks = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...currentNode.tracks].sort((a, b) => {
      if (sortBy === 'dur') {
        const da = getMeta(a.path)?.durationSecs ?? 0;
        const db = getMeta(b.path)?.durationSecs ?? 0;
        return dir * (da - db);
      }
      if (sortBy === 'ext') {
        const ea = trackExt(a.path), eb = trackExt(b.path);
        return dir * (ea.localeCompare(eb) || a.title.localeCompare(b.title));
      }
      return dir * a.title.localeCompare(b.title); // 'name' (défaut)
    });
    // getMeta reads from module-level cache; metaLoading triggers re-sort when batch completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode.tracks, sortBy, sortDir, metaLoading]);

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
          <button className={css.newFolderBtn} onClick={handleCreateFolder} title={t('music.newFolderPrompt')}>{t('music.newFolderBtn')}</button>
          <SortDropdown sortBy={sortBy} sortDir={sortDir} onChange={setSort} />
        </div>
      )}

      {/* ── Metadata loading bar ── */}
      {metaLoading && (
        <div className={css.metaLoadingBar}>
          <div className={css.metaLoadingProgress} />
        </div>
      )}

      {isEmpty && <div className={css.emptyState}>{music.folderPath ? t('music.noAudio') : t('music.chooseFirst')}</div>}

      {/* ── Search results ── */}
      {!isEmpty && query && (
        searchResults.length === 0
          ? <div className={css.emptyState}>{t('music.noResults', { query })}</div>
          : <div className={css.gridScroll}>
              <div className={css.fileGrid}>
                {searchResults.map((track, idx) => (
                  <TrackCard
                    key={track.path}
                    track={track}
                    index={idx}
                    isActive={track.originalIndex === music.currentIndex}
                    isPlaying={music.isPlaying}
                    onSelect={() => music.selectTrack(track.originalIndex)}
                    meta={getMeta(track.path)}
                  />
                ))}
              </div>
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
                onContextMenu={e => setCtxMenu({ x: e.clientX, y: e.clientY, node: folder })}
                onDragOver={() => setDragOverPath(folder.fullPath)}
                onDragLeave={() => setDragOverPath(null)}
                onDrop={e => { void handleDropOnFolder(folder, e); }}
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
                  meta={getMeta(track.path)}
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
          currentColor={getFolderColor(ctxMenu.node.fullPath)}
          onClose={() => setCtxMenu(null)}
          onRename={handleRenameFolder}
          onDelete={handleDeleteFolder}
          onColorPreview={previewFolderColor}
          onColorSave={saveFolderColor}
        />
      )}

      {/* ── In-app dialog (prompt / confirm) ── */}
      {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
    </div>
  );
}
