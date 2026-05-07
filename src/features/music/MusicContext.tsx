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

// Gère la lecture audio, la liste des pistes, le volume et la progression pour toute l'application
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

  // Élément <audio> persistent — ne jamais recréer pour éviter les coupures
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  // Ref synchronisée avec tracks pour être lisible dans les callbacks asynchrones (onEnded)
  const tracksRef = useRef<TrackDto[]>([]);

  // Applique le volume sauvegardé à l'élément audio dès le montage
  useEffect(() => {
    audioRef.current.volume = readMusicVolume();
  }, []);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  // Recharge le dossier musical au démarrage si un chemin était déjà sauvegardé
  useEffect(() => {
    if (folderPath) loadFolder(folderPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enregistre les événements audio pour mettre à jour la progression et passer à la piste suivante
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
    // Passe automatiquement à la piste suivante quand la lecture est terminée
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

  // Scanne un dossier via Rust, met à jour la liste de pistes et restaure la dernière piste sans lancer la lecture
  async function loadFolder(path: string) {
    setLoading(true);
    setError(null);
    setFolderPath(path);
    try {
      const result = await invoke<TrackDto[]>('scan_music_folder', { path });
      tracksRef.current = result;
      setTracks(result);

      // Restaure la position de la dernière piste écoutée sans démarrer la lecture automatiquement
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

  // Sélectionne et démarre immédiatement la lecture d'une piste par son index
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

  // Lance la première piste si aucune n'est sélectionnée, sinon alterne lecture/pause
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

  // Passe à la piste précédente si possible
  function prevTrack() {
    if (currentIndex > 0) selectTrack(currentIndex - 1);
  }

  // Passe à la piste suivante si possible
  function nextTrack() {
    if (currentIndex < tracksRef.current.length - 1) selectTrack(currentIndex + 1);
  }

  // Met à jour le volume de l'élément audio et le persiste dans le stockage
  function setVolume(v: number) {
    setVolumeState(v);
    audioRef.current.volume = v;
    writeMusicVolume(v);
  }

  // Déplace la position de lecture à une fraction (0–1) de la durée totale
  function seekTo(ratio: number) {
    const audio = audioRef.current;
    if (!duration) return;
    audio.currentTime = ratio * duration;
    setProgress(audio.currentTime);
  }

  // Arrête la lecture, vide la source et remet l'état à zéro
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

// Accède au contexte du lecteur musical — doit être utilisé dans MusicProvider
export function useMusicPlayer() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicProvider');
  return ctx;
}
