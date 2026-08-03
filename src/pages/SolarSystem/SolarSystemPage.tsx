import { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Game } from '../../features/types';
import { loadGamesFromStorage, saveGamesToStorage } from '../../features/Library/services/libraryStorage';
import { fetchRawgImage, clearRawgCacheEntry, steamCdnUrl, steamPortraitUrl } from '../../features/Library/services/rawgService';
import { launchGame } from '../../features/Library/services/launchGame';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useDialog } from '../../hooks/useDialog';
import { AppDialog } from '../../components/AppDialog/AppDialog';
import { useTranslation } from 'react-i18next';
import css from './SolarSystemPage.module.css';

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__ as unknown as { invoke?: TauriInvoke } | undefined;
  if (tauri?.invoke) return tauri.invoke<T>(cmd, args);
  const mod = await import('@tauri-apps/api/core');
  return (mod.invoke as unknown as TauriInvoke)<T>(cmd, args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SUN_R   = 6;
const PLN_R   = 3.2;
const ORB_BASE = 44;
const ORB_STEP = 32;
// PANEL_W kept for future camera offset when panel is open
// const PANEL_W = 320;

const INIT_CAM  = new THREE.Vector3(0, 90, 140);
const INIT_LOOK = new THREE.Vector3(0, 0, 0);

const PLATFORM_COLOR: Record<string, number> = {
  Steam:     0x5ea7d4,
  Epic:      0x8fa6c2,
  BattleNet: 0x00aeef,
  Riot:      0xd13639,
  Rockstar:  0xc8a84b,
  Ubisoft:   0x4098d4,
  GOG:       0x9b59b6,
  Other:     0x7a8a9a,
};

const PLATFORM_CSS: Record<string, string> = {
  Steam:     '#5ea7d4',
  Epic:      '#8fa6c2',
  BattleNet: '#00aeef',
  Riot:      '#d13639',
  Rockstar:  '#c8a84b',
  Ubisoft:   '#4098d4',
  GOG:       '#9b59b6',
  Other:     '#7a8a9a',
};

type PlanetType = 'rocky' | 'gas' | 'oceanic' | 'lava' | 'ice';

const PALETTES: Record<PlanetType, [string, string, string]> = {
  rocky:   ['#8B7355', '#C4A882', '#3A2510'],
  gas:     ['#C87941', '#F0A060', '#7B3A0A'],
  oceanic: ['#1A6FA0', '#40C0E8', '#0A3060'],
  lava:    ['#CC3300', '#FF6633', '#880000'],
  ice:     ['#90C8E0', '#D0EEFF', '#3870A0'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function seededRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural planet texture (512×512 canvas → THREE.CanvasTexture)
// ─────────────────────────────────────────────────────────────────────────────

function makeProcTexture(seed: number): THREE.CanvasTexture {
  const sz = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const c = cv.getContext('2d')!;

  const rng = seededRng(seed);
  const types: PlanetType[] = ['rocky', 'gas', 'oceanic', 'lava', 'ice'];
  const type = types[Math.floor(rng() * types.length)];
  const [base, hi, lo] = PALETTES[type];

  c.fillStyle = base;
  c.fillRect(0, 0, sz, sz);

  if (type === 'rocky') {
    // Noise layer
    for (let i = 0; i < 3000; i++) {
      c.fillStyle = rng() < 0.5 ? hi : lo;
      c.globalAlpha = 0.08 + rng() * 0.18;
      c.fillRect(rng() * sz, rng() * sz, 1 + rng() * 3, 1 + rng() * 3);
    }
    c.globalAlpha = 1;
    // Craters
    for (let i = 0; i < 7 + Math.floor(rng() * 8); i++) {
      const cr = 5 + rng() * 28;
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, cr, 0, Math.PI * 2);
      c.fillStyle = lo;
      c.globalAlpha = 0.55 + rng() * 0.45;
      c.fill();
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, cr * 0.6, 0, Math.PI * 2);
      c.fillStyle = hi;
      c.globalAlpha = 0.2;
      c.fill();
    }
  } else if (type === 'gas') {
    // Horizontal bands
    const bands = 10 + Math.floor(rng() * 8);
    for (let i = 0; i < bands; i++) {
      c.fillStyle = i % 2 === 0 ? hi : lo;
      c.globalAlpha = 0.35 + rng() * 0.35;
      c.fillRect(0, (i / bands) * sz, sz, (1 / bands) * sz * (0.8 + rng() * 0.5));
    }
    // Storm spot
    c.beginPath();
    c.ellipse(rng() * sz, sz / 2 + (rng() - 0.5) * sz * 0.3, 40 + rng() * 60, 18 + rng() * 20, rng() * 0.3, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,200,100,0.35)';
    c.fill();
    c.globalAlpha = 1;
  } else if (type === 'oceanic') {
    // Continents
    for (let i = 0; i < 5 + Math.floor(rng() * 5); i++) {
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, 18 + rng() * 80, 0, Math.PI * 2);
      c.fillStyle = '#4a8a3a';
      c.globalAlpha = 0.7 + rng() * 0.3;
      c.fill();
    }
    c.globalAlpha = 1;
    // Polar ice caps
    c.fillStyle = 'rgba(210,240,255,0.9)';
    c.fillRect(0, 0, sz, sz * 0.07);
    c.fillRect(0, sz * 0.93, sz, sz * 0.07);
  } else if (type === 'lava') {
    // Lava cracks/veins
    for (let i = 0; i < 20; i++) {
      c.beginPath();
      c.moveTo(rng() * sz, rng() * sz);
      c.bezierCurveTo(rng() * sz, rng() * sz, rng() * sz, rng() * sz, rng() * sz, rng() * sz);
      c.strokeStyle = '#FF6600';
      c.lineWidth = 1 + rng() * 2.5;
      c.globalAlpha = 0.5 + rng() * 0.5;
      c.stroke();
    }
    // Hotspots
    for (let i = 0; i < 10; i++) {
      c.beginPath();
      c.arc(rng() * sz, rng() * sz, 3 + rng() * 14, 0, Math.PI * 2);
      c.fillStyle = rng() < 0.5 ? '#FFCC00' : '#FF8800';
      c.globalAlpha = 0.6 + rng() * 0.4;
      c.fill();
    }
    c.globalAlpha = 1;
  } else {
    // Ice: noise
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = rng() < 0.5 ? '#FFFFFF' : '#C0D8F0';
      c.globalAlpha = 0.05 + rng() * 0.12;
      c.fillRect(rng() * sz, rng() * sz, 1 + rng() * 2, 1 + rng() * 2);
    }
    // Cracks
    for (let i = 0; i < 12; i++) {
      c.beginPath();
      c.moveTo(rng() * sz, rng() * sz);
      c.lineTo(rng() * sz, rng() * sz);
      c.strokeStyle = '#6090a8';
      c.lineWidth = 0.8;
      c.globalAlpha = 0.4 + rng() * 0.4;
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PlanetEntry = {
  game: Game;
  mesh: THREE.Mesh;
  orbitRadius: number;
  angle: number;
  speed: number;
  paused: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Right panel — mirrors the library GameCard feature-for-feature
// ─────────────────────────────────────────────────────────────────────────────

const GB = 1024 ** 3;
const TB = 1024 ** 4;
function fmtBytes(b: number): string {
  if (b >= TB) return `${(b / TB).toFixed(1)} TB`;
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  return `${(b / (1024 ** 2)).toFixed(0)} MB`;
}
const lastPlayedFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

type PanelProps = {
  game: Game;
  sgdbApiKey: string;
  onClose: () => void;
  onUpdate: (updated: Game) => void;
  onRemove: (id: string) => void;
};

function GamePanel({ game, sgdbApiKey, onClose, onUpdate, onRemove }: PanelProps) {
  const { t } = useTranslation();
  const { dlgState, closeDialog, prompt, confirm } = useDialog();

  const isSteam = game.platform === 'Steam';
  const resolvedAppId =
    game.steamAppId ??
    (isSteam && game.id.startsWith('steam-') ? game.id.slice('steam-'.length) : null);

  const steamDirectUrl = resolvedAppId ? steamCdnUrl(resolvedAppId) : null;
  const [imgSrc, setImgSrc]       = useState<string | null>(steamDirectUrl);
  const [launching, setLaunching] = useState(false);

  const bannerUrl   = game.customImageUrl ?? imgSrc;
  const showFallback = !bannerUrl;
  const col = PLATFORM_CSS[game.platform] ?? '#7a8a9a';
  const canPlay = Boolean(game.installed && game.launchUrl);

  useEffect(() => {
    if (game.customImageUrl) return;
    if (isSteam && resolvedAppId) { setImgSrc(steamCdnUrl(resolvedAppId)); return; }
    if (!isSteam && sgdbApiKey) {
      let cancelled = false;
      fetchRawgImage(game.title, sgdbApiKey).then((url) => { if (!cancelled) setImgSrc(url ?? null); });
      return () => { cancelled = true; };
    }
  }, [game.id, game.title, game.customImageUrl, resolvedAppId, isSteam, sgdbApiKey]);

  function handleImgError() {
    if (game.customImageUrl) { setImgSrc(null); return; }
    if (isSteam && resolvedAppId) {
      const portrait = steamPortraitUrl(resolvedAppId);
      if (imgSrc !== portrait) { setImgSrc(portrait); return; }
      if (sgdbApiKey) fetchRawgImage(game.title, sgdbApiKey).then((url) => setImgSrc(url ?? null));
      else setImgSrc(null);
      return;
    }
    clearRawgCacheEntry(game.title.toLowerCase());
    if (sgdbApiKey) fetchRawgImage(game.title, sgdbApiKey).then((url) => setImgSrc(url ?? null));
    else setImgSrc(null);
  }

  async function handleSetImage() {
    const url = await prompt(t('gameCard.imageUrlPrompt'), game.customImageUrl ?? '');
    if (url === null) return;
    onUpdate({ ...game, customImageUrl: url.trim() || undefined });
    setImgSrc(null);
  }

  async function handlePlay() {
    if (!canPlay || launching) return;
    setLaunching(true);
    try { await launchGame(game); } finally { setLaunching(false); }
  }

  async function handleRemove() {
    const ok = await confirm(t('gameCard.removeConfirm', { name: game.title }), { danger: true });
    if (ok) { onRemove(game.id); onClose(); }
  }

  const lastPlayedLabel = useMemo(() => {
    if (!game.lastPlayedAt) return t('gameCard.neverPlayed');
    const d = new Date(game.lastPlayedAt);
    if (Number.isNaN(d.getTime())) return t('gameCard.unknownDate');
    return t('gameCard.lastPlayed', { date: lastPlayedFmt.format(d) });
  }, [game.lastPlayedAt, t]);

  return (
    <div className={css.panel}>
      {/* Banner — same 460/215 ratio as library card */}
      <div className={css.panelBanner}>
        {!showFallback ? (
          <>
            <img src={bannerUrl!} alt="" className={css.panelBannerImg} onError={handleImgError} />
            {game.customImageUrl && (
              <button type="button" className={css.panelBannerEdit} onClick={handleSetImage} title={t('gameCard.editImage')}>✎</button>
            )}
          </>
        ) : (
          <div className={css.panelBannerFallback} style={{ background: `linear-gradient(135deg,${col}44,${col}11)` }}>
            <span className={css.panelBannerLetter}>{game.title.slice(0, 1).toUpperCase()}</span>
            <button type="button" className={css.panelBannerEditFallback} onClick={handleSetImage} title={t('gameCard.setImage')}>
              {t('gameCard.imageButton')}
            </button>
          </div>
        )}
        <div className={css.panelBannerGrad} />
        <button className={css.panelClose} onClick={onClose} aria-label="Fermer">✕</button>
      </div>

      {/* Body */}
      <div className={css.panelBody}>
        {/* Title row */}
        <div className={css.panelTitleRow}>
          <h2 className={css.panelTitle}>{game.title}</h2>
          <button
            type="button"
            className={[css.panelFavBtn, game.favorite ? css.panelFavBtnActive : ''].join(' ')}
            onClick={() => onUpdate({ ...game, favorite: !game.favorite })}
            aria-label={game.favorite ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
            title={game.favorite ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
          >
            {game.favorite ? '★' : '☆'}
          </button>
        </div>

        {/* Meta row */}
        <div className={css.panelMeta}>
          <span className={css.panelBadge} style={{ background: col + '28', borderColor: col + '55', color: col }}>{game.platform}</span>
          {game.favorite && <span className={css.panelFavPill}>{t('gameCard.favorite')}</span>}
          <span className={css.panelDot}>•</span>
          <span className={css.panelMuted}>{game.installed ? t('gameCard.installed') : t('gameCard.notInstalled')}</span>
          {game.sizeOnDisk != null && game.sizeOnDisk > 0 && (
            <><span className={css.panelDot}>•</span><span className={css.panelMuted}>{fmtBytes(game.sizeOnDisk)}</span></>
          )}
        </div>

        {/* Last played */}
        <div className={css.panelLastPlayed}>{lastPlayedLabel}</div>

        {/* Actions */}
        <div className={css.panelActions}>
          <button
            type="button"
            className={[css.panelPlay, launching ? css.panelPlayLaunching : ''].join(' ')}
            onClick={handlePlay}
            disabled={!canPlay || launching}
            title={!canPlay ? t('gameCard.notAvailable') : t('gameCard.launch')}
          >
            {launching ? t('gameCard.opening') : t('gameCard.play')}
          </button>

          {game.installPath && (
            <button type="button" className={css.panelFolder}
              onClick={() => void tauriInvoke('open_folder', { path: game.installPath })}
              title={t('gameCard.openFolder')}>
              📁
            </button>
          )}

          <button type="button" className={css.panelRemove} onClick={handleRemove} title={t('gameCard.remove')}>✕</button>
        </div>
      </div>

      {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function SolarSystemPage() {
  const mountRef       = useRef<HTMLDivElement>(null);
  const labelsRef      = useRef<HTMLDivElement>(null);
  const clearPlanetRef = useRef<() => void>(() => {});
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [tooltip, setTooltip] = useState<{ title: string; x: number; y: number } | null>(null);
  const [games, setGames] = useState<Game[]>(() => loadGamesFromStorage());
  const { settings } = useAppSettings();

  function handleGameUpdate(updated: Game) {
    setGames(prev => {
      const next = prev.map(g => g.id === updated.id ? updated : g);
      saveGamesToStorage(next);
      return next;
    });
    setSelectedGame(updated);
  }

  function handleGameRemove(id: string) {
    setGames(prev => {
      const next = prev.filter(g => g.id !== id);
      saveGamesToStorage(next);
      return next;
    });
  }

  // games was previously loaded via useMemo — keep it stable for Three.js
  const stableGames = useMemo(() => games, [games]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x070b12);
    container.appendChild(renderer.domElement);

    // ── Scene / Camera ─────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      5000,
    );
    camera.position.copy(INIT_CAM);
    camera.lookAt(INIT_LOOK);

    // ── Controls ───────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.minDistance    = PLN_R * 2.5;
    controls.maxDistance    = 900;
    controls.target.copy(INIT_LOOK);

    // ── Lighting ───────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x203060, 0.8));
    const sunLight = new THREE.PointLight(0xfff0cc, 120, 0, 1.5);
    scene.add(sunLight);

    // ── Stars ──────────────────────────────────────────────────────────────
    {
      const n   = 4000;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 500 + Math.random() * 500;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos[i * 3]     = r * Math.sin(p) * Math.cos(t);
        pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
        pos[i * 3 + 2] = r * Math.cos(p);
        const b = 0.7 + Math.random() * 0.3;
        col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.55,
        vertexColors: true,
        sizeAttenuation: true,
      })));
    }

    // ── Sun ────────────────────────────────────────────────────────────────
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_R, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xffdd44 }),
    );
    scene.add(sunMesh);

    // Glow layers
    for (const [scale, color, opacity] of [
      [1.55, 0xff9900, 0.18],
      [2.1,  0xff6600, 0.09],
      [2.9,  0xff3300, 0.04],
    ] as [number, number, number][]) {
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(SUN_R * scale, 24, 24),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.BackSide,
          depthWrite: false,
        }),
      ));
    }

    // ── Planet setup ───────────────────────────────────────────────────────
    const texLoader = new THREE.TextureLoader();
    texLoader.crossOrigin = 'anonymous';

    const byPlatform = new Map<string, Game[]>();
    for (const g of stableGames) {
      const k = g.platform || 'Other';
      (byPlatform.get(k) ?? byPlatform.set(k, []).get(k))!.push(g);
    }

    const planets: PlanetEntry[] = [];
    const orbitLabels: { div: HTMLDivElement; world: THREE.Vector3 }[] = [];
    const planetLabels: { div: HTMLDivElement; entry: PlanetEntry }[] = [];
    let orbitIdx = 0;

    for (const [platform, pg] of byPlatform) {
      // Orbit radius: ensure planets don't overlap
      const minR = pg.length > 1
        ? Math.ceil((PLN_R * 2.8) / Math.sin(Math.PI / pg.length))
        : 0;
      const orbit = Math.max(ORB_BASE + orbitIdx * ORB_STEP, minR);

      // Orbit ring (torus flat on XZ)
      const orbColor = PLATFORM_COLOR[platform] ?? 0x7a8a9a;
      const orbMesh  = new THREE.Mesh(
        new THREE.TorusGeometry(orbit, 0.12, 4, 160),
        new THREE.MeshBasicMaterial({
          color: orbColor,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
      );
      orbMesh.rotation.x = Math.PI / 2;
      scene.add(orbMesh);

      // Platform label: HTML div updated via camera projection each frame
      const lblDiv = document.createElement('div');
      lblDiv.className = css.orbitLabel;
      lblDiv.textContent = platform;
      lblDiv.style.color = PLATFORM_CSS[platform] ?? '#7a8a9a';
      labelsRef.current?.appendChild(lblDiv);
      const lblWorld = new THREE.Vector3(0, 1.5, -orbit);
      orbitLabels.push({ div: lblDiv, world: lblWorld });

      // Planets
      const aStep  = (Math.PI * 2) / Math.max(pg.length, 1);
      const startA = seededRng(orbitIdx * 37)() * Math.PI * 2;
      const speed  = 0.028 / (1 + orbitIdx * 0.38);

      for (let i = 0; i < pg.length; i++) {
        const g = pg[i];
        const seed = hashStr(g.id);

        const appId =
          g.steamAppId ??
          (g.platform === 'Steam' && g.id.startsWith('steam-') ? g.id.slice(6) : null);

        let texture: THREE.Texture;
        if (appId) {
          texture = texLoader.load(steamCdnUrl(appId));
          texture.colorSpace = THREE.SRGBColorSpace;
        } else {
          texture = makeProcTexture(seed);
        }

        const mat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.75,
          metalness: 0.04,
          emissive: new THREE.Color(0x111111),
          emissiveIntensity: 1,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(PLN_R, 36, 36), mat);
        scene.add(mesh);

        // Atmosphere haze
        const rng  = seededRng(seed + 1);
        const atmTypes: PlanetType[] = ['rocky', 'gas', 'oceanic', 'lava', 'ice'];
        const atmType = atmTypes[Math.floor(rng() * atmTypes.length)];
        const atmCol  = new THREE.Color(PALETTES[atmType][0]);
        mesh.add(new THREE.Mesh(
          new THREE.SphereGeometry(PLN_R * 1.12, 16, 16),
          new THREE.MeshBasicMaterial({
            color: atmCol,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide,
            depthWrite: false,
          }),
        ));

        const angle = startA + aStep * i;
        mesh.position.set(
          Math.cos(angle) * orbit,
          0,
          Math.sin(angle) * orbit,
        );

        const entry: PlanetEntry = { game: g, mesh, orbitRadius: orbit, angle, speed, paused: false };
        planets.push(entry);

        // Planet name label
        const nameDiv = document.createElement('div');
        nameDiv.className = css.planetLabel;
        nameDiv.textContent = g.title;
        labelsRef.current?.appendChild(nameDiv);
        planetLabels.push({ div: nameDiv, entry });
      }

      orbitIdx++;
    }

    // ── Camera animation ───────────────────────────────────────────────────
    let animating = false;
    const camTargetPos  = new THREE.Vector3().copy(INIT_CAM);
    const camTargetLook = new THREE.Vector3().copy(INIT_LOOK);

    function animateCam(pos: THREE.Vector3, look: THREE.Vector3) {
      animating = true;
      controls.enabled = false;
      camTargetPos.copy(pos);
      camTargetLook.copy(look);
    }

    // ── Click detection ────────────────────────────────────────────────────
    const raycaster  = new THREE.Raycaster();
    const mouse      = new THREE.Vector2();
    let mouseDownPos = new THREE.Vector2();

    function selectPlanet(p: PlanetEntry) {
      for (const pl of planets) pl.paused = true;
      setSelectedGame(p.game);

      // Camera: close-up view of the planet (slightly above + in front)
      const pp = p.mesh.position;
      const offset = new THREE.Vector3(0, PLN_R * 4, PLN_R * 8);
      animateCam(pp.clone().add(offset), pp.clone());
    }

    function clearPlanet() {
      for (const pl of planets) pl.paused = false;
      setSelectedGame(null);
      animateCam(INIT_CAM.clone(), INIT_LOOK.clone());
    }
    clearPlanetRef.current = clearPlanet;

    function onMouseDown(e: MouseEvent) {
      mouseDownPos.set(e.clientX, e.clientY);
    }

    function onMouseUp(e: MouseEvent) {
      if (new THREE.Vector2(e.clientX, e.clientY).distanceTo(mouseDownPos) > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);

      const meshes = planets.map(p => p.mesh);
      const hits   = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const hit = planets.find(p => p.mesh === hits[0].object);
        if (hit) { selectPlanet(hit); return; }
      }
      clearPlanet();
    }

    function onMouseMove(e: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(planets.map(p => p.mesh), false);
      if (hits.length > 0) {
        const hit = planets.find(p => p.mesh === hits[0].object);
        if (hit) {
          setTooltip({ title: hit.game.title, x: e.clientX, y: e.clientY });
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      setTooltip(null);
      renderer.domElement.style.cursor = '';
    }

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup',   onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    // ── Resize ─────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    // ── Animation loop ─────────────────────────────────────────────────────
    let prevT = performance.now();
    let rafId = 0;

    function tick(t: number) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min((t - prevT) / 1000, 0.1);
      prevT = t;

      // Orbit planets
      for (const p of planets) {
        if (!p.paused) {
          p.angle += p.speed * dt;
          p.mesh.position.set(
            Math.cos(p.angle) * p.orbitRadius,
            0,
            Math.sin(p.angle) * p.orbitRadius,
          );
        }
        // Spin planet on its axis
        p.mesh.rotation.y += 0.12 * dt;
      }

      // Sun pulse
      const pulse = 1 + Math.sin(t * 0.0008) * 0.03;
      sunMesh.scale.setScalar(pulse);

      // Camera animation lerp
      if (animating) {
        camera.position.lerp(camTargetPos, 0.06);
        controls.target.lerp(camTargetLook, 0.06);

        if (camera.position.distanceTo(camTargetPos) < 0.4) {
          animating = false;
          controls.enabled = true;
        }
      }

      // Update label positions via camera projection
      const labelsEl = labelsRef.current;
      if (labelsEl) {
        const w2 = labelsEl.clientWidth  / 2;
        const h2 = labelsEl.clientHeight / 2;
        // In overview (camera far from origin), show orbit labels; hide when zoomed in
        const camDist = camera.position.length();
        const overview = camDist > 80;

        for (const lbl of orbitLabels) {
          if (!overview) { lbl.div.style.display = 'none'; continue; }
          const projected = lbl.world.clone().project(camera);
          if (projected.z > 1) {
            lbl.div.style.display = 'none';
          } else {
            lbl.div.style.display = '';
            lbl.div.style.position = 'absolute';
            lbl.div.style.left = `${projected.x * w2 + w2}px`;
            lbl.div.style.top  = `${-projected.y * h2 + h2}px`;
            lbl.div.style.transform = 'translate(-50%, -50%)';
          }
        }

        for (const lbl of planetLabels) {
          const worldPos = lbl.entry.mesh.position.clone();
          const distToCam = camera.position.distanceTo(worldPos);
          worldPos.y -= PLN_R * 1.8;
          const projected = worldPos.project(camera);
          if (projected.z > 1 || distToCam > 320) {
            lbl.div.style.display = 'none';
          } else {
            // Fade out labels that are far away
            const opacity = Math.max(0.2, Math.min(1, 1 - (distToCam - 60) / 260));
            lbl.div.style.display = '';
            lbl.div.style.position = 'absolute';
            lbl.div.style.left = `${projected.x * w2 + w2}px`;
            lbl.div.style.top  = `${-projected.y * h2 + h2}px`;
            lbl.div.style.transform = 'translate(-50%, 0)';
            lbl.div.style.opacity = String(opacity);
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);
    }

    rafId = requestAnimationFrame(tick);

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup',   onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      // Clear all HTML labels so they don't accumulate on StrictMode re-mount
      if (labelsRef.current) labelsRef.current.innerHTML = '';
    };
  }, [stableGames]);

  return (
    <div className={css.page}>
      {/* Three.js renders into this div */}
      <div ref={mountRef} className={css.canvas} />
      {/* HTML labels overlay — positioned via camera projection each frame */}
      <div ref={labelsRef} className={css.labels} />
      {/* Hover tooltip */}
      {tooltip && (
        <div
          className={css.tooltip}
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.title}
        </div>
      )}
      {selectedGame && (
        <GamePanel
          key={selectedGame.id}
          game={selectedGame}
          sgdbApiKey={settings.sgdbApiKey}
          onClose={() => clearPlanetRef.current()}
          onUpdate={handleGameUpdate}
          onRemove={handleGameRemove}
        />
      )}
    </div>
  );
}
