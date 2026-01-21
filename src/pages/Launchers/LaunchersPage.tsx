import { useEffect, useState } from 'react';
import css from './LaunchersPage.module.css';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';

type LauncherDto = {
  id: string;
  name: string;
  installed: boolean;
  launchTarget: string; // steam://... ou chemin exe
  iconPath?: string | null; // chemin exe (pour extraire l'icône Windows)
};

type OpenStatus = 'idle' | 'opening' | 'done' | 'error';

/** -------- Local cache (localStorage) -------- */
type IconCacheEntry = { dataUrl: string; updatedAt: number };
type IconCache = Record<string, IconCacheEntry>; // key = iconPath

const ICON_CACHE_KEY = 'arctive.launcherIcons.v1';
const ICON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function readIconCache(): IconCache {
  try {
    const raw = window.localStorage.getItem(ICON_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IconCache;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeIconCache(cache: IconCache): void {
  try {
    window.localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore (quota / disabled)
  }
}

function pruneIconCache(cache: IconCache): IconCache {
  const now = Date.now();
  const next: IconCache = {};
  for (const [k, v] of Object.entries(cache)) {
    if (!v || typeof v !== 'object') continue;
    if (typeof v.dataUrl !== 'string') continue;
    if (typeof v.updatedAt !== 'number') continue;
    if (now - v.updatedAt > ICON_CACHE_TTL_MS) continue;
    next[k] = v;
  }
  return next;
}

/** -------- Utils -------- */
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
    if (launchers.length === 0) {
      setIconsById({});
      return;
    }

    let cancelled = false;

    void (async () => {
      // 1) load + prune cache
      let cache = pruneIconCache(readIconCache());
      writeIconCache(cache);

      // 2) build immediate UI map from cache
      const immediateById: Record<string, string> = {};
      const toFetch: Array<{ id: string; iconPath: string }> = [];

      for (const l of launchers) {
        const iconPath = l.iconPath ?? null;
        if (!iconPath) continue;

        const hit = cache[iconPath];
        if (hit?.dataUrl) {
          immediateById[l.id] = hit.dataUrl;
        } else {
          toFetch.push({ id: l.id, iconPath });
        }
      }

      if (!cancelled) setIconsById(immediateById);

      // 3) fetch missing icons, update cache once
      if (toFetch.length === 0) return;

      const now = Date.now();
      const fetched: Array<{ id: string; iconPath: string; dataUrl: string }> = [];

      await Promise.all(
        toFetch.map(async (x) => {
          try {
            const dataUrl = await invoke<string>('get_file_icon_data_url', { path: x.iconPath });
            fetched.push({ id: x.id, iconPath: x.iconPath, dataUrl });
          } catch {
            // ignore failures -> fallback letter
          }
        })
      );

      if (fetched.length === 0) return;

      // update cache
      for (const f of fetched) {
        cache[f.iconPath] = { dataUrl: f.dataUrl, updatedAt: now };
      }
      cache = pruneIconCache(cache);
      writeIconCache(cache);

      // update UI state
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
