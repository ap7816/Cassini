import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { useSingleMeta } from '../../features/music/useTrackMeta';
import { getEnriched } from '../../features/music/enrichMeta';
import { useCalques } from '../../features/calques/useCalques';
import css from './MiniPlayer.module.css';

/** Durée de l'animation de sortie, doit rester alignée sur le CSS. */
const LEAVE_MS = 280;

/**
 * Suit un glissement horizontal sur une barre et rapporte la position en
 * fraction [0,1].
 */
function trackDrag(e: MouseEvent<HTMLDivElement>, onChange: (ratio: number) => void) {
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const ratioAt = (clientX: number) =>
    Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

  onChange(ratioAt(e.clientX));

  const onMove = (ev: globalThis.MouseEvent) => onChange(ratioAt(ev.clientX));
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/**
 * Ce qui joue, en bas à gauche.
 *
 * Volontairement réduit : pochette, titre, et de quoi passer d'une piste à
 * l'autre. Le reste — aléatoire, répétition, volume, choix d'une piste — vit
 * dans le lecteur, que la pochette ouvre d'un clic. Une barre pleine largeur
 * répétait tout cela sous une vue qui est le sujet de l'application.
 */
export function MiniPlayer() {
  const { t } = useTranslation();
  const music = useMusicPlayer();
  const calques = useCalques();

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

  if (!visible) return null;

  const atFirst = !music.shuffleMode && music.currentIndex <= 0 && music.repeatMode !== 'all';
  const atLast =
    !music.shuffleMode &&
    music.currentIndex >= music.tracks.length - 1 &&
    music.repeatMode !== 'all';

  return (
    <div className={`${css.player} ${leaving ? css.playerLeaving : ''}`}>
      {/* La pochette et le titre ouvrent le lecteur : c'est là que se trouvent
          le volume, l'aléatoire, la répétition et le choix d'une piste. */}
      <button
        type="button"
        className={css.ouvrir}
        onClick={() => calques.ouvrir('musique')}
        title={track?.title}
        aria-label={t('nav.music')}
      >
        {cover ? (
          <img src={cover} className={css.art} alt="" aria-hidden="true" draggable={false} />
        ) : (
          <span className={`${css.art} ${css.artPlaceholder}`} aria-hidden="true">♪</span>
        )}

        <span className={css.textes}>
          <span className={css.titleText}>{track?.title}</span>
          {meta?.artist && <span className={css.artist}>{meta.artist}</span>}
        </span>
      </button>

      <div className={css.controls}>
        <button
          type="button"
          className={css.btn}
          onClick={music.prevTrack}
          disabled={atFirst}
          title={t('music.prevTrack')}
          aria-label={t('music.prevTrack')}
        >
          ⏮
        </button>

        <button
          type="button"
          className={`${css.btn} ${css.playBtn}`}
          onClick={music.togglePlayPause}
          title={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
          aria-label={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
        >
          {music.isPlaying ? '⏸' : '▶'}
        </button>

        <button
          type="button"
          className={css.btn}
          onClick={music.nextTrack}
          disabled={atLast}
          title={t('music.nextTrack')}
          aria-label={t('music.nextTrack')}
        >
          ⏭
        </button>

        <button
          type="button"
          className={css.stopBtn}
          onClick={music.stop}
          title={t('music.stop')}
          aria-label={t('music.stop')}
        >
          ✕
        </button>
      </div>

      {/* Fil de progression sur le bord bas : il dit l'avancement sans prendre
          de hauteur, et reste saisissable. */}
      <div
        className={css.progressBar}
        onMouseDown={(e) => trackDrag(e, music.seekTo)}
        style={{
          background: `linear-gradient(to right, var(--accent, #6c8efb) 0%, var(--accent, #6c8efb) ${progressPct}%, rgba(255,255,255,0.14) ${progressPct}%, rgba(255,255,255,0.14) 100%)`,
        }}
      />
    </div>
  );
}
