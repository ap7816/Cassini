import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { useLazyCoverArt, useSingleMeta } from '../../features/music/useTrackMeta';
import type { TrackDto } from '../../features/music/MusicContext';
import { getEnriched } from '../../features/music/enrichMeta';
import { writeMusicFolder } from '../../services/storage';
import { Equalizer } from './components/Equalizer';
import css from './LecteurRapide.module.css';

/** Secondes → `M:SS`. */
function tempsCourt(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Suit un glissement horizontal sur une barre et rapporte la fraction [0,1]. */
function suivreGlissement(e: MouseEvent<HTMLDivElement>, onChange: (ratio: number) => void) {
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const fractionA = (x: number) => Math.min(1, Math.max(0, (x - rect.left) / rect.width));

  onChange(fractionA(e.clientX));

  const bouge = (ev: globalThis.MouseEvent) => onChange(fractionA(ev.clientX));
  const relache = () => {
    window.removeEventListener('mousemove', bouge);
    window.removeEventListener('mouseup', relache);
  };
  window.addEventListener('mousemove', bouge);
  window.addEventListener('mouseup', relache);
};

/**
 * Au-delà, la liste cesse d'être consultable et coûterait à afficher : une
 * bibliothèque de plusieurs milliers de pistes se parcourt à la recherche, pas
 * au défilement.
 */
const MAX_LIGNES = 80;

type LigneProps = {
  piste: TrackDto;
  active: boolean;
  enLecture: boolean;
  onJouer: () => void;
};

/**
 * Une piste de la liste.
 *
 * Sa pochette est à droite, et n'est cherchée que lorsque la ligne approche de
 * la vue : lire les images de toute une bibliothèque à l'ouverture coûterait
 * l'instantanéité qu'on cherche ici. Celles déjà lues viennent du cache et
 * s'affichent sans attendre.
 */
function LigneRapide({ piste, active, enLecture, onJouer }: LigneProps) {
  const ligne = useRef<HTMLButtonElement>(null);
  const pochetteId3 = useLazyCoverArt(piste.path, ligne);
  const pochette = pochetteId3 ?? getEnriched(piste.path)?.coverUrl ?? null;

  return (
    <button
      ref={ligne}
      type="button"
      className={active ? `${css.ligne} ${css.ligneActive}` : css.ligne}
      onClick={onJouer}
      aria-current={active ? 'true' : undefined}
    >
      <span className={css.vignette}>
        {pochette ? (
          <img src={pochette} className={css.image} alt="" aria-hidden="true" draggable={false} />
        ) : (
          <span className={css.imageVide} aria-hidden="true">♪</span>
        )}

        {/* La lecture en cours se marque sur la pochette : une colonne de plus
            à gauche n'aurait servi qu'à elle, et l'aurait repoussée. */}
        {active && (
          <span className={css.voile} aria-hidden="true">
            {enLecture ? <Equalizer /> : '♪'}
          </span>
        )}
      </span>

      <span className={css.ligneTextes}>
        <span className={css.ligneTitre}>{piste.title}</span>
        {piste.folder && <span className={css.ligneDossier}>{piste.folder}</span>}
      </span>
    </button>
  );
}

type Props = {
  onFermer: () => void;
};

/**
 * Lecteur compact, posé sur la vue.
 *
 * Ce qui joue, de quoi le piloter, et de quoi choisir autre chose — rien de
 * plus. Le rangement d'une bibliothèque (renommer, déplacer, changer une
 * pochette) demande de la place et se fait rarement : il reste à la page, qu'un
 * lien discret ouvre.
 *
 * Aucune métadonnée n'est lue pour la liste : titre et dossier suffisent à
 * choisir, et les lire toutes ralentirait l'ouverture pour rien. Seule la piste
 * en cours va chercher sa pochette.
 */
export function LecteurRapide({ onFermer }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const music = useMusicPlayer();
  const [recherche, setRecherche] = useState('');

  const piste = music.currentIndex >= 0 ? music.tracks[music.currentIndex] : null;
  const meta = useSingleMeta(piste?.path ?? null);
  const pochette = meta?.coverDataUrl ?? (piste ? getEnriched(piste.path)?.coverUrl ?? null : null);
  const artiste = meta?.artist ?? (piste ? getEnriched(piste.path)?.artist ?? null : null);

  // `Espace` lit ou met en pause, sauf en train de taper dans la recherche.
  // En capture et propagation coupée : la scène écoute la même touche pour
  // monter, et la caméra décollerait derrière le calque.
  const basculer = useRef(music.togglePlayPause);
  useEffect(() => {
    basculer.current = music.togglePlayPause;
  }, [music.togglePlayPause]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      e.stopPropagation();
      basculer.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const q = recherche.trim().toLowerCase();

  const sections = useMemo(() => {
    if (q) {
      const trouves: number[] = [];
      for (let i = 0; i < music.tracks.length && trouves.length < MAX_LIGNES; i += 1) {
        const p = music.tracks[i];
        if (p.title.toLowerCase().includes(q) || p.folder.toLowerCase().includes(q)) trouves.push(i);
      }
      return [{ titre: null as string | null, indices: trouves }];
    }

    const parChemin = new Map(music.tracks.map((p, i) => [p.path, i]));
    const recents = music.recentlyPlayed
      .map((chemin) => parChemin.get(chemin))
      .filter((i): i is number => i !== undefined)
      .slice(0, 6);

    const dejaVues = new Set(recents);
    const suite: number[] = [];
    for (let i = 0; i < music.tracks.length && suite.length < MAX_LIGNES; i += 1) {
      if (!dejaVues.has(i)) suite.push(i);
    }

    return [
      { titre: t('music.recentlyPlayed'), indices: recents },
      { titre: t('music.allTracks'), indices: suite },
    ].filter((s) => s.indices.length > 0);
  }, [music.tracks, music.recentlyPlayed, q, t]);

  async function choisirDossier() {
    const choisi = await open({ directory: true, multiple: false });
    if (choisi && typeof choisi === 'string') {
      writeMusicFolder(choisi);
      await music.loadFolder(choisi);
    }
  }

  const avancement = music.duration > 0 ? (music.progress / music.duration) * 100 : 0;
  const volume = music.volume * 100;

  const auDebut = !music.shuffleMode && music.currentIndex <= 0 && music.repeatMode !== 'all';
  const aLaFin =
    !music.shuffleMode &&
    music.currentIndex >= music.tracks.length - 1 &&
    music.repeatMode !== 'all';

  return (
    <div className={css.lecteur}>
      {/* ── Ce qui joue ── */}
      <div className={css.enCours}>
        {pochette ? (
          <img src={pochette} className={css.pochette} alt="" aria-hidden="true" draggable={false} />
        ) : (
          <div className={`${css.pochette} ${css.pochetteVide}`} aria-hidden="true">♪</div>
        )}
        <div className={css.enCoursTextes}>
          <span className={css.enCoursTitre} title={piste?.title}>
            {piste?.title ?? t('music.chooseFirst')}
          </span>
          {artiste && <span className={css.enCoursArtiste}>{artiste}</span>}
        </div>
      </div>

      {/* ── Progression ── */}
      <div className={css.progression}>
        <span className={css.temps}>{tempsCourt(music.progress)}</span>
        <div
          className={css.barre}
          onMouseDown={(e) => suivreGlissement(e, music.seekTo)}
          style={{ '--part': `${avancement}%` } as CSSProperties}
        >
          <span className={css.curseur} style={{ left: `${avancement}%` }} />
        </div>
        <span className={css.temps}>{tempsCourt(music.duration)}</span>
      </div>

      {/* ── Commandes ── */}
      <div className={css.commandes}>
        <button
          type="button"
          className={music.shuffleMode ? `${css.bouton} ${css.boutonActif}` : css.bouton}
          onClick={music.toggleShuffle}
          title={music.shuffleMode ? t('music.shuffleOn') : t('music.shuffleOff')}
          aria-label={music.shuffleMode ? t('music.shuffleOn') : t('music.shuffleOff')}
        >
          🔀
        </button>
        <button
          type="button"
          className={css.bouton}
          onClick={music.prevTrack}
          disabled={auDebut}
          title={t('music.prevTrack')}
          aria-label={t('music.prevTrack')}
        >
          ⏮
        </button>
        <button
          type="button"
          className={`${css.bouton} ${css.boutonLecture}`}
          onClick={music.togglePlayPause}
          title={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
          aria-label={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
        >
          {music.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className={css.bouton}
          onClick={music.nextTrack}
          disabled={aLaFin}
          title={t('music.nextTrack')}
          aria-label={t('music.nextTrack')}
        >
          ⏭
        </button>
        <button
          type="button"
          className={music.repeatMode !== 'none' ? `${css.bouton} ${css.boutonActif}` : css.bouton}
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

        <div
          className={css.volume}
          onMouseDown={(e) => suivreGlissement(e, music.setVolume)}
          title={t('music.volumeLabel', { pct: Math.round(music.volume * 100) })}
          style={{ '--part': `${volume}%` } as CSSProperties}
        />
      </div>

      {/* ── Choisir une piste ── */}
      {music.tracks.length === 0 ? (
        <div className={css.vide}>
          <button type="button" className={css.principal} onClick={() => void choisirDossier()}>
            {t('music.chooseFolder')}
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            className={css.recherche}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={t('nav.searchPlaceholder')}
            aria-label={t('nav.searchLabel')}
          />

          <div className={css.liste}>
            {sections.length === 0 && <p className={css.aucun}>{t('music.noResults', { query: recherche })}</p>}

            {sections.map((section) => (
              <div key={section.titre ?? 'resultats'}>
                {section.titre && <div className={css.sectionTitre}>{section.titre}</div>}
                {section.indices.map((index) => (
                  <LigneRapide
                    key={music.tracks[index].path}
                    piste={music.tracks[index]}
                    active={index === music.currentIndex}
                    enLecture={music.isPlaying}
                    onJouer={() => music.selectTrack(index)}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        className={css.lien}
        onClick={() => {
          onFermer();
          navigate('/music');
        }}
      >
        {t('music.openFull')}
      </button>
    </div>
  );
}
