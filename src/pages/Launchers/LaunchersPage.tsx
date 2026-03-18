import { useEffect, useState } from 'react';
import css from './LaunchersPage.module.css';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import {
  getCachedLauncherIconsById,
  pruneLauncherIconCache,
  storeLauncherIcons,
} from '../../features/launchers/services/launcherIconCache';

import {
  warn,
  debug,
  trace,
  info,
  error,
  attachConsole,
  attachLogger,
} from '@tauri-apps/plugin-log';

type LauncherDto = {
  id: string;
  name: string;
  installed: boolean;
  launchTarget: string; // steam://... ou chemin exe
  iconPath?: string | null; // chemin exe (pour extraire l'icône Windows)
};

type OpenStatus = 'idle' | 'opening' | 'done' | 'error';

function isUrlTarget(target: string): boolean {
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

  // Opening UI state (par carte)
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openStatus, setOpenStatus] = useState<OpenStatus>('idle');

  // Icons (dataUrl) par launcher id (pour l'UI)
  const [iconsById, setIconsById] = useState<Record<string, string>>({});

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

  // Load icons with local cache (desktop only)
  useEffect(() => {
    if (!desktop) return;

    // 0) prune cache
    pruneLauncherIconCache();

    if (launchers.length === 0) {
      setIconsById({});
      return;
    }

    let cancelled = false;

    void (async () => {
      // 1) cache hits
      const { byId: cachedById, missing } = getCachedLauncherIconsById(
        launchers.map((l) => ({ id: l.id, iconPath: l.iconPath })),
      );

      if (!cancelled) setIconsById(cachedById);

      // 2) fetch missing
      if (missing.length === 0) return;

      const fetched: Array<{ id: string; iconPath: string; dataUrl: string }> = [];

      await Promise.all(
        missing.map(async (m) => {
          try {
            const dataUrl = await invoke<string>('get_file_icon_data_url', { path: m.iconPath });
            fetched.push({ id: m.id, iconPath: m.iconPath, dataUrl });
          } catch {
            // ignore failures -> fallback letter
          }
        }),
      );

      if (fetched.length === 0) return;

      // 3) store batch in cache
      storeLauncherIcons(fetched.map((f) => ({ iconPath: f.iconPath, dataUrl: f.dataUrl })));

      // 4) update UI
      if (cancelled) return;
      setIconsById((prev) => {
        const next = { ...prev };
        for (const f of fetched) next[f.id] = f.dataUrl;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [launchers, desktop]);

  async function handleOpen(l: LauncherDto) {
    setOpeningId(l.id);
    setOpenStatus('opening');

    try {
      await openTarget(l.launchTarget);
      setOpenStatus('done');

      window.setTimeout(() => {
        setOpenStatus('idle');
        setOpeningId(null);
      }, 900);
    } catch (e) {
      setOpenStatus('error');
      const msg = e instanceof Error ? e.message : 'Failed to open launcher.';
      window.setTimeout(() => {
        setOpenStatus('idle');
        setOpeningId(null);
      }, 1200);
      window.alert(msg);
    }
  }

  async function OpenFolder(l: LauncherDto) {
    const path = l.iconPath ?? l.launchTarget;
    const folderPath = path.includes('\\') ? path.substring(0, path.lastIndexOf('\\')) : path;
    info(`Opening folder for path: ${folderPath}`);
    await invoke('open_folder', { path: folderPath });
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
          <div className={css.emptyText}>Install launchers then click Refresh.</div>
        </div>
      ) : (
        <div className={css.grid}>
          {launchers.map((l) => {
            const isThisOpening = openingId === l.id && openStatus !== 'idle';
            const disabled = !l.installed || loading || (openingId !== null && openingId !== l.id);

            const icon = iconsById[l.id] ?? null;

            return (
              <section key={l.id} className={css.card} aria-label={`${l.name} launcher`}>
                <div className={css.cardTop}>
                  <div className={css.cardTitleRow}>
                    <div className={css.iconWrap} aria-hidden="true">
                      {icon ? (
                        <img className={css.iconImg} src={icon} alt="" draggable={false} />
                      ) : (
                        <div className={css.iconFallback}>{l.name.slice(0, 1).toUpperCase()}</div>
                      )}
                    </div>

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
                    disabled={disabled}
                    title={!l.installed ? 'Not installed' : 'Open'}
                  >
                    {isThisOpening && openStatus === 'opening' ? 'Opening…' : 'Open'}
                  </button>
                  <button
                    type="button"
                    className={css.primaryButton}
                    onClick={() => OpenFolder(l)}
                    disabled={disabled}
                    title={!l.installed ? 'Not installed' : 'Open Folder'}
                  >
                    {isThisOpening && openStatus === 'opening' ? 'Opening…' : 'Open'}
                  </button>{' '}
                </div>

                {isThisOpening && (
                  <div className={css.opening}>
                    <div className={css.openingLabel}>
                      {openStatus === 'opening'
                        ? 'Opening launcher…'
                        : openStatus === 'done'
                          ? 'Launcher opened'
                          : 'Failed to open'}
                    </div>

                    <div
                      className={[
                        css.progressTrack,
                        openStatus === 'opening'
                          ? css.progressIndeterminate
                          : openStatus === 'done'
                            ? css.progressDone
                            : css.progressError,
                      ].join(' ')}
                    >
                      <div className={css.progressFill} />
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
