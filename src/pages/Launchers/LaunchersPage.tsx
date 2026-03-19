import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import css from './LaunchersPage.module.css';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import {
  getCachedLauncherIconsById,
  pruneLauncherIconCache,
  storeLauncherIcons,
} from '../../features/launchers/services/launcherIconCache';

import { info } from '@tauri-apps/plugin-log';

type LauncherDto = {
  id: string;
  name: string;
  installed: boolean;
  launchTarget: string;
  iconPath?: string | null;
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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const [desktop, setDesktop] = useState(false);
  const [launchers, setLaunchers] = useState<LauncherDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openStatus, setOpenStatus] = useState<OpenStatus>('idle');

  const [folderOpeningId, setFolderOpeningId] = useState<string | null>(null);
  const [folderStatus, setFolderStatus] = useState<OpenStatus>('idle');

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

  useEffect(() => {
    if (!desktop) return;

    pruneLauncherIconCache();

    if (launchers.length === 0) {
      setIconsById({});
      return;
    }

    let cancelled = false;

    void (async () => {
      const { byId: cachedById, missing } = getCachedLauncherIconsById(
        launchers.map((l) => ({ id: l.id, iconPath: l.iconPath })),
      );

      if (!cancelled) setIconsById(cachedById);

      if (missing.length === 0) return;

      const fetched: Array<{ id: string; iconPath: string; dataUrl: string }> = [];

      await Promise.all(
        missing.map(async (m) => {
          try {
            const dataUrl = await invoke<string>('get_file_icon_data_url', { path: m.iconPath });
            fetched.push({ id: m.id, iconPath: m.iconPath, dataUrl });
          } catch { /* ignore */ }
        }),
      );

      if (fetched.length === 0) return;

      storeLauncherIcons(fetched.map((f) => ({ iconPath: f.iconPath, dataUrl: f.dataUrl })));

      if (cancelled) return;
      setIconsById((prev) => {
        const next = { ...prev };
        for (const f of fetched) next[f.id] = f.dataUrl;
        return next;
      });
    })();

    return () => { cancelled = true; };
  }, [launchers, desktop]);

  async function handleOpen(l: LauncherDto) {
    setOpeningId(l.id);
    setOpenStatus('opening');

    try {
      await openTarget(l.launchTarget);
      setOpenStatus('done');
      window.setTimeout(() => { setOpenStatus('idle'); setOpeningId(null); }, 900);
    } catch (e) {
      setOpenStatus('error');
      const msg = e instanceof Error ? e.message : 'Failed to open launcher.';
      window.setTimeout(() => { setOpenStatus('idle'); setOpeningId(null); }, 1200);
      window.alert(msg);
    }
  }

  async function handleOpenFolder(l: LauncherDto) {
    setFolderOpeningId(l.id);
    setFolderStatus('opening');

    try {
      const path = l.iconPath ?? l.launchTarget;
      const folderPath = path.includes('\\') ? path.substring(0, path.lastIndexOf('\\')) : path;
      info(`Opening folder for path: ${folderPath}`);
      await invoke('open_folder', { path: folderPath });
      setFolderStatus('done');
      window.setTimeout(() => { setFolderStatus('idle'); setFolderOpeningId(null); }, 900);
    } catch (e) {
      setFolderStatus('error');
      const msg = e instanceof Error ? e.message : 'Failed to open folder.';
      window.setTimeout(() => { setFolderStatus('idle'); setFolderOpeningId(null); }, 1200);
      window.alert(msg);
    }
  }

  const filteredLaunchers = q
    ? launchers.filter((l) => l.name.toLowerCase().includes(q))
    : launchers;

  const isEmpty = !loading && launchers.length === 0;

  return (
    <div className={css.page}>
      <div className={css.header}>
        <div>
          <h1 className={css.title}>{t('launchers.title')}</h1>
          <p className={css.subtitle}>
            {loading ? t('launchers.subtitleScanning') : t('launchers.subtitleDetected')}
          </p>
        </div>

        <div className={css.headerActions}>
          <button
            type="button"
            className={css.button}
            onClick={refresh}
            disabled={loading || !desktop}
          >
            {t('launchers.refresh')}
          </button>
        </div>
      </div>

      {!desktop && <div className={css.note}>{t('launchers.desktopOnly')}</div>}

      {error && <div className={css.error}>{error}</div>}

      {isEmpty ? (
        <div className={css.empty}>
          <div className={css.emptyTitle}>{t('launchers.emptyTitle')}</div>
          <div className={css.emptyText}>{t('launchers.emptyText')}</div>
        </div>
      ) : (
        <div className={css.grid}>
          {filteredLaunchers.map((l) => {
            const isThisOpening = openingId === l.id && openStatus !== 'idle';
            const isFolderOpening = folderOpeningId === l.id && folderStatus !== 'idle';
            const disabled =
              !l.installed ||
              loading ||
              (openingId !== null && openingId !== l.id) ||
              (folderOpeningId !== null && folderOpeningId !== l.id);

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
                    {l.installed ? t('launchers.installed') : t('launchers.notInstalled')}
                  </div>
                </div>

                <div className={css.cardActions}>
                  <button
                    type="button"
                    className={css.primaryButton}
                    onClick={() => handleOpen(l)}
                    disabled={disabled}
                  >
                    {isThisOpening && openStatus === 'opening'
                      ? t('launchers.opening')
                      : t('launchers.open')}
                  </button>
                  <button
                    type="button"
                    className={css.primaryButton}
                    onClick={() => void handleOpenFolder(l)}
                    disabled={disabled}
                  >
                    {isFolderOpening && folderStatus === 'opening'
                      ? t('launchers.opening')
                      : t('launchers.folder')}
                  </button>
                </div>

                {isThisOpening && (
                  <div className={css.opening}>
                    <div className={css.openingLabel}>
                      {openStatus === 'opening'
                        ? t('launchers.openingLauncher')
                        : openStatus === 'done'
                          ? t('launchers.launcherOpened')
                          : t('launchers.failedToOpen')}
                    </div>
                    <div className={[
                      css.progressTrack,
                      openStatus === 'opening' ? css.progressIndeterminate
                        : openStatus === 'done' ? css.progressDone
                        : css.progressError,
                    ].join(' ')}>
                      <div className={css.progressFill} />
                    </div>
                  </div>
                )}
                {isFolderOpening && (
                  <div className={css.opening}>
                    <div className={css.openingLabel}>
                      {folderStatus === 'opening'
                        ? t('launchers.openingFolder')
                        : folderStatus === 'done'
                          ? t('launchers.folderOpened')
                          : t('launchers.failedToOpen')}
                    </div>
                    <div className={[
                      css.progressTrack,
                      folderStatus === 'opening' ? css.progressIndeterminate
                        : folderStatus === 'done' ? css.progressDone
                        : css.progressError,
                    ].join(' ')}>
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
