import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { useSingleMeta } from '../../features/music/useTrackMeta';
import { getEnriched } from '../../features/music/enrichMeta';
import { useCalques } from '../../features/calques/useCalques';
import { Glissiere } from '../../components/Glissiere/Glissiere';
import css from './MiniPlayer.module.css';
import { IconeHud } from '../../components/IconeHud/IconeHud';

/** Secondes → `M:SS`. */
function tempsCourt(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Durée de l'animation de sortie, doit rester alignée sur le CSS. */
const LEAVE_MS = 280;


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
          className={`${css.btn} ${css.saut}`}
          onClick={music.prevTrack}
          disabled={atFirst}
          title={t('music.prevTrack')}
          aria-label={t('music.prevTrack')}
        >
          <IconeHud nom="precedent" />
        </button>

        <button
          type="button"
          className={`${css.btn} ${css.playBtn}`}
          onClick={music.togglePlayPause}
          title={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
          aria-label={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
        >
          <IconeHud nom={music.isPlaying ? 'pause' : 'lecture'} />
        </button>

        <button
          type="button"
          className={`${css.btn} ${css.saut}`}
          onClick={music.nextTrack}
          disabled={atLast}
          title={t('music.nextTrack')}
          aria-label={t('music.nextTrack')}
        >
          <IconeHud nom="suivant" />
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
      <Glissiere
        className={css.progressBar}
        valeur={music.duration > 0 ? music.progress / music.duration : 0}
        onChange={music.seekTo}
        label={t('music.seekLabel')}
        texteValeur={t('music.seekValue', {
          position: tempsCourt(music.progress),
          duree: tempsCourt(music.duration),
        })}
        pas={0.02}
      >
        {/* Poignée à saisir : un fil de 3 px se visait mal, surtout pour
            reprendre un morceau à un endroit précis. */}
        <span className={css.poignee} />
      </Glissiere>
    </div>
  );
}
