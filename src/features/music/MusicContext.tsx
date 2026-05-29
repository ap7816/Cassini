import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  readMusicFolder,
  readMusicVolume, writeMusicVolume,
  readMusicLastTrack, writeMusicLastTrack,
  readMusicShuffle, writeMusicShuffle,
  readMusicRepeat, writeMusicRepeat,
  readMusicRecentlyPlayed, writeMusicRecentlyPlayed,
  type RepeatMode,
} from '../../services/storage';

export type { RepeatMode };

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
  shuffleMode: boolean;
  repeatMode: RepeatMode;
  recentlyPlayed: string[];
  loadFolder: (path: string) => Promise<void>;
  selectTrack: (index: number) => void;
  togglePlayPause: () => void;
  prevTrack: () => void;
  nextTrack: () => void;
  setVolume: (v: number) => void;
  seekTo: (ratio: number) => void;
  stop: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

const MusicContext = createContext<MusicContextType | null>(null);

// Génère une file aléatoire de tous les indices sauf excludeIndex (algorithme Fisher-Yates)
function buildShuffleQueue(total: number, excludeIndex: number): number[] {
  const arr = Array.from({ length: total }, (_, i) => i).filter(i => i !== excludeIndex);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Gère la lecture audio, la liste des pistes, le volume, la progression, shuffle et repeat
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
  const [shuffleMode, setShuffleModeState] = useState<boolean>(readMusicShuffle);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>(readMusicRepeat);
  const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>(readMusicRecentlyPlayed);

  // Élément <audio> persistent — ne jamais recréer pour éviter les coupures
  const audioRef = useRef<HTMLAudioElement>(new Audio());

  // Refs synchronisées avec l'état — lisibles dans les callbacks async/événements sans closure stale
  const tracksRef = useRef<TrackDto[]>([]);
  const currentIndexRef = useRef(-1);
  const shuffleModeRef = useRef(shuffleMode);
  const repeatModeRef = useRef(repeatMode);

  // File des pistes restantes en mode shuffle (indices non encore joués)
  const shuffleQueueRef = useRef<number[]>([]);
  // Historique des pistes jouées en mode shuffle (pour revenir en arrière)
  const shuffleHistoryRef = useRef<number[]>([]);
  // Ref de l'historique récent — accessible dans onEnded sans closure stale
  const recentlyPlayedRef = useRef<string[]>(readMusicRecentlyPlayed());

  // Synchronisation des refs avec les états correspondants
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { shuffleModeRef.current = shuffleMode; }, [shuffleMode]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { recentlyPlayedRef.current = recentlyPlayed; }, [recentlyPlayed]);

  // Applique le volume sauvegardé à l'élément audio dès le montage
  useEffect(() => {
    audioRef.current.volume = readMusicVolume();
  }, []);

  // Recharge le dossier musical au démarrage si un chemin était déjà sauvegardé
  useEffect(() => {
    if (folderPath) loadFolder(folderPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enregistre les événements audio pour progression, métadonnées et passage automatique à la piste suivante
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

    // Gère la fin d'une piste selon les modes repeat et shuffle actifs
    function onEnded() {
      const ts = tracksRef.current;
      const i = currentIndexRef.current;
      const shuffle = shuffleModeRef.current;
      const repeat = repeatModeRef.current;

      // Repeat one : redémarre la piste depuis le début
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        setIsPlaying(true);
        return;
      }

      // Calcule l'index de la prochaine piste selon shuffle + repeat
      let next = -1;

      if (shuffle) {
        if (shuffleQueueRef.current.length > 0) {
          // Pioche la prochaine piste aléatoire depuis la file
          next = shuffleQueueRef.current.shift()!;
          shuffleHistoryRef.current.push(i);
        } else if (repeat === 'all') {
          // File épuisée avec repeat all → reconstruit une nouvelle file
          shuffleQueueRef.current = buildShuffleQueue(ts.length, i);
          shuffleHistoryRef.current = [];
          if (shuffleQueueRef.current.length > 0) {
            next = shuffleQueueRef.current.shift()!;
            shuffleHistoryRef.current.push(i);
          }
        }
        // shuffle + none + file vide → s'arrête
      } else {
        next = i + 1;
        if (next >= ts.length) {
          // Repeat all : revient au début de la liste
          if (repeat === 'all') next = 0;
          else next = -1; // stop
        }
      }

      if (next >= 0 && next < ts.length) {
        currentIndexRef.current = next;
        setCurrentIndex(next);
        writeMusicLastTrack(next);

        // Ajoute la piste suivante dans l'historique récent (même logique que selectTrack)
        const nextPath = ts[next].path;
        const updatedRecent = [nextPath, ...recentlyPlayedRef.current.filter(p => p !== nextPath)].slice(0, 10);
        recentlyPlayedRef.current = updatedRecent;
        setRecentlyPlayed(updatedRecent);
        writeMusicRecentlyPlayed(updatedRecent);

        setTimeout(() => {
          audio.src = convertFileSrc(ts[next].path);
          audio.load();
          audio.play().catch(() => {});
          setIsPlaying(true);
        }, 0);
      } else {
        setIsPlaying(false);
      }
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
        currentIndexRef.current = saved;
        setCurrentIndex(saved);
        const audio = audioRef.current;
        audio.src = convertFileSrc(result[saved].path);
        audio.load();
      }

      // Reconstruit la file shuffle si le mode est actif lors du rechargement du dossier
      if (shuffleModeRef.current && result.length > 0) {
        const savedIdx = readMusicLastTrack();
        shuffleQueueRef.current = buildShuffleQueue(result.length, savedIdx >= 0 ? savedIdx : -1);
        shuffleHistoryRef.current = [];
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

    // Met à jour le ref immédiatement pour que onEnded ait toujours la bonne valeur
    currentIndexRef.current = index;
    setCurrentIndex(index);
    writeMusicLastTrack(index);
    audio.src = convertFileSrc(ts[index].path);
    audio.load();
    audio.play().catch(() => {});
    setIsPlaying(true);
    setProgress(0);

    // Ajoute la piste en tête de l'historique récent (dédoublonnage + limite 10)
    const path = ts[index].path;
    setRecentlyPlayed(prev => {
      const next = [path, ...prev.filter(p => p !== path)].slice(0, 10);
      writeMusicRecentlyPlayed(next);
      return next;
    });
  }

  // Lance la première piste si aucune n'est sélectionnée, sinon alterne lecture/pause
  // Utilise audio.paused (état DOM live) plutôt que isPlaying (state React potentiellement périmé)
  function togglePlayPause() {
    const audio = audioRef.current;
    if (currentIndexRef.current < 0 && tracksRef.current.length > 0) {
      selectTrack(0);
      return;
    }
    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  // Passe à la piste précédente — en shuffle : remonte l'historique; sinon : index-1 (ou dernier si repeat all)
  function prevTrack() {
    const i = currentIndexRef.current;
    const ts = tracksRef.current;
    const shuffle = shuffleModeRef.current;
    const repeat = repeatModeRef.current;

    if (shuffle) {
      const hist = shuffleHistoryRef.current;
      if (hist.length > 0) {
        // Remet la piste courante en tête de file et revient sur la précédente de l'historique
        const prev = hist.pop()!;
        shuffleQueueRef.current.unshift(i);
        selectTrack(prev);
      }
      // Pas d'historique → ne fait rien
    } else {
      if (i > 0) {
        selectTrack(i - 1);
      } else if (repeat === 'all' && ts.length > 0) {
        // Repeat all : cycle vers la dernière piste
        selectTrack(ts.length - 1);
      }
    }
  }

  // Passe à la piste suivante — en shuffle : pioche dans la file; sinon : index+1 (ou premier si repeat all)
  function nextTrack() {
    const i = currentIndexRef.current;
    const ts = tracksRef.current;
    const shuffle = shuffleModeRef.current;
    const repeat = repeatModeRef.current;

    if (shuffle) {
      if (shuffleQueueRef.current.length > 0) {
        const next = shuffleQueueRef.current.shift()!;
        shuffleHistoryRef.current.push(i);
        selectTrack(next);
      } else if (repeat === 'all' && ts.length > 1) {
        // File épuisée avec repeat all → reconstruit et continue
        shuffleQueueRef.current = buildShuffleQueue(ts.length, i);
        shuffleHistoryRef.current = [];
        const next = shuffleQueueRef.current.shift()!;
        shuffleHistoryRef.current.push(i);
        selectTrack(next);
      }
      // shuffle + none + file vide → s'arrête
    } else {
      if (i < ts.length - 1) {
        selectTrack(i + 1);
      } else if (repeat === 'all' && ts.length > 0) {
        selectTrack(0);
      }
    }
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

  // Arrête la lecture, vide la source et remet l'état à zéro (y compris shuffle/historique)
  function stop() {
    const audio = audioRef.current;
    audio.pause();
    audio.src = '';
    setIsPlaying(false);
    currentIndexRef.current = -1;
    setCurrentIndex(-1);
    setProgress(0);
    setDuration(0);
    shuffleQueueRef.current = [];
    shuffleHistoryRef.current = [];
  }

  // Active ou désactive le mode aléatoire — génère une nouvelle file au démarrage
  function toggleShuffle() {
    const next = !shuffleModeRef.current;
    shuffleModeRef.current = next;
    setShuffleModeState(next);
    writeMusicShuffle(next);
    if (next) {
      // Construit la file shuffle initiale en excluant la piste courante
      shuffleQueueRef.current = buildShuffleQueue(tracksRef.current.length, currentIndexRef.current);
      shuffleHistoryRef.current = [];
    } else {
      // Réinitialise les structures shuffle quand on désactive le mode
      shuffleQueueRef.current = [];
      shuffleHistoryRef.current = [];
    }
  }

  // Cycle entre les modes de répétition : none → all → one → none
  function cycleRepeat() {
    const order: RepeatMode[] = ['none', 'all', 'one'];
    const next = order[(order.indexOf(repeatModeRef.current) + 1) % order.length];
    repeatModeRef.current = next;
    setRepeatModeState(next);
    writeMusicRepeat(next);
  }

  return (
    <MusicContext.Provider value={{
      tracks, folderPath, currentIndex, isPlaying, progress, duration, volume, loading, error,
      shuffleMode, repeatMode, recentlyPlayed,
      loadFolder, selectTrack, togglePlayPause, prevTrack, nextTrack, setVolume, seekTo, stop,
      toggleShuffle, cycleRepeat,
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
