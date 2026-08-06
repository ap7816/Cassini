import { NavLink, Outlet, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect } from 'react';
import logo from '../../assets/logo.svg';
import css from './AppLayout.module.css';
import { useAppLayout } from './useAppLayout';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useUpdater } from '../../features/updater/useUpdater';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { initAmbient, pauseAmbientForMusic, resumeAmbientAfterMusic } from '../../features/ambient/ambientPlayer';
import { MusicVisualizer } from '../../features/music/MusicVisualizer';
import { Toasts } from '../../features/toast/Toasts';
import { MiniPlayer } from './MiniPlayer';
import { UpdateBanner } from './UpdateBanner';
import { SolarButton } from './SolarButton';

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
  }, []);

  // Démarre la musique d'ambiance une seule fois après le premier rendu
  useEffect(() => { initAmbient(); }, []);

  // Music player
  const music = useMusicPlayer();

  // Coupe l'ambiance quand une musique joue, la reprend quand elle s'arrête
  useEffect(() => {
    if (music.isPlaying) {
      pauseAmbientForMusic();
    } else {
      resumeAmbientAfterMusic();
    }
  }, [music.isPlaying]);
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

        <SolarButton active={location.pathname === '/solar'} />

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

        <MiniPlayer />
      </main>

      <MusicVisualizer />
      <UpdateBanner u={updater} />
      <Toasts />
    </div>
  );
}
