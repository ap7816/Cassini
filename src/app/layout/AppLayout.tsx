import { NavLink, Outlet } from "react-router-dom";
import logo from "../../assets/ArcHive_logo.png";
import css from "./AppLayout.module.css";
import { useAppLayout, type NavItem } from "./useAppLayout";

const navItems: NavItem[] = [
  { to: "/library", label: "Library" },
  { to: "/launchers", label: "Launchers" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  const { isMobile, sidebarOpen, pageTitle, openSidebar, closeSidebar } = useAppLayout(navItems, 900);

  const sidebarClassName = [
    css.sidebar,
    isMobile ? css.sidebarMobile : css.sidebarDesktop,
    isMobile ? (sidebarOpen ? css.sidebarMobileOpen : css.sidebarMobileClosed) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={css.shell}>
      {isMobile && sidebarOpen && (
        <div className={css.backdrop} onClick={closeSidebar} aria-hidden="true" />
      )}

      <aside className={sidebarClassName}>
        <div className={css.brand}>
          <img src={logo} alt="ArcHive logo" className={css.logo} />
          <div className={css.brandSubtitle}>Game Hub</div>
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
          <div className={css.muted}>v0.1 (dev)</div>
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
                aria-label="Open menu"
                title="Menu"
              >
                <span className={css.burgerIcon} aria-hidden="true">☰</span>
              </button>
            )}
            <div className={css.headerTitle}>{pageTitle}</div>
          </div>

          <input
            className={css.search}
            placeholder="Search games..."
            disabled
            aria-label="Search"
          />
        </header>

        <section className={css.content}>
          <Outlet />
        </section>
      </main>
    </div>
  );
}
