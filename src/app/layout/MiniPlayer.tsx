import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { useSingleMeta } from '../../features/music/useTrackMeta';
import { getEnriched } from '../../features/music/enrichMeta';
import css from './MiniPlayer.module.css';

/** Durée de l'animation de sortie, doit rester alignée sur le CSS. */
const LEAVE_MS = 280;

function formatTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Suit un glissement horizontal sur une barre et rapporte la position en
 * fraction [0,1]. Mutualise la logique identique de la progression et du volume.
 */
function trackDrag(e: React.MouseEvent<HTMLDivElement>, onChange: (ratio: number) => void) {
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const ratioAt = (clientX: number) =>
    Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

  onChange(ratioAt(e.clientX));

  const onMove = (ev: MouseEvent) => onChange(ratioAt(ev.clientX));
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/** Lecteur persistant affiché en bas de l'application pendant la lecture. */
export function MiniPlayer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const music = useMusicPlayer();

  const currentTrack = music.currentIndex >= 0 ? music.tracks[music.currentIndex] : null;

  // La dernière piste connue reste affichée pendant l'animation de sortie
  const lastTrackRef = useRef(currentTrack);
  if (currentTrack) lastTrackRef.current = currentTrack;
  const track = currentTrack ?? lastTrackRef.current;

  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentTrack) {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      setLeaving(false);
      setVisible(true);
    } else if (visible) {
      setLeaving(true);
      leaveTimer.current = setTimeout(() => {
        setVisible(false);
        setLeaving(false);
      }, LEAVE_MS);
    }
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
    // `visible` est lu mais volontairement hors dépendances : l'ajouter
    // relancerait le minuteur de sortie à chaque changement de visibilité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  const meta = useSingleMeta(track?.path ?? null);
  // Pochette enrichie (iTunes/Deezer) si le fichier n'en embarque pas
  const enrichedCover = track ? (getEnriched(track.path)?.coverUrl ?? null) : null;
  const cover = meta?.coverDataUrl ?? enrichedCover;

  const progressPct = music.duration > 0 ? (music.progress / music.duration) * 100 : 0;
  const volumePct = music.volume * 100;

  if (!visible) return null;

  const atFirst = !music.shuffleMode && music.currentIndex <= 0 && music.repeatMode !== 'all';
  const atLast =
    !music.shuffleMode &&
    music.currentIndex >= music.tracks.length - 1 &&
    music.repeatMode !== 'all';

  return (
    <div className={`${css.player} ${leaving ? css.playerLeaving : ''}`}>
      <div className={css.trackInfo}>
        {cover ? (
          <img src={cover} className={css.art} alt="" aria-hidden="true" draggable={false} />
        ) : (
          <div className={css.artPlaceholder}>♪</div>
        )}

        <button
          className={css.title}
          title={track?.title}
          onClick={() => {
            const folder = track?.folder ?? '';
            // Mémorise la cible pour que MusicPage la lise, qu'elle soit déjà
            // montée (événement) ou non (valeur consommée au montage).
            (window as unknown as Record<string, unknown>).__musicNavTo = folder;
            window.dispatchEvent(new CustomEvent('music-nav-to', { detail: { folder } }));
            navigate('/music');
          }}
        >
          <span className={css.titleText}>{track?.title}</span>
          {meta?.artist && <span className={css.artist}>{meta.artist}</span>}
        </button>
      </div>

      <div className={css.controls}>
        <button
          className={`${css.btn} ${music.shuffleMode ? css.btnActive : ''}`}
          onClick={music.toggleShuffle}
          title={music.shuffleMode ? t('music.shuffleOn') : t('music.shuffleOff')}
        >
          🔀
        </button>

        <button
          className={css.btn}
          onClick={music.prevTrack}
          disabled={atFirst}
          title={t('music.prevTrack')}
        >
          ⏮
        </button>

        <button
          className={`${css.btn} ${css.playBtn}`}
          onClick={music.togglePlayPause}
          title={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
        >
          {music.isPlaying ? '⏸' : '▶'}
        </button>

        <button
          className={css.btn}
          onClick={music.nextTrack}
          disabled={atLast}
          title={t('music.nextTrack')}
        >
          ⏭
        </button>

        <button
          className={`${css.btn} ${music.repeatMode !== 'none' ? css.btnActive : ''}`}
          onClick={music.cycleRepeat}
          title={
            music.repeatMode === 'none'
              ? t('music.repeatOff')
              : music.repeatMode === 'all'
                ? t('music.repeatAll')
                : t('music.repeatOne')
          }
        >
          {music.repeatMode === 'one' ? '🔂' : '🔁'}
        </button>
      </div>

      <div className={css.progress}>
        <span className={css.time}>{formatTime(music.progress)}</span>
        <div
          className={css.progressBar}
          onMouseDown={(e) => trackDrag(e, music.seekTo)}
          style={{
            background: `linear-gradient(to right, var(--accent, #6c8efb) 0%, var(--accent, #6c8efb) ${progressPct}%, rgba(255,255,255,0.18) ${progressPct}%, rgba(255,255,255,0.18) 100%)`,
          }}
        >
          <div className={css.progressThumb} style={{ left: `${progressPct}%` }} />
        </div>
        <span className={css.time}>{formatTime(music.duration)}</span>
      </div>

      <div className={css.volume}>
        <span className={css.volumeIcon}>
          {music.volume === 0 ? '🔇' : music.volume < 0.5 ? '🔉' : '🔊'}
        </span>
        <div
          className={css.volumeBar}
          onMouseDown={(e) => trackDrag(e, music.setVolume)}
          title={t('music.volumeLabel', { pct: Math.round(music.volume * 100) })}
          style={{
            background: `linear-gradient(to right, var(--accent, #6c8efb) 0%, var(--accent, #6c8efb) ${volumePct}%, rgba(255,255,255,0.22) ${volumePct}%, rgba(255,255,255,0.22) 100%)`,
          }}
        >
          <div className={css.volumeThumb} style={{ left: `${volumePct}%` }} />
        </div>
      </div>

      <button className={css.stopBtn} onClick={music.stop} title={t('music.stop')}>
        ✕
      </button>
    </div>
  );
}
