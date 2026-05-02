import { NavLink, Outlet, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect } from 'react';
import logo from '../../assets/favicon.png';
import css from './AppLayout.module.css';
import { useAppLayout } from './useAppLayout';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useUpdater, type UpdaterState } from '../../features/updater/useUpdater';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { useSingleMeta } from '../../features/music/useTrackMeta';
import { Toasts } from '../../features/toast/Toasts';

/* ─── Update banner ──────────────────────────────────────────── */
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
    { to: '/game', label: t('nav.game') },
    { to: '/settings', label: t('nav.settings') },
  ];

  const { isMobile, sidebarOpen, pageTitle, openSidebar, closeSidebar } = useAppLayout(navItems, 900);
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
  // useUpdater moved to top of component

  // Minimize to tray instead of closing when runInBackground is enabled
  useEffect(() => {
    if (!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (settings.runInBackground) {
            event.preventDefault();
            await getCurrentWindow().hide();
          }
        })
        .then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [settings.runInBackground]);

  // Music player
  const music = useMusicPlayer();
  const progressPct = music.duration > 0 ? (music.progress / music.duration) * 100 : 0;
  const currentTrack = music.currentIndex >= 0 ? music.tracks[music.currentIndex] : null;
  const miniMeta = useSingleMeta(currentTrack?.path ?? null);
  const volPct = music.volume * 100;

  const volumeBarRef = useRef<HTMLDivElement>(null);

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    music.seekTo((e.clientX - rect.left) / rect.width);
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
          <Outlet />
        </section>

        {/* Persistent mini-player */}
        {currentTrack && (
          <div className={css.miniPlayer}>
            <div className={css.miniTrackInfo}>
              {miniMeta?.coverDataUrl
                ? <img src={miniMeta.coverDataUrl} className={css.miniArt} alt="" aria-hidden="true" />
                : <div className={css.miniArtPlaceholder}>♪</div>
              }
              <button
                className={css.miniTitle}
                title={currentTrack.title}
                onClick={() => {
                  const folder = music.tracks[music.currentIndex]?.folder;
                  const params = folder ? `?navTo=${encodeURIComponent(folder)}` : '';
                  navigate('/music' + params);
                }}
              >
                <span className={css.miniTitleText}>{currentTrack.title}</span>
                {miniMeta?.artist && <span className={css.miniArtist}>{miniMeta.artist}</span>}
              </button>
            </div>

            <div className={css.miniControls}>
              <button
                className={css.miniBtn}
                onClick={music.prevTrack}
                disabled={music.currentIndex <= 0}
                title="Précédent"
              >⏮</button>
              <button
                className={`${css.miniBtn} ${css.miniPlayBtn}`}
                onClick={music.togglePlayPause}
                title={music.isPlaying ? 'Pause' : 'Lecture'}
              >{music.isPlaying ? '⏸' : '▶'}</button>
              <button
                className={css.miniBtn}
                onClick={music.nextTrack}
                disabled={music.currentIndex >= music.tracks.length - 1}
                title="Suivant"
              >⏭</button>
            </div>

            <div className={css.miniProgress}>
              <span className={css.miniTime}>{formatTime(music.progress)}</span>
              <div
                className={css.miniProgressBar}
                onClick={handleProgressClick}
                style={{
                  background: `linear-gradient(to right, var(--accent, #6c8efb) 0%, var(--accent, #6c8efb) ${progressPct}%, rgba(255,255,255,0.18) ${progressPct}%, rgba(255,255,255,0.18) 100%)`,
                }}
              />
              <span className={css.miniTime}>{formatTime(music.duration)}</span>
            </div>

            <div className={css.miniVolume}>
              <span className={css.miniVolumeIcon}>{music.volume === 0 ? '🔇' : music.volume < 0.5 ? '🔉' : '🔊'}</span>
              <div
                ref={volumeBarRef}
                className={css.miniVolumeBar}
                onMouseDown={handleVolumeMouseDown}
                title={`Volume : ${Math.round(music.volume * 100)}%`}
                style={{
                  background: `linear-gradient(to right, var(--accent, #6c8efb) 0%, var(--accent, #6c8efb) ${volPct}%, rgba(255,255,255,0.22) ${volPct}%, rgba(255,255,255,0.22) 100%)`,
                }}
              />
            </div>

            <button
              className={css.miniStopBtn}
              onClick={music.stop}
              title="Arrêter la musique"
            >✕</button>
          </div>
        )}
      </main>

      <UpdateBanner u={updater} />
      <Toasts />
    </div>
  );
}
