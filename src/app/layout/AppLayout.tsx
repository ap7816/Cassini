import { NavLink, Outlet, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState } from 'react';
import logo from '../../assets/favicon.png';
import css from './AppLayout.module.css';
import { useAppLayout } from './useAppLayout';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useUpdater, type UpdaterState } from '../../features/updater/useUpdater';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { useSingleMeta } from '../../features/music/useTrackMeta';
import { getEnriched } from '../../features/music/enrichMeta';
import { Toasts } from '../../features/toast/Toasts';

// Bandeau de mise à jour affiché en haut de la sidebar quand une mise à jour est disponible ou en cours
function UpdateBanner({ u }: { u: UpdaterState }) {
  const { t } = useTranslation();
  if (!u.available && !u.installing) return null;
  return (
    <div className={css.updateBanner}>
      {u.installing ? (
        <>
          <span className={css.updateTitle}>{t('updater.installing')}</span>
          <div className={css.updateProgressBar}>
            <div className={css.updateProgressFill} style={{ width: `${u.progress}%` }} />
          </div>
          <span className={css.updatePct}>{u.progress}%</span>
        </>
      ) : (
        <>
          <div className={css.updateHeader}>
            <span className={css.updateTitle}>{t('updater.available')}</span>
            <button className={css.updateDismiss} onClick={u.dismiss} aria-label={t('updater.dismiss')}>✕</button>
          </div>
          <span className={css.updateVersion}>{t('updater.version', { version: u.version })}</span>
          {u.body && <p className={css.updateBody}>{u.body}</p>}
          <button className={css.updateBtn} onClick={u.doInstall}>{t('updater.installNow')}</button>
        </>
      )}
    </div>
  );
}

