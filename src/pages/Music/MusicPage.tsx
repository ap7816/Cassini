import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

import { useMusicPlayer } from '../../features/music/MusicContext';
import { useBasicBatch, refreshCover } from '../../features/music/useTrackMeta';
import { useAutoEnrich } from '../../features/music/useAutoEnrich';
import { resetEnrichment } from '../../features/music/enrichMeta';
import { useToast } from '../../features/toast/ToastContext';
import { useDialog } from '../../hooks/useDialog';
import { AppDialog } from '../../components/AppDialog/AppDialog';
import {
  readMusicFolderColors,
  writeMusicFolderColors,
  writeMusicFolder as storageWriteMusicFolder,
} from '../../services/storage';

import { PALETTE } from './constants';
import {
  buildTree,
  countTracks,
  getNodeAtPath,
  type FolderNode,
  type SortBy,
  type SortDir,
  type TrackWithIdx,
} from './lib/folderTree';
import { absPath } from './lib/format';
import { formaterDuree } from '../../i18n/formats';
import { Breadcrumb } from './components/Breadcrumb';
import { FolderContextMenu, TrackContextMenu, type FolderCtxMenu } from './components/ContextMenus';
import { FolderCard, TrackCard } from './components/MusicCards';
import { EnTeteColonnes, TrackRow } from './components/TrackRow';
import { FolderPickerModal } from './components/FolderPickerModal';
import { SortDropdown } from './components/SortDropdown';
import css from './MusicPage.module.css';

