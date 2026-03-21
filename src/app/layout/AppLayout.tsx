import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logo from '../../assets/favicon.png';
import css from './AppLayout.module.css';
import { useAppLayout } from './useAppLayout';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useUpdater } from '../../features/updater/useUpdater';

export function AppLayout() {
  const { t } = useTranslation();

  const navItems = [
    { to: '/library', label: t('nav.library') },
    { to: '/launchers', label: t('nav.launchers') },
    { to: '/settings', label: t('nav.settings') },
  ];

  const { isMobile, sidebarOpen, pageTitle, openSidebar, closeSidebar } = useAppLayout(
    navItems,
    900,
  );

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
  ]
    .filter(Boolean)
    .join(' ');

  const { settings } = useAppSettings();
  useUpdater();

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
          <div className={css.muted}>v0.8.4</div>
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
                <span className={css.burgerIcon} aria-hidden="true">
                  ☰
                </span>
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
      </main>
    </div>
  );
}
