import { useEffect, useMemo, useState } from "react";
import logo from "../assets/ArcHive_logo.png";

export default function AppShell() {
  const [active, setActive] = useState("library");
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 900;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (e) => setCollapsed(e.matches);

    // init + subscribe
    setCollapsed(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const pageTitle = useMemo(() => {
    if (active === "library") return "Library";
    if (active === "launchers") return "Launchers";
    return "Settings";
  }, [active]);

  return (
    <div style={styles.shell}>
      <aside style={{ ...styles.sidebar, width: collapsed ? 84 : 260 }}>
        <div style={styles.brand}>
          <img src={logo} alt="ArcHive logo" style={styles.logo} />
          {!collapsed && (
            <>
              <div style={styles.brandTitle}>ArcHive</div>
              <div style={styles.brandSubtitle}>Game Hub</div>
            </>
          )}
        </div>

        <nav style={styles.nav}>
          <SideItem
            icon="📚"
            label="Library"
            collapsed={collapsed}
            active={active === "library"}
            onClick={() => setActive("library")}
          />
          <SideItem
            icon="🚀"
            label="Launchers"
            collapsed={collapsed}
            active={active === "launchers"}
            onClick={() => setActive("launchers")}
          />
          <SideItem
            icon="⚙️"
            label="Settings"
            collapsed={collapsed}
            active={active === "settings"}
            onClick={() => setActive("settings")}
          />
        </nav>
      </aside>

      <div style={styles.content}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              style={styles.burger}
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              ☰
            </button>
            <div style={styles.headerTitle}>{pageTitle}</div>
          </div>

          <input
            placeholder="Search..."
            style={styles.search}
            // Tu peux le laisser inactif si tu veux :
            // disabled
          />
        </header>

        <main style={styles.main}>
          {active === "library" && <LibraryPage />}
          {active === "launchers" && <LaunchersPage />}
          {active === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}

function SideItem({ icon, label, collapsed, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.sideItem,
        ...(active ? styles.sideItemActive : null),
        justifyContent: collapsed ? "center" : "flex-start",
      }}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      <span style={styles.sideIcon}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function LibraryPage() {
  return (
    <section style={styles.card}>
      <div style={styles.cardTitle}>📚 Library</div>
      <div style={styles.cardText}>Placeholder de la page Library.</div>
    </section>
  );
}

function LaunchersPage() {
  return (
    <section style={styles.card}>
      <div style={styles.cardTitle}>🚀 Launchers</div>
      <div style={styles.cardText}>Placeholder de la page Launchers.</div>
    </section>
  );
}

function SettingsPage() {
  return (
    <section style={styles.card}>
      <div style={styles.cardTitle}>⚙️ Settings</div>
      <div style={styles.cardText}>Placeholder de la page Settings.</div>
    </section>
  );
}

const styles = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "#0b0f14",
    color: "#e6edf3",
  },

  sidebar: {
    padding: 16,
    borderRight: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    transition: "width 160ms ease",
    boxSizing: "border-box",
  },

  brand: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  },
  logo: { width: 32, height: 32, marginBottom: 6 },
  brandTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.1 },
  brandSubtitle: { fontSize: 12, opacity: 0.7 },

  nav: { display: "flex", flexDirection: "column", gap: 8 },

  sideItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 12,
    background: "transparent",
    color: "inherit",
    border: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
    userSelect: "none",
  },
  sideItemActive: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.16)",
  },
  sideIcon: { width: 18, display: "inline-flex", justifyContent: "center" },

  content: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },

  header: {
    height: 64,
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    boxSizing: "border-box",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12, minWidth: 0 },
  headerTitle: { fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  burger: {
    width: 40,
    height: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    cursor: "pointer",
  },

  search: {
    width: "min(420px, 55vw)",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    outline: "none",
  },

  main: { padding: 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },

  card: {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  },
  cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  cardText: { opacity: 0.85, lineHeight: 1.5 },
};
