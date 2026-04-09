import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { useMusicPlayer } from '../../features/music/MusicContext';
import css from './MusicPage.module.css';

export function MusicPage() {
  const music = useMusicPlayer();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') ?? '').toLowerCase().trim();

  // Folders collapsed by default; Set contains the *expanded* ones
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  function toggleFolder(folder: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      localStorage.setItem('music_folder', selected);
      await music.loadFolder(selected);
    }
  }

  // Filter tracks by search query, keep original index
  const filtered = music.tracks
    .map((t, i) => ({ ...t, originalIndex: i }))
    .filter((t) =>
      !query ||
      t.title.toLowerCase().includes(query) ||
      t.folder.toLowerCase().includes(query)
    );

  // Group by folder
  const groups: { folder: string; tracks: typeof filtered }[] = [];
  for (const track of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.folder === track.folder) {
      last.tracks.push(track);
    } else {
      groups.push({ folder: track.folder, tracks: [track] });
    }
  }

  const folderName = music.folderPath
    ? music.folderPath.split(/[\\/]/).pop()
    : null;

  return (
    <div className={css.page}>
      {/* Header */}
      <div className={css.header}>
        <button className={css.chooseBtn} onClick={handleChooseFolder}>
          Choisir un dossier
        </button>
        {folderName && (
          <span className={css.selectedFolderName} title={music.folderPath}>
            {folderName}
          </span>
        )}
        {music.loading && <span className={css.loadingText}>Scan en cours…</span>}
        {!music.loading && music.tracks.length > 0 && (
          <span className={css.trackCount}>{music.tracks.length} piste{music.tracks.length > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Error */}
      {music.error && <div className={css.errorMsg}>{music.error}</div>}

      {/* Track list */}
      <div className={css.trackList}>
        {music.tracks.length === 0 && !music.loading && (
          <div className={css.emptyState}>
            {music.folderPath
              ? 'Aucun fichier audio trouvé.'
              : 'Choisissez un dossier pour commencer.'}
          </div>
        )}

        {query && filtered.length === 0 && music.tracks.length > 0 && (
          <div className={css.emptyState}>Aucun résultat pour « {query} »</div>
        )}

        {groups.map((group) => {
          // Root-level tracks (no folder) are always visible
          // Named folders: collapsed by default unless search is active or manually expanded
          const isRoot = group.folder === '';
          const isExpanded = isRoot || !!query || expandedFolders.has(group.folder);
          const hasActive = group.tracks.some((t) => t.originalIndex === music.currentIndex);

          return (
            <div key={group.folder || '__root__'} className={css.folderGroup}>
              {!isRoot && (
                <div
                  className={`${css.folderHeader} ${hasActive ? css.folderHeaderActive : ''}`}
                  onClick={() => toggleFolder(group.folder)}
                >
                  <span className={css.folderChevron}>{isExpanded ? '▾' : '▸'}</span>
                  <span className={css.folderIcon}>📁</span>
                  <span className={css.folderName}>{group.folder}</span>
                  <span className={css.folderCount}>{group.tracks.length}</span>
                  {hasActive && !isExpanded && (
                    <span className={css.folderPlayingDot} title="Piste en cours dans ce dossier">●</span>
                  )}
                </div>
              )}
              {isExpanded && group.tracks.map((track) => (
                <div
                  key={track.path}
                  className={`${css.trackItem} ${track.originalIndex === music.currentIndex ? css.trackItemActive : ''}`}
                  onClick={() => music.selectTrack(track.originalIndex)}
                  title={track.path}
                >
                  <span className={css.trackIndex}>{track.originalIndex + 1}</span>
                  <span className={css.trackTitle}>{track.title}</span>
                  {track.originalIndex === music.currentIndex && music.isPlaying && (
                    <span className={css.playingIndicator}>▶</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
