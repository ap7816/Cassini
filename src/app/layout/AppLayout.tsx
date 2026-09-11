import { NavLink, Outlet, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useRef, useEffect, useState } from 'react';
import logo from '../../assets/logo.svg';
import css from './AppLayout.module.css';
import { useAppLayout } from './useAppLayout';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useUpdater } from '../../features/updater/useUpdater';
import { useMusicPlayer } from '../../features/music/MusicContext';
import { initAmbient, suspendAmbient, resumeAmbient } from '../../features/ambient/ambientPlayer';
import { MusicVisualizer } from '../../features/music/MusicVisualizer';
import { Toasts } from '../../features/toast/Toasts';
import { MiniPlayer } from './MiniPlayer';
import { UpdateBanner } from './UpdateBanner';
import { SolarButton } from './SolarButton';
import { readNavCollapsed, writeNavCollapsed } from '../../services/storage';
import { scannerTousLesLaunchers } from '../../features/library/services/libraryScan';

/**
 * Panneau de débogage — développement seulement.
 *
 * `import.meta.env.DEV` est remplacé par `false` à la compilation de
 * production. La branche devient morte, le bundler l'élimine, et l'import
 * dynamique disparaît avec elle : le module du panneau n'est même pas émis.
 * Ce n'est pas un contrôle à l'exécution qu'on pourrait contourner — il n'y a
 * tout simplement rien à trouver dans la version publiée.
 */
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('../../features/debug/DebugPanel').then((m) => ({ default: m.DebugPanel })))
  : null;

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

  // Repli du panneau de navigation, sur écran large uniquement : en dessous de
  // 900 px il est déjà escamotable par le bouton hamburger, et deux mécanismes
  // concurrents pour le même panneau se contrediraient.
  //
  // Le choix est retenu d'une session à l'autre : c'est une préférence de
  // place à l'écran, pas un état de navigation.
  const [navReplie, setNavReplie] = useState(readNavCollapsed);

  function basculerNav() {
    setNavReplie((v) => {
      writeNavCollapsed(!v);
      return !v;
    });
  }

  const sidebarClassName = [
    css.sidebar,
    isMobile ? css.sidebarMobile : css.sidebarDesktop,
    isMobile ? (sidebarOpen ? css.sidebarMobileOpen : css.sidebarMobileClosed) : '',
    !isMobile && navReplie ? css.sidebarCollapsed : '',
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

  // Détecte les jeux installés, une fois par lancement.
  //
  // Le scan ne vivait que derrière le bouton « Actualiser » de la page
  // Bibliothèque : un jeu fraîchement installé n'apparaissait nulle part tant
  // qu'on n'y était pas passé — et depuis que l'application s'ouvre sur le
  // système solaire, on peut ne jamais y passer.
  //
  // Ici plutôt que dans une page : la coque est le seul endroit monté quelle
  // que soit la route. Rien n'attend le résultat, l'affichage se met à jour de
  // lui-même quand la bibliothèque change (voir subscribeGames).
  useEffect(() => {
    if (!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return;
    void scannerTousLesLaunchers().then((r) => {
      if (r.modifiee) {
        console.info(
          `[bibliothèque] scan de démarrage : ${r.ajoutes} jeu(x) découvert(s)`
          + (r.echecs.length > 0 ? `, non détectés : ${r.echecs.join(', ')}` : ''),
        );
      }
    });
  }, []);

  // Music player
  const music = useMusicPlayer();

  // Coupe l'ambiance quand une musique joue, la reprend quand elle s'arrête
  useEffect(() => {
    if (music.isPlaying) {
      suspendAmbient('music');
    } else {
      resumeAmbient('music');
    }
  }, [music.isPlaying]);

  // Coupe l'ambiance quand la fenêtre quitte l'écran.
  //
  // `visibilitychange` couvre les deux façons de la faire disparaître : réduite
  // dans la barre des tâches, ou repliée dans la zone de notification quand
  // « continuer en arrière-plan » est actif.
  useEffect(() => {
    const appliquer = () => {
      if (document.visibilityState === 'hidden') suspendAmbient('window');
      else resumeAmbient('window');
    };
    document.addEventListener('visibilitychange', appliquer);
    // Au montage : la fenêtre peut déjà être masquée, si l'application a été
    // lancée réduite ou démarrée avec la session.
    appliquer();
    return () => document.removeEventListener('visibilitychange', appliquer);
  }, []);

  // Filet côté fenêtre native.
  //
  // WebView2 ne signale pas toujours la réduction par `visibilitychange` : cela
  // dépend de sa version et de la façon dont Windows occulte la fenêtre. On
  // interroge donc aussi l'état réel de la fenêtre, à la fin de chaque salve de
  // redimensionnement — pas à chaque événement, qui en émet des dizaines
  // pendant un glissement de bordure et coûterait autant d'allers-retours.
  useEffect(() => {
    if (!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return;
    let unlisten: (() => void) | undefined;
    let mounted = true;
    let differe: ReturnType<typeof setTimeout> | undefined;

    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      if (!mounted) return;
      const fenetre = getCurrentWindow();
      fenetre
        .onResized(() => {
          if (differe) clearTimeout(differe);
          differe = setTimeout(() => {
            void fenetre.isMinimized().then((reduite) => {
              if (!mounted) return;
              if (reduite) suspendAmbient('window');
              else resumeAmbient('window');
            });
          }, 150);
        })
        .then((fn) => {
          if (!mounted) { fn(); return; }
          unlisten = fn;
        });
    });

    return () => {
      mounted = false;
      if (differe) clearTimeout(differe);
      unlisten?.();
    };
  }, []);
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

      {!isMobile && (
        <button
          type="button"
          className={css.navToggle}
          onClick={basculerNav}
          aria-expanded={!navReplie}
          title={navReplie ? t('nav.expandMenu') : t('nav.collapseMenu')}
          aria-label={navReplie ? t('nav.expandMenu') : t('nav.collapseMenu')}
        >
          <svg
            className={[css.navToggleIcon, navReplie ? css.navToggleIconFlipped : '']
              .filter(Boolean).join(' ')}
            width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true"
          >
            <path
              d="M8.5 2L2 9l6.5 7"
              stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <aside className={sidebarClassName} aria-hidden={!isMobile && navReplie}>
        <div className={css.brand}>
          <img src={logo} alt="Cassini logo" className={css.logo} />
          <div className={css.brandSubtitle}>{t('nav.brandName')}</div>
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

      {/* Champ d'étoiles de fond — retiré sur le système solaire, qui le
          recouvre entièrement de son propre fond opaque. Il continuait sinon
          d'effacer et de redessiner une canvas plein écran à chaque image,
          mesuré à 0,6 ms, pour un résultat que personne ne voit — sans compter
          la composition d'un calque plein écran qui change à chaque frame. */}
      {location.pathname !== '/solar' && <MusicVisualizer />}
      <UpdateBanner u={updater} />
      <Toasts />
      {DebugPanel && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
    </div>
  );
}
