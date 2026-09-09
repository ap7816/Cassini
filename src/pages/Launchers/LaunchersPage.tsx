import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { FilterBar, FilterSelect } from '../../components/FilterChips/FilterChips';
import css from './LaunchersPage.module.css';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  getCachedLauncherIconsById,
  pruneLauncherIconCache,
  storeLauncherIcons,
} from '../../features/launchers/services/launcherIconCache';

import { info } from '@tauri-apps/plugin-log';
import { useToast } from '../../features/toast/ToastContext';

// Structure d'un launcher détecté par Rust (scan_launchers)
type LauncherDto = {
  id: string;
  name: string;
  installed: boolean;
  launchTarget: string;
  iconPath?: string | null;
};

type OpenStatus = 'idle' | 'opening' | 'done' | 'error';
type InstalledFilter = 'all' | 'yes';
type SortMode = 'default' | 'az';

// Ouvre un launcher via la commande Rust, qui le lance détaché de Cassini.
//
// Le plugin opener démarrait le launcher depuis notre propre processus : il
// héritait alors du job Windows de l'application et se fermait avec elle —
// fermer Cassini éteignait Steam.
async function openTarget(target: string): Promise<void> {
  await invoke('launch_target', { target });
}

// Page des launchers : liste, icônes et boutons d'ouverture pour chaque launcher détecté
export function LaunchersPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const installedFilter = (searchParams.get('installed') ?? 'all') as InstalledFilter;
  const sortMode = (searchParams.get('sort') ?? 'default') as SortMode;

  // Met à jour un paramètre d'URL sans entrée d'historique
  function setParam(key: string, value: string, defaultValue: string) {
    const p = new URLSearchParams(searchParams);
    if (value === defaultValue) p.delete(key);
    else p.set(key, value);
    setSearchParams(p, { replace: true });
  }
  const [desktop, setDesktop] = useState(false);
  const [launchers, setLaunchers] = useState<LauncherDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openStatus, setOpenStatus] = useState<OpenStatus>('idle');

  const [folderOpeningId, setFolderOpeningId] = useState<string | null>(null);
  const [folderStatus, setFolderStatus] = useState<OpenStatus>('idle');

  const [iconsById, setIconsById] = useState<Record<string, string>>({});

  // Déclenche un scan des launchers via Rust et met à jour la liste
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

  // Lance le scan initial uniquement en contexte desktop Tauri
  useEffect(() => {
    const ok = isTauri();
    setDesktop(ok);
    if (ok) void refresh();
  }, []);

  // Charge les icônes des launchers depuis le cache ou via Rust, en évitant les requêtes redondantes
  useEffect(() => {
    if (!desktop) return;

    // Supprime les entrées obsolètes du cache d'icônes
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

  // Lance un launcher et affiche un feedback d'état (ouverture / succès / erreur)
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
      toast.error(msg);
    }
  }

  // Ouvre le dossier d'installation du launcher dans l'explorateur de fichiers
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
      toast.error(msg);
    }
  }

  // Applique recherche, filtre installé et tri à la liste de launchers
  const filteredLaunchers = launchers
    .filter((l) => !q || l.name.toLowerCase().includes(q))
    .filter((l) => installedFilter === 'all' || l.installed)
    .slice()
    .sort((a, b) => {
      if (sortMode === 'az') return a.name.localeCompare(b.name);
      return 0;
    });

  // Le scan renvoie désormais tout le catalogue, y compris les launchers
  // absents du PC : `launchers` n'est donc jamais vide et ne dit plus rien sur
  // ce qu'il y a à montrer. C'est la liste après filtrage qui décide.
  const isEmpty = !loading && filteredLaunchers.length === 0;

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

      <FilterBar>
        <FilterSelect<InstalledFilter>
          label={t('filters.status')}
          options={[
            { value: 'all', label: t('filters.all') },
            { value: 'yes', label: t('filters.installedOnly') },
          ]}
          value={installedFilter}
          onChange={(v) => setParam('installed', v, 'all')}
        />
        <FilterSelect<SortMode>
          label={t('filters.sort')}
          options={[
            { value: 'default', label: t('filters.default') },
            { value: 'az', label: t('filters.az') },
          ]}
          value={sortMode}
          onChange={(v) => setParam('sort', v, 'default')}
        />
      </FilterBar>

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
              <section
                key={l.id}
                className={[css.card, l.installed ? '' : css.cardMissing]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={`${l.name} launcher`}
              >
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
                    {l.installed ? t('launchers.installed') : t('launchers.notFound')}
                  </div>
                </div>

                {/* Launcher absent du PC : aucune action proposée. Deux boutons
                    grisés laisseraient croire qu'il y a quelque chose à
                    débloquer, alors qu'il n'y a simplement rien à ouvrir. */}
                {l.installed && (
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
                )}

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
