import { NavLink, Outlet } from "react-router-dom";
import logo from "../../assets/ArcHive_logo.png"

const navItems = [
  { to: "/library", label: "Library" },
  { to: "/launchers", label: "Launchers" },
  { to: "/settings", label: "Settings" },
];

export function AppLayout() {
  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
      <div style={styles.brand}>
        <img
          src={logo}
          alt="ArcHive logo"
          style={{ width: 128, height: 128, marginBottom: 8 }}
        />
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

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    height: "100vh",
    overflow: "hidden",
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    padding: 16,
    gap: 16,
  },
  brand: {
    padding: 12,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
  },
  brandTitle: { fontSize: 18, fontWeight: 700 },
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
  main: { display: "flex", flexDirection: "column", minWidth: 0 },
  header: {
    padding: 16,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  search: {
    width: "min(520px, 100%)",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    outline: "none",
  },
  content: { padding: 16, overflow: "auto" },
};