// Page principale de la bibliothèque musicale : navigateur de dossiers, lecture et enrichissement
export function MusicPage() {
  const { t, i18n } = useTranslation();
  const music = useMusicPlayer();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') ?? '').toLowerCase().trim();
  const sortBy = (searchParams.get('sb') ?? 'name') as SortBy;
  const sortDir = (searchParams.get('sd') ?? 'asc') as SortDir;
  const trackPaths = useMemo(() => music.tracks.map((t) => t.path), [music.tracks]);
  const { getMeta, loading: metaLoading } = useBasicBatch(trackPaths);
  const { getEnriched, progress: enrichProgress } = useAutoEnrich({
    paths: trackPaths,
    getMeta,
    enabled: !metaLoading,
  });

  // État de la barre de progression d'enrichissement dérivé d'enrichProgress
  const showBar = enrichProgress !== null;
  const barLabel = t('music.enrichSearching');
  const barDone = enrichProgress?.done ?? 0;
  const barTotal = enrichProgress?.total ?? 1;
  const barPct = barTotal > 0 ? Math.round((barDone / barTotal) * 100) : 0;
  const barIndeterminate = barDone === 0;

  const { dlgState, closeDialog, prompt, confirm } = useDialog();
  const toast = useToast();

  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [folderColors, setFolderColors] = useState<Record<string, string>>(readMusicFolderColors);
  const [ctxMenu, setCtxMenu] = useState<FolderCtxMenu | null>(null);
  const [allDirs, setAllDirs] = useState<string[]>([]);

  // État du menu contextuel de piste et de la modale de déplacement
  type TrackCtx = { x: number; y: number; track: TrackWithIdx };
  const [trackCtxMenu, setTrackCtxMenu] = useState<TrackCtx | null>(null);
  const [moveTarget, setMoveTarget] = useState<TrackWithIdx | null>(null);

  // Réinitialise la navigation quand le dossier racine change
  useEffect(() => {
    setCurrentPath([]);
  }, [music.folderPath]);

  // Charge tous les sous-dossiers (y compris les vides) pour les afficher dans l'arbre
  useEffect(() => {
    if (!music.folderPath || music.loading) return;
    invoke<string[]>('list_music_dirs', { root: music.folderPath })
      .then(setAllDirs)
      .catch(() => setAllDirs([]));
  }, [music.folderPath, music.loading, music.tracks.length]);

  // Navigation depuis le mini-lecteur : applique le dossier cible et scroll jusqu'à la piste active
  function applyMusicNav(folder: string) {
    setCurrentPath(folder ? folder.split('/').filter(Boolean) : []);
    setTimeout(() => {
      const card = document.querySelector('[data-maingrid="true"] [data-trackactive="true"]');
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  // Au montage : consomme une navigation en attente si elle a été émise avant le montage du composant
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    if (win.__musicNavTo !== undefined) {
      applyMusicNav(win.__musicNavTo as string);
      delete win.__musicNavTo;
    }
    // Écoute les navigations quand MusicPage est déjà monté (pas de delete ici — évite la race)
    function onMusicNav(e: Event) {
      const folder = (e as CustomEvent<{ folder: string }>).detail.folder;
      applyMusicNav(folder);
    }
    window.addEventListener('music-nav-to', onMusicNav);
    return () => window.removeEventListener('music-nav-to', onMusicNav);
  }, []);

  // Met à jour le critère et la direction de tri dans les paramètres d'URL
  function setSort(by: SortBy, dir: SortDir) {
    const p = new URLSearchParams(searchParams);
    if (by === 'name') p.delete('sb');
    else p.set('sb', by);
    if (dir === 'asc') p.delete('sd');
    else p.set('sd', dir);
    setSearchParams(p, { replace: true });
  }

  // Ouvre un sélecteur de dossier natif et charge la bibliothèque musicale
  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      storageWriteMusicFolder(selected);
      await music.loadFolder(selected);
    }
  }

  // Retourne la couleur d'un dossier depuis la map locale ou la couleur par défaut
  const getFolderColor = useCallback(
    (fullPath: string) => folderColors[fullPath] ?? PALETTE[0],
    [folderColors],
  );

  // Prévisualisation live pendant la sélection : met à jour React uniquement, sans persister
  function previewFolderColor(folderPath: string, color: string) {
    setFolderColors((prev) => ({ ...prev, [folderPath]: color }));
  }

  // Appelé à la fermeture du sélecteur natif : persiste la couleur dans le stockage
  function saveFolderColor(folderPath: string, color: string) {
    setFolderColors((prev) => {
      const next = { ...prev, [folderPath]: color };
      writeMusicFolderColors(next);
      return next;
    });
  }

  // Demande un nom via dialog et crée le sous-dossier dans le répertoire courant
  async function handleCreateFolder() {
    const name = await prompt(t('music.newFolderPrompt'));
    if (!name) return;
    const root = music.folderPath;
    if (!root) return;
    const targetAbs = absPath(absPath(root, currentPath.join('/')), name);
    try {
      await invoke('create_music_folder', { path: targetAbs });
      await music.loadFolder(root);
    } catch (e) {
      toast.error(t('music.errorGeneric', { error: String(e) }));
    }
  }

  // Renomme un dossier et met à jour le chemin de navigation si celui-ci est un ancêtre courant
  async function handleRenameFolder(node: FolderNode) {
    const newName = await prompt(t('music.renameFolderPrompt'), node.name);
    if (!newName || newName === node.name) return;
    const root = music.folderPath;
    if (!root) return;
    try {
      await invoke('rename_music_folder', { path: absPath(root, node.fullPath), newName });

      // Met à jour le chemin de navigation si le dossier renommé est un ancêtre du chemin courant
      const nodeSegs = node.fullPath ? node.fullPath.split('/') : [];
      const matchesPrefix =
        nodeSegs.length > 0 && nodeSegs.every((seg, i) => currentPath[i] === seg);
      if (matchesPrefix) {
        const updated = [...currentPath];
        updated[nodeSegs.length - 1] = newName;
        setCurrentPath(updated);
      }

      await music.loadFolder(root);
    } catch (e) {
      toast.error(t('music.errorGeneric', { error: String(e) }));
    }
  }

  // Demande confirmation et supprime récursivement un dossier avec tout son contenu
  async function handleDeleteFolder(node: FolderNode) {
    const n = countTracks(node);
    const msg =
      n > 0
        ? t('music.deleteFolderWithTracks', { name: node.name, count: n })
        : t('music.deleteFolderEmpty', { name: node.name });
    const ok = await confirm(msg, { danger: true });
    if (!ok) return;
    const root = music.folderPath;
    if (!root) return;
    try {
      await invoke('delete_music_folder', { path: absPath(root, node.fullPath) });
      await music.loadFolder(root);
    } catch (e) {
      toast.error(t('music.errorGeneric', { error: String(e) }));
    }
  }

  // Déplace une piste vers le dossier sélectionné dans la modale
  async function handleMoveTrack(track: TrackWithIdx, destRelPath: string) {
    const root = music.folderPath;
    if (!root) return;
    const dstAbs = destRelPath ? `${root}/${destRelPath}` : root;
    try {
      await invoke('move_music_file', { src: track.path, dstFolder: dstAbs });
      setMoveTarget(null);
      await music.loadFolder(root);
    } catch (err) {
      toast.error(t('music.errorGeneric', { error: String(err) }));
    }
  }

  // Ouvre un sélecteur de fichier image, embede la pochette choisie dans le fichier audio
  // et met à jour l'affichage immédiatement sans rechargement
  async function handleChangeArtwork(track: TrackWithIdx) {
    const selected = await open({
      filters: [
        { name: t('files.images'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
      ],
      multiple: false,
    });
    if (!selected || typeof selected !== 'string') return;
    try {
      await invoke('write_audio_cover_from_file', { audioPath: track.path, imagePath: selected });
      resetEnrichment(track.path);
      await refreshCover(track.path);
    } catch (err) {
      toast.error(t('music.errorGeneric', { error: String(err) }));
    }
  }

  // Construction de l'arbre, du nœud courant et des listes triées
  const allTracks = useMemo(
    () => music.tracks.map((t, i) => ({ ...t, originalIndex: i })),
    [music.tracks],
  );
  const tree = useMemo(() => buildTree(allTracks, allDirs), [allTracks, allDirs]);
  const currentNode = useMemo(() => getNodeAtPath(tree, currentPath), [tree, currentPath]);

  // Extrait l'extension d'un chemin de fichier audio
  const trackExt = (path: string) => path.split('.').pop()?.toLowerCase() ?? '';

  const sortedFolders = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...currentNode.children].sort(
      (a, b) => dir * a.name.localeCompare(b.name), // dossiers toujours par nom
    );
  }, [currentNode.children, sortDir]);

  const sortedTracks = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...currentNode.tracks].sort((a, b) => {
      if (sortBy === 'dur') {
        const da = getMeta(a.path)?.durationSecs ?? 0;
        const db = getMeta(b.path)?.durationSecs ?? 0;
        return dir * (da - db);
      }
      if (sortBy === 'ext') {
        const ea = trackExt(a.path),
          eb = trackExt(b.path);
        return dir * (ea.localeCompare(eb) || a.title.localeCompare(b.title));
      }
      return dir * a.title.localeCompare(b.title); // 'name' (défaut)
    });
    // getMeta lit depuis le cache module ; metaLoading force le re-tri quand le batch se termine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNode.tracks, sortBy, sortDir, metaLoading]);

  // Toutes les pistes du dossier courant, sous-dossiers compris : c'est ce que
  // l'en-tête décrit. Compter les seules pistes posées ici annoncerait « aucune
  // piste » à la racine d'une bibliothèque rangée en albums.
  const pistesDuDossier = useMemo(() => {
    const sortie: TrackWithIdx[] = [];
    const parcourir = (n: FolderNode) => {
      sortie.push(...n.tracks);
      n.children.forEach(parcourir);
    };
    parcourir(currentNode);
    return sortie;
  }, [currentNode]);

  const dureeDuDossier = useMemo(
    () => pistesDuDossier.reduce((somme, p) => somme + (getMeta(p.path)?.durationSecs ?? 0), 0),
    // getMeta lit un cache de module ; `metaLoading` force le recalcul quand le
    // lot de métadonnées se termine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pistesDuDossier, metaLoading],
  );

  const searchResults = useMemo(() => {
    if (!query) return [];
    return allTracks
      .filter(
        (t) => t.title.toLowerCase().includes(query) || t.folder.toLowerCase().includes(query),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [allTracks, query]);

  const folderName = music.folderPath ? music.folderPath.split(/[\\/]/).pop() : null;
  const isEmpty = !music.loading && music.tracks.length === 0;

  return (
    <div
      className={css.page}
      style={{ position: 'relative' }}
      onClick={() => {
        setCtxMenu(null);
        setTrackCtxMenu(null);
      }}
    >
      {/* ── En-tête ── */}
      <div className={css.header}>
        <div className={css.enteteTitre}>
          <h1 className={css.titrePage} title={music.folderPath}>
            {currentPath.length > 0
              ? currentPath[currentPath.length - 1]
              : (folderName ?? t('nav.music'))}
          </h1>
          <p className={css.sousTitre}>
            {music.loading
              ? t('music.scanning')
              : music.tracks.length === 0
                ? t('music.chooseFirst')
                : `${t('music.trackCount', { count: pistesDuDossier.length })} · ${formaterDuree(dureeDuDossier, i18n.language)}`}
          </p>
        </div>

        <div className={css.enteteActions}>
          {sortedTracks.length > 0 && (
            <button
              className={css.chooseBtn}
              onClick={() => music.selectTrack(sortedTracks[0].originalIndex)}
            >
              <svg viewBox="0 0 24 24" className={css.iconeLecture} aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
              {t('music.playAll')}
            </button>
          )}
          {/* Recharge le dossier actuel sans en choisir un nouveau */}
          {music.folderPath && (
            <button
              className={css.refreshBtn}
              onClick={() => music.loadFolder(music.folderPath)}
              disabled={music.loading}
              title={t('music.refresh')}
            >
              {t('music.refresh')}
            </button>
          )}
          <button className={css.refreshBtn} onClick={handleChooseFolder}>
            {t('music.chooseFolder')}
          </button>
        </div>
      </div>

      {music.error && <div className={css.errorMsg}>{music.error}</div>}

      {/* ── Nav bar ── */}
      {music.tracks.length > 0 && folderName && (
        <div className={css.navBar}>
          <button
            className={css.backBtn}
            onClick={() => setCurrentPath((p) => p.slice(0, -1))}
            disabled={currentPath.length === 0}
          >
            ←
          </button>
          <Breadcrumb
            rootName={folderName}
            path={currentPath}
            onNavigate={(idx) =>
              idx < 0 ? setCurrentPath([]) : setCurrentPath(currentPath.slice(0, idx + 1))
            }
          />
          <button
            className={css.newFolderBtn}
            onClick={handleCreateFolder}
            title={t('music.newFolderPrompt')}
          >
            {t('music.newFolderBtn')}
          </button>
          <SortDropdown sortBy={sortBy} sortDir={sortDir} onChange={setSort} />
        </div>
      )}

      {/* ── Metadata loading bar ── */}
      {metaLoading && (
        <div className={css.metaLoadingBar}>
          <div className={css.metaLoadingProgress} />
        </div>
      )}

      {/* ── Récemment écoutés ── */}
      {!query &&
        music.recentlyPlayed.length > 0 &&
        (() => {
          // Résout les chemins en pistes valides (filtre les pistes supprimées ou non chargées)
          const recentTracks = music.recentlyPlayed
            .map((path) => allTracks.find((t) => t.path === path))
            .filter((t): t is TrackWithIdx => t !== undefined);
          if (recentTracks.length === 0) return null;
          return (
            <div className={css.recentSection}>
              <div className={css.recentTitle}>{t('music.recentlyPlayed')}</div>
              <div className={css.recentStrip}>
                {recentTracks.map((track, idx) => (
                  <TrackCard
                    key={track.path}
                    track={track}
                    index={idx}
                    isActive={track.originalIndex === music.currentIndex}
                    isPlaying={music.isPlaying}
                    onSelect={() => music.selectTrack(track.originalIndex)}
                    onContextMenu={(e) => setTrackCtxMenu({ x: e.clientX, y: e.clientY, track })}
                    meta={getMeta(track.path)}
                    enriched={getEnriched(track.path)}
                  />
                ))}
              </div>
            </div>
          );
        })()}

      {isEmpty && (
        <div className={css.emptyState}>
          {music.folderPath ? t('music.noAudio') : t('music.chooseFirst')}
        </div>
      )}

      {/* ── Search results ── */}
      {!isEmpty &&
        query &&
        (searchResults.length === 0 ? (
          <div className={css.emptyState}>{t('music.noResults', { query })}</div>
        ) : (
          <div className={css.gridScroll}>
            <EnTeteColonnes />
            <div className={css.liste}>
              {searchResults.map((track, idx) => (
                <TrackRow
                  key={track.path}
                  track={track}
                  rang={idx + 1}
                  active={track.originalIndex === music.currentIndex}
                  enLecture={music.isPlaying}
                  onSelect={() => music.selectTrack(track.originalIndex)}
                  onContextMenu={(e) => setTrackCtxMenu({ x: e.clientX, y: e.clientY, track })}
                  meta={getMeta(track.path)}
                  enriched={getEnriched(track.path)}
                />
              ))}
            </div>
          </div>
        ))}

      {/* ── Dossiers, puis pistes ──

          Séparés : les dossiers sont des albums qu'on parcourt du regard, les
          pistes une liste qu'on lit. Mêlés dans une même grille de vignettes,
          les seconds perdaient leur album et leur durée faute de place. */}
      {!isEmpty && !query && (
        <div className={css.gridScroll}>
          {sortedFolders.length > 0 && (
            <section className={css.section}>
              <h2 className={css.sectionTitre}>{t('music.folders')}</h2>
              <div className={css.fileGrid} data-maingrid="true">
                {sortedFolders.map((folder) => (
                  <FolderCard
                    key={folder.fullPath}
                    folder={folder}
                    color={getFolderColor(folder.fullPath)}
                    currentIndex={music.currentIndex}
                    isPlaying={music.isPlaying}
                    onClick={() => setCurrentPath([...currentPath, folder.name])}
                    onContextMenu={(e) => setCtxMenu({ x: e.clientX, y: e.clientY, node: folder })}
                  />
                ))}
              </div>
            </section>
          )}

          {sortedTracks.length > 0 && (
            <section className={css.section}>
              {sortedFolders.length > 0 && (
                <h2 className={css.sectionTitre}>{t('music.tracks')}</h2>
              )}
              <EnTeteColonnes />
              <div className={css.liste}>
                {sortedTracks.map((track, idx) => (
                  <TrackRow
                    key={track.path}
                    track={track}
                    rang={idx + 1}
                    active={track.originalIndex === music.currentIndex}
                    enLecture={music.isPlaying}
                    onSelect={() => music.selectTrack(track.originalIndex)}
                    onContextMenu={(e) => setTrackCtxMenu({ x: e.clientX, y: e.clientY, track })}
                    meta={getMeta(track.path)}
                    enriched={getEnriched(track.path)}
                    cibleDefilement
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <FolderContextMenu
          menu={ctxMenu}
          currentColor={getFolderColor(ctxMenu.node.fullPath)}
          onClose={() => setCtxMenu(null)}
          onRename={handleRenameFolder}
          onDelete={handleDeleteFolder}
          onColorPreview={previewFolderColor}
          onColorSave={saveFolderColor}
        />
      )}

      {/* ── Progress bar (enrichment + image loading) ── */}
      {showBar && (
        <div className={css.enrichBar}>
          <svg className={css.enrichSpinner} viewBox="0 0 20 20" fill="none">
            <circle
              cx="10"
              cy="10"
              r="7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeOpacity="0.2"
            />
            <path
              d="M10 3 a7 7 0 0 1 7 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>

          <span className={css.enrichBarLabel}>{barLabel}</span>

          <span className={css.enrichBarPct}>
            {barIndeterminate ? t('music.enrichInProgress') : `${barPct} %`}
          </span>

          <div className={css.enrichBarTrack}>
            {barIndeterminate ? (
              <div className={css.enrichBarSweep} />
            ) : (
              <div className={css.enrichBarFill} style={{ width: `${barPct}%` }} />
            )}
          </div>

          <span className={css.enrichBarCount}>
            {barDone} / {barTotal}
          </span>
        </div>
      )}

      {/* ── Menu contextuel de piste ── */}
      {trackCtxMenu && (
        <TrackContextMenu
          x={trackCtxMenu.x}
          y={trackCtxMenu.y}
          onClose={() => setTrackCtxMenu(null)}
          onMove={() => setMoveTarget(trackCtxMenu.track)}
          onChangeArt={() => void handleChangeArtwork(trackCtxMenu.track)}
        />
      )}

      {/* ── Modale de déplacement de piste ── */}
      {moveTarget && folderName && (
        <FolderPickerModal
          track={moveTarget}
          allDirs={allDirs}
          rootName={folderName}
          folderPath={music.folderPath}
          onClose={() => setMoveTarget(null)}
          onConfirm={(dest) => void handleMoveTrack(moveTarget, dest)}
        />
      )}

      {/* ── In-app dialog (prompt / confirm) ── */}
      {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
    </div>
  );
}
