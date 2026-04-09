import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import css from './MusicPage.module.css';

interface TrackDto {
  path: string;
  title: string;
}

const LS_KEY = 'music_folder';

export function MusicPage() {
  const [folderPath, setFolderPath] = useState<string>(() => localStorage.getItem(LS_KEY) ?? '');
  const [tracks, setTracks] = useState<TrackDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Load last folder on mount
  useEffect(() => {
    if (folderPath) {
      loadFolder(folderPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFolder(path: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<TrackDto[]>('scan_music_folder', { path });
      setTracks(result);
      setCurrentIndex(-1);
      setIsPlaying(false);
    } catch (e) {
      setError(String(e));
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setFolderPath(selected);
      localStorage.setItem(LS_KEY, selected);
      await loadFolder(selected);
    }
  }

  function selectTrack(index: number) {
    setCurrentIndex(index);
    setIsPlaying(true);
  }

  // When current track changes, load and play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentIndex < 0 || currentIndex >= tracks.length) return;

    const track = tracks[currentIndex];
    audio.src = convertFileSrc(track.path);
    audio.load();
    if (isPlaying) {
      audio.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Sync play/pause with isPlaying state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentIndex < 0) return;
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, currentIndex]);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(audio.currentTime);
    setDuration(audio.duration || 0);
  }

  function handleEnded() {
    if (currentIndex < tracks.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
    setProgress(audio.currentTime);
  }

  function togglePlayPause() {
    if (currentIndex < 0 && tracks.length > 0) {
      selectTrack(0);
    } else {
      setIsPlaying((p) => !p);
    }
  }

  function prevTrack() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsPlaying(true);
    }
  }

  function nextTrack() {
    if (currentIndex < tracks.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsPlaying(true);
    }
  }

  function formatTime(sec: number) {
    if (!isFinite(sec) || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const folderName = folderPath ? folderPath.split(/[\\/]/).pop() : null;

  return (
    <div className={css.page}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={handleTimeUpdate}
      />

      {/* Header */}
      <div className={css.header}>
        <button className={css.chooseBtn} onClick={handleChooseFolder}>
          Choisir un dossier
        </button>
        {folderName && (
          <span className={css.folderName} title={folderPath}>
            {folderName}
          </span>
        )}
        {loading && <span className={css.loadingText}>Scan en cours…</span>}
      </div>

      {/* Error */}
      {error && <div className={css.errorMsg}>{error}</div>}

      {/* Track list */}
      <div className={css.trackList}>
        {tracks.length === 0 && !loading && (
          <div className={css.emptyState}>
            {folderPath ? 'Aucun fichier audio trouvé.' : 'Choisissez un dossier pour commencer.'}
          </div>
        )}
        {tracks.map((track, i) => (
          <div
            key={track.path}
            className={`${css.trackItem} ${i === currentIndex ? css.trackItemActive : ''}`}
            onClick={() => selectTrack(i)}
            title={track.path}
          >
            <span className={css.trackIndex}>{i + 1}</span>
            <span className={css.trackTitle}>{track.title}</span>
            {i === currentIndex && isPlaying && <span className={css.playingIndicator}>▶</span>}
          </div>
        ))}
      </div>

      {/* Player bar */}
      <div className={css.player}>
        <div className={css.playerTitle}>
          {currentTrack ? currentTrack.title : '— Aucune piste sélectionnée —'}
        </div>

        <div className={css.playerControls}>
          <button
            className={css.controlBtn}
            onClick={prevTrack}
            disabled={currentIndex <= 0}
            title="Précédent"
          >
            ⏮
          </button>
          <button
            className={`${css.controlBtn} ${css.playPauseBtn}`}
            onClick={togglePlayPause}
            title={isPlaying ? 'Pause' : 'Lecture'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className={css.controlBtn}
            onClick={nextTrack}
            disabled={currentIndex >= tracks.length - 1}
            title="Suivant"
          >
            ⏭
          </button>
        </div>

        <div className={css.playerProgress}>
          <span className={css.timeLabel}>{formatTime(progress)}</span>
          <div className={css.progressBar} onClick={handleProgressClick}>
            <div className={css.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
          <span className={css.timeLabel}>{formatTime(duration)}</span>
        </div>

        <div className={css.playerVolume}>
          <span className={css.volumeIcon}>🔊</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className={css.volumeSlider}
            title="Volume"
          />
        </div>
      </div>
    </div>
  );
}
