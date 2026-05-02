import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  readMusicFolder,
  readMusicVolume, writeMusicVolume,
  readMusicLastTrack, writeMusicLastTrack,
} from '../../services/storage';

export interface TrackDto {
  path: string;
  title: string;
  folder: string;
}

interface MusicContextType {
  tracks: TrackDto[];
  folderPath: string;
  currentIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  loading: boolean;
  error: string | null;
  loadFolder: (path: string) => Promise<void>;
  selectTrack: (index: number) => void;
  togglePlayPause: () => void;
  prevTrack: () => void;
  nextTrack: () => void;
  setVolume: (v: number) => void;
  seekTo: (ratio: number) => void;
  stop: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const [folderPath, setFolderPath] = useState<string>(readMusicFolder);
  const [tracks, setTracks] = useState<TrackDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState<number>(readMusicVolume);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const tracksRef = useRef<TrackDto[]>([]);

  // Apply saved volume to audio element on mount
  useEffect(() => {
    audioRef.current.volume = readMusicVolume();
  }, []);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  // Load folder on mount
  useEffect(() => {
    if (folderPath) loadFolder(folderPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;

    function onTimeUpdate() {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    }
    function onLoadedMetadata() {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    }
    function onEnded() {
      setCurrentIndex((i) => {
        const ts = tracksRef.current;
        const next = i + 1;
        if (next < ts.length) {
          writeMusicLastTrack(next);
          setTimeout(() => {
            audio.src = convertFileSrc(ts[next].path);
            audio.load();
            audio.play().catch(() => {});
            setIsPlaying(true);
          }, 0);
          return next;
        }
        setIsPlaying(false);
        return i;
      });
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  async function loadFolder(path: string) {
    setLoading(true);
    setError(null);
    setFolderPath(path);
    try {
      const result = await invoke<TrackDto[]>('scan_music_folder', { path });
      tracksRef.current = result;
      setTracks(result);

      // Restore last played track (without auto-playing)
      const saved = readMusicLastTrack();
      if (saved >= 0 && saved < result.length) {
        setCurrentIndex(saved);
        const audio = audioRef.current;
        audio.src = convertFileSrc(result[saved].path);
        audio.load();
      }
    } catch (e) {
      setError(String(e));
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }

  function selectTrack(index: number) {
    const audio = audioRef.current;
    const ts = tracksRef.current;
    if (index < 0 || index >= ts.length) return;
    setCurrentIndex(index);
    writeMusicLastTrack(index);
    audio.src = convertFileSrc(ts[index].path);
    audio.load();
    audio.play().catch(() => {});
    setIsPlaying(true);
    setProgress(0);
  }

  function togglePlayPause() {
    const audio = audioRef.current;
    if (currentIndex < 0 && tracksRef.current.length > 0) {
      selectTrack(0);
      return;
    }
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  function prevTrack() {
    if (currentIndex > 0) selectTrack(currentIndex - 1);
  }

  function nextTrack() {
    if (currentIndex < tracksRef.current.length - 1) selectTrack(currentIndex + 1);
  }

  function setVolume(v: number) {
    setVolumeState(v);
    audioRef.current.volume = v;
    writeMusicVolume(v);
  }

  function seekTo(ratio: number) {
    const audio = audioRef.current;
    if (!duration) return;
    audio.currentTime = ratio * duration;
    setProgress(audio.currentTime);
  }

  function stop() {
    const audio = audioRef.current;
    audio.pause();
    audio.src = '';
    setIsPlaying(false);
    setCurrentIndex(-1);
    setProgress(0);
    setDuration(0);
  }

  return (
    <MusicContext.Provider value={{
      tracks, folderPath, currentIndex, isPlaying, progress, duration, volume, loading, error,
      loadFolder, selectTrack, togglePlayPause, prevTrack, nextTrack, setVolume, seekTo, stop,
    }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusicPlayer() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicProvider');
  return ctx;
}
