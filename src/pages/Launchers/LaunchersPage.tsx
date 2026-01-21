import { useEffect, useState } from 'react';
import css from './LaunchersPage.module.css';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';

type LauncherDto = {
  id: string;
  name: string;
  installed: boolean;
  launchTarget: string; // steam://... ou chemin exe
};

function isUrlTarget(target: string): boolean {
  // steam://..., https://..., etc.
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(target);
}

async function openTarget(target: string): Promise<void> {
  if (isUrlTarget(target)) {
    await openUrl(target);
  } else {
    await openPath(target);
  }
}

export function LaunchersPage() {
  const [desktop, setDesktop] = useState(false);
  const [launchers, setLaunchers] = useState<LauncherDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      const res = await invoke<LauncherDto[]>('scan_launchers');
      setLaunchers(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to scan launchers.';
      setError(msg);
      setLaunchers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ok = isTauri();
    setDesktop(ok);
    if (ok) void refresh();
  }, []);

  async function handleOpen(l: LauncherDto) {
    try {
      await openTarget(l.launchTarget);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to open launcher.';
      window.alert(msg);
    }
  }

  const isEmpty = !loading && launchers.length === 0;

  return (
    <div className={css.page}>
      <div className={css.header}>
        <div>
          <h1 className={css.title}>Launchers</h1>
          <p className={css.subtitle}>
            {loading ? 'Scanning installed launchers…' : 'Detected launchers on this PC.'}
          </p>
        </div>

        <div className={css.headerActions}>
          <button
            type="button"
            className={css.button}
            onClick={refresh}
            disabled={loading || !desktop}
            title={!desktop ? 'Desktop only' : 'Refresh'}
          >
            Refresh
          </button>
        </div>
      </div>

      {!desktop && (
        <div className={css.note}>
          Desktop only: launcher detection works in the Tauri app (not in the web preview).
        </div>
      )}

      {error && <div className={css.error}>{error}</div>}

      {isEmpty ? (
        <div className={css.empty}>
          <div className={css.emptyTitle}>No launchers detected</div>
          <div className={css.emptyText}>Install Steam/Epic then click Refresh.</div>
        </div>
      ) : (
        <div className={css.grid}>
          {launchers.map((l) => (
            <section key={l.id} className={css.card} aria-label={`${l.name} launcher`}>
              <div className={css.cardTop}>
                <div className={css.cardTitleRow}>
                  <div className={css.badge}>{l.name}</div>
                  <div className={css.cardTitle}>{l.name}</div>
                </div>
                <div className={css.cardSubtitle}>
                  {l.installed ? 'Installed' : 'Not installed'}
                </div>
              </div>

              <div className={css.cardActions}>
                <button
                  type="button"
                  className={css.primaryButton}
                  onClick={() => handleOpen(l)}
                  disabled={!l.installed || loading}
                  title={!l.installed ? 'Not installed' : 'Open'}
                >
                  Open
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
