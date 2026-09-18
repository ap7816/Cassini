import { Outlet, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useRef, useEffect } from 'react';
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
import { listen } from '@tauri-apps/api/event';
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

  const { pageTitle } = useAppLayout(navItems);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';

  function handleSearchChange(nextValue: string) {
    const next = new URLSearchParams(searchParams);
    const trimmed = nextValue.trim();
    if (!trimmed) next.delete('q');
    else next.set('q', nextValue);
    setSearchParams(next, { replace: true });
  }

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

    const scanner = (raison: string) =>
      void scannerTousLesLaunchers().then((r) => {
        if (r.modifiee) {
          console.info(
            `[bibliothèque] ${raison} : ${r.ajoutes} jeu(x) découvert(s)`
            + (r.echecs.length > 0 ? `, non détectés : ${r.echecs.join(', ')}` : ''),
          );
        }
      });

    scanner('scan de démarrage');

    // Et à chaque retour sur l'application.
    //
    // Ce qui change la bibliothèque se passe ailleurs : on installe un jeu
    // depuis Steam, on en désinstalle un par son désinstalleur — que Cassini
    // lance sans jamais savoir quand il a fini. Le moment où l'utilisateur
    // revient est justement celui où il s'attend à voir l'état à jour.
    //
    // Un délai de garde évite de relancer sept scans à chaque aller-retour
    // entre deux fenêtres ; le scan n'écrit de toute façon rien si la
    // bibliothèque n'a pas changé.
    const GARDE = 20_000;
    let dernier = Date.now();
    const auRetour = () => {
      if (Date.now() - dernier < GARDE) return;
      dernier = Date.now();
      scanner('retour sur l’application');
    };

    // Deux signaux, deux conditions. Un focus de fenêtre dit à lui seul qu'on
    // est revenu ; un changement de visibilité, non — il se déclenche aussi
    // quand on part. Consulter `visibilityState` dans les deux cas revenait à
    // ne rien faire là où l'hôte dit la fenêtre masquée alors qu'elle a le
    // focus, ce qui arrive dans certains conteneurs.
    const auChangementDeVisibilite = () => {
      if (document.visibilityState === 'visible') auRetour();
    };

    window.addEventListener('focus', auRetour);
    document.addEventListener('visibilitychange', auChangementDeVisibilite);

    // Et en temps réel : le côté Rust surveille les manifestes de Steam et
    // d'Epic et les clés « Uninstall » du registre (voir `watcher.rs`), et
    // prévient quand un jeu s'installe ou disparaît — même fenêtre ouverte.
    //
    // Le registre bouge aussi pour des logiciels qui ne sont pas des jeux :
    // pas plus d'un scan toutes les dix secondes, et le dernier signal d'une
    // rafale n'est jamais perdu — il part à la fin du délai.
    const ESPACEMENT = 10_000;
    let dernierVeille = 0;
    let differe: ReturnType<typeof setTimeout> | null = null;
    const surChangement = () => {
      if (differe) return;
      const attente = Math.max(0, dernierVeille + ESPACEMENT - Date.now());
      differe = setTimeout(() => {
        differe = null;
        dernierVeille = Date.now();
        dernier = dernierVeille;
        scanner('changement détecté');
      }, attente);
    };
    let fini = false;
    let arreterVeille: (() => void) | null = null;
    void listen('bibliotheque-changee', surChangement).then((stop) => {
      if (fini) stop();
      else arreterVeille = stop;
    });

    return () => {
      fini = true;
      arreterVeille?.();
      if (differe) clearTimeout(differe);
      window.removeEventListener('focus', auRetour);
      document.removeEventListener('visibilitychange', auChangementDeVisibilite);
    };
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
      <main className={css.main}>
        {/* Pas d'en-tête sur le système solaire : il n'y portait qu'un titre
            que la page dit déjà, et une recherche que la liste des jeux fait
            mieux. La vue récupère la hauteur.

            Ailleurs, il porte le retour : la barre des launchers, qui ramène
            partout ailleurs, vit dans le système solaire et n'existe pas ici. */}
        {location.pathname !== '/solar' && (
          <header className={css.header}>
            <div className={css.headerLeft}>
              <button
                type="button"
                className={css.retour}
                onClick={() => navigate('/solar')}
                aria-label={t('nav.solarSystem')}
                title={t('nav.solarSystem')}
              >
                <svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true">
                  <path
                    d="M8.5 2L2 9l6.5 7"
                    stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                </svg>
              </button>
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
        )}

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