export function AppLayout() {
  const { t } = useTranslation();

  const navItems = [
    { to: '/library', label: t('nav.library') },
    { to: '/launchers', label: t('nav.launchers') },
    { to: '/music', label: t('nav.music') },
    { to: '/settings', label: t('nav.settings') },
  ];

  const { isMobile, sidebarOpen, pageTitle, openSidebar, closeSidebar } = useAppLayout(navItems, 900);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';

  function handleSearchChange(nextValue: string) {
    const next = new URLSearchParams(searchParams);
    const trimmed = nextValue.trim();
    if (!trimmed) next.delete('q');
    else next.set('q', nextValue);
    setSearchParams(next, { replace: true });
  }

  const sidebarClassName = [
    css.sidebar,
    isMobile ? css.sidebarMobile : css.sidebarDesktop,
    isMobile ? (sidebarOpen ? css.sidebarMobileOpen : css.sidebarMobileClosed) : '',
  ].filter(Boolean).join(' ');

  const { settings } = useAppSettings();
  const navigate = useNavigate();

  // Ref toujours à jour — permet au listener (créé une seule fois) de lire la valeur courante
  const runInBgRef = useRef(settings.runInBackground);
  useEffect(() => { runInBgRef.current = settings.runInBackground; }, [settings.runInBackground]);

  // Minimize to tray instead of closing when runInBackground is enabled
  // Listener enregistré une seule fois au montage pour éviter les doublons liés à l'async
  useEffect(() => {
    if (!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return;
    let unlisten: (() => void) | undefined;
    let mounted = true;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      if (!mounted) return;
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (runInBgRef.current) {
            event.preventDefault();
            await getCurrentWindow().hide();
          }
        })
        .then((fn) => {
          if (!mounted) { fn(); return; }
          unlisten = fn;
        });
    });
    return () => { mounted = false; unlisten?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Music player
  const music = useMusicPlayer();
  const progressPct = music.duration > 0 ? (music.progress / music.duration) * 100 : 0;
  const currentTrack = music.currentIndex >= 0 ? music.tracks[music.currentIndex] : null;

  // Conserve la dernière piste connue pour l'afficher pendant l'animation de sortie
  const lastTrackRef = useRef(currentTrack);
  if (currentTrack) lastTrackRef.current = currentTrack;
  const displayTrack = currentTrack ?? lastTrackRef.current;

  // Gère le fade-out du mini-player quand la piste s'arrête
  const [playerVisible, setPlayerVisible] = useState(false);
  const [playerLeaving, setPlayerLeaving] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentTrack) {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      setPlayerLeaving(false);
      setPlayerVisible(true);
    } else if (playerVisible) {
      setPlayerLeaving(true);
      leaveTimerRef.current = setTimeout(() => {
        setPlayerVisible(false);
        setPlayerLeaving(false);
      }, 280);
    }
    return () => { if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  const miniMeta = useSingleMeta(displayTrack?.path ?? null);
  // Cover enrichie (iTunes/Deezer) utilisée si pas de cover embarquée dans le fichier
  const enrichedCover = displayTrack ? (getEnriched(displayTrack.path)?.coverUrl ?? null) : null;
  const miniCover = miniMeta?.coverDataUrl ?? enrichedCover;
  const volPct = music.volume * 100;

  const volumeBarRef = useRef<HTMLDivElement>(null);

  // Drag sur la barre de progression : pause pendant le glisser pour éviter le scrubbing audio
  function handleProgressMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    function calc(clientX: number) {
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }
    // Mémorise l'état et met en pause immédiatement — le seek reste silencieux
    const wasPlaying = music.isPlaying;
    if (wasPlaying) music.togglePlayPause();
    music.seekTo(calc(e.clientX));
    function onMove(ev: MouseEvent) { music.seekTo(calc(ev.clientX)); }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Reprend la lecture uniquement si elle était active avant le drag
      if (wasPlaying) music.togglePlayPause();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleVolumeMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    function calc(clientX: number) {
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }
    music.setVolume(calc(e.clientX));
    function onMove(ev: MouseEvent) { music.setVolume(calc(ev.clientX)); }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function formatTime(sec: number) {
    if (!isFinite(sec) || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  type CSSVarStyle = React.CSSProperties & {
    ['--app-bg-image']?: string;
    ['--accent']?: string;
    ['--bg-overlay-opacity']?: number;
  };

  const bgStyle: CSSVarStyle = {
    '--app-bg-image': settings.backgroundImageDataUrl
      ? `url("${settings.backgroundImageDataUrl}")`
      : 'none',
    '--accent': settings.accentColor,
    '--bg-overlay-opacity': settings.bgOverlayOpacity,
  };

  const updater = useUpdater();

  return (
    <div className={css.shell} style={bgStyle}>
      {isMobile && sidebarOpen && (
        <div className={css.backdrop} onClick={closeSidebar} aria-hidden="true" />
      )}

      <aside className={sidebarClassName}>
        <div className={css.brand}>
          <img src={logo} alt="ArcHive logo" className={css.logo} />
          <div className={css.brandSubtitle}>{t('nav.gameHub')}</div>
        </div>

        <nav className={css.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? `${css.navItem} ${css.navItemActive}` : css.navItem
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={css.sidebarFooter}>
          <div className={css.muted}>v{__APP_VERSION__}</div>
        </div>
      </aside>

      <main className={css.main}>
        <header className={css.header}>
          <div className={css.headerLeft}>
            {isMobile && (
              <button
                type="button"
                className={css.burger}
                onClick={openSidebar}
                aria-label={t('nav.openMenu')}
                title={t('nav.openMenu')}
              >
                <span className={css.burgerIcon} aria-hidden="true">☰</span>
              </button>
            )}
            <div className={css.headerTitle}>{pageTitle}</div>
          </div>

          <input
            className={css.search}
            placeholder={t('nav.searchPlaceholder')}
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label={t('nav.searchLabel')}
          />
        </header>

        <section className={css.content}>
          {/* Clé = pathname seul → animation uniquement au changement de route, pas sur même page */}
          <div key={location.pathname} className={css.pageTransition}>
            <Outlet />
          </div>
        </section>

        {/* Persistent mini-player — animé à l'entrée et à la sortie */}
        {playerVisible && (
          <div className={`${css.miniPlayer} ${playerLeaving ? css.miniPlayerLeaving : ''}`}>
            <div className={css.miniTrackInfo}>
              {miniCover
                ? <img src={miniCover} className={css.miniArt} alt="" aria-hidden="true" draggable={false} />
                : <div className={css.miniArtPlaceholder}>♪</div>
              }
              <button
                className={css.miniTitle}
                title={displayTrack?.title}
                onClick={() => {
                  const folder = displayTrack?.folder ?? '';
                  // Stocke le dossier cible pour que MusicPage le lise au montage ou immédiatement
                  (window as unknown as Record<string, unknown>).__musicNavTo = folder;
                  window.dispatchEvent(new CustomEvent('music-nav-to', { detail: { folder } }));
                  navigate('/music');
                }}
              >
                <span className={css.miniTitleText}>{displayTrack?.title}</span>
                {miniMeta?.artist && <span className={css.miniArtist}>{miniMeta.artist}</span>}
              </button>
            </div>

            <div className={css.miniControls}>
              {/* Shuffle : actif = surligné avec accent */}
              <button
                className={`${css.miniBtn} ${music.shuffleMode ? css.miniBtnActive : ''}`}
                onClick={music.toggleShuffle}
                title={music.shuffleMode ? t('music.shuffleOn') : t('music.shuffleOff')}
              >🔀</button>

              {/* Précédent : désactivé en séquentiel sans repeat sur la première piste */}
              <button
                className={css.miniBtn}
                onClick={music.prevTrack}
                disabled={!music.shuffleMode && music.currentIndex <= 0 && music.repeatMode !== 'all'}
                title={t('music.prevTrack')}
              >⏮</button>

              <button
                className={`${css.miniBtn} ${css.miniPlayBtn}`}
                onClick={music.togglePlayPause}
                title={music.isPlaying ? t('music.pauseTitle') : t('music.playTitle')}
              >{music.isPlaying ? '⏸' : '▶'}</button>

              {/* Suivant : désactivé en séquentiel sans repeat sur la dernière piste */}
              <button
                className={css.miniBtn}
                onClick={music.nextTrack}
                disabled={!music.shuffleMode && music.currentIndex >= music.tracks.length - 1 && music.repeatMode !== 'all'}
                title={t('music.nextTrack')}
              >⏭</button>

              {/* Repeat : 🔂 = one, 🔁 = all/none ; actif si repeat ≠ none */}
              <button
                className={`${css.miniBtn} ${music.repeatMode !== 'none' ? css.miniBtnActive : ''}`}
                onClick={music.cycleRepeat}
                title={
                  music.repeatMode === 'none' ? t('music.repeatOff')
                  : music.repeatMode === 'all' ? t('music.repeatAll')
                  : t('music.repeatOne')
                }
              >{music.repeatMode === 'one' ? '🔂' : '🔁'}</button>
            </div>

            <div className={css.miniProgress}>
              <span className={css.miniTime}>{formatTime(music.progress)}</span>
              <div
                className={css.miniProgressBar}
                onMouseDown={handleProgressMouseDown}
                style={{
                  background: `linear-gradient(to right, var(--accent, #6c8efb) 0%, var(--accent, #6c8efb) ${progressPct}%, rgba(255,255,255,0.18) ${progressPct}%, rgba(255,255,255,0.18) 100%)`,
                }}
              >
                {/* Rond de position — suit la progression, cliquable/draggable via le parent */}
                <div className={css.miniProgressThumb} style={{ left: `${progressPct}%` }} />
              </div>
              <span className={css.miniTime}>{formatTime(music.duration)}</span>
            </div>

            <div className={css.miniVolume}>
              <span className={css.miniVolumeIcon}>{music.volume === 0 ? '🔇' : music.volume < 0.5 ? '🔉' : '🔊'}</span>
              <div
                ref={volumeBarRef}
                className={css.miniVolumeBar}
                onMouseDown={handleVolumeMouseDown}
                title={t('music.volumeLabel', { pct: Math.round(music.volume * 100) })}
                style={{
                  background: `linear-gradient(to right, var(--accent, #6c8efb) 0%, var(--accent, #6c8efb) ${volPct}%, rgba(255,255,255,0.22) ${volPct}%, rgba(255,255,255,0.22) 100%)`,
                }}
              >
                <div className={css.miniVolumeThumb} style={{ left: `${volPct}%` }} />
              </div>
            </div>

            <button
              className={css.miniStopBtn}
              onClick={music.stop}
              title={t('music.stop')}
            >✕</button>
          </div>
        )}
      </main>

      <UpdateBanner u={updater} />
      <Toasts />
    </div>
  );
}
