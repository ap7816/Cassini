import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import logo from "../../assets/ArcHive_logo.png";

const navItems = [
  { to: "/library", label: "Library" },
  { to: "/launchers", label: "Launchers" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  const { pathname } = useLocation();

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 900;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = "matches" in e ? e.matches : mq.matches;
      setIsMobile(matches);
      // si on repasse desktop, on garde la sidebar visible “normalement”
      if (!matches) setSidebarOpen(false);
    };

    // init
    onChange(mq);

    // subscribe
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange as any);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange as any);
    };
  }, []);

  // Ferme la sidebar mobile quand on navigue
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [pathname, isMobile]);

  // Ferme sur Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  const pageTitle = useMemo(() => {
    const match = navItems.find((x) => pathname === x.to || pathname.startsWith(x.to + "/"));
    return match?.label ?? "ArcHive";
  }, [pathname]);

  return (
    <div style={styles.shell}>
      {/* Backdrop (mobile) */}
      {isMobile && sidebarOpen && (
        <div
          style={styles.backdrop}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        style={{
          ...styles.sidebar,
          ...(isMobile ? styles.sidebarMobile : styles.sidebarDesktop),
          ...(isMobile && (sidebarOpen ? styles.sidebarMobileOpen : styles.sidebarMobileClosed)),
        }}
      >
        <div style={styles.brand}>
          <img
            src={logo}
            alt="ArcHive logo"
            style={{ width: 128, height: 128, marginBottom: 8 }}
          />
          <div style={styles.brandTitle}>ArcHive</div>
          <div style={styles.brandSubtitle}>Game Hub</div>
        </div>

        <nav style={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.muted}>v0.1 (dev)</div>
        </div>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            {isMobile && (
              <button
                type="button"
                style={styles.burger}
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
                title="Menu"
              >
                ☰
              </button>
            )}
            <div style={styles.headerTitle}>{pageTitle}</div>
          </div>

          <input
            style={styles.search}
            placeholder="Search games..."
            disabled
            aria-label="Search"
          />
        </header>

        <section style={styles.content}>
          <Outlet />
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
  },

  /* Sidebar */
  sidebar: {
    display: "flex",
    flexDirection: "column",
    padding: 16,
    gap: 16,
    boxSizing: "border-box",
    background: "rgba(15, 20, 26, 1)", // évite transparence chelou en overlay
  },
  sidebarDesktop: {
    width: 260,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    position: "relative",
  },

  sidebarMobile: {
    width: 260,
    position: "fixed",
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    borderRight: "1px solid rgba(255,255,255,0.10)",
    transition: "transform 160ms ease",
  },
  sidebarMobileOpen: {
    transform: "translateX(0)",
  },
  sidebarMobileClosed: {
    transform: "translateX(-110%)",
  },

  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 40,
  },

  brand: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
  },
  brandTitle: { fontSize: 18, fontWeight: 700, marginTop: 4 },
  brandSubtitle: { fontSize: 12, opacity: 0.7, marginTop: 2 },

  nav: { display: "flex", flexDirection: "column", gap: 8 },
  navItem: {
    textDecoration: "none",
    color: "inherit",
    padding: "10px 12px",
    borderRadius: 10,
    background: "transparent",
    border: "1px solid transparent",
  },
  navItemActive: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
  },
  sidebarFooter: { marginTop: "auto", paddingTop: 8 },
  muted: { fontSize: 12, opacity: 0.65 },

  /* Main */
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },

  header: {
    padding: 16,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    boxSizing: "border-box",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  burger: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    cursor: "pointer",
  },

  search: {
    width: "min(520px, 55vw)",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    outline: "none",
  },

  content: { padding: 16, overflow: "auto", minWidth: 0 },
};
