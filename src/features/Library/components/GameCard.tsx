import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../../types';
import css from './GameCard.module.css';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleInstalled: (id: string) => void;
  onToggleFavorite: (id: string) => void;
};

const lastPlayedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function formatLastPlayed(iso?: string | null) {
  if (!iso) return 'Never played';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `Last played: ${lastPlayedFormatter.format(d)}`;
}

function isLocalWindowsPath(input: string): boolean {
  return /^[a-zA-Z]:\\/.test(input) || input.startsWith('\\\\');
}

function getSteamAppId(game: Game): string | null {
  // 1) via id: "steam-12345"
  if (game.id.startsWith('steam-')) {
    const rest = game.id.slice('steam-'.length).trim();
    if (/^\d+$/.test(rest)) return rest;
  }

  // 2) via launchUrl: steam://rungameid/12345
  const url = game.launchUrl ?? '';
  const m = url.match(/steam:\/\/rungameid\/(\d+)/i);
  return m?.[1] ?? null;
}

async function openSteamUrl(url: string): Promise<void> {
  // Desktop only (Tauri). En web preview, c’est souvent bloqué / ignoré.
  if (!isTauri()) {
    throw new Error('Steam actions are only available in the desktop app (Tauri).');
  }
  await openUrl(url);
}

export function GameCard({ game, onRemove, onPlay, onToggleInstalled, onToggleFavorite }: Props) {
  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);

  const [coverUrl, setCoverUrl] = useState<string | null>(game.coverUrl ?? null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  // NEW: état "busy" pour l'animation + disable du bouton install/uninstall
  const [isInstallBusy, setIsInstallBusy] = useState(false);

  useEffect(() => {
    setCoverUrl(game.coverUrl ?? null);
    setImgSrc(null);
  }, [game.coverUrl, game.id]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!coverUrl) {
        if (!cancelled) setImgSrc(null);
        return;
      }

      if (!isLocalWindowsPath(coverUrl)) {
        if (!cancelled) setImgSrc(coverUrl);
        return;
      }

      try {
        const mod = await import('@tauri-apps/api/core');
        const converted = mod.convertFileSrc(coverUrl);
        if (!cancelled) setImgSrc(converted);
      } catch {
        if (!cancelled) setImgSrc(coverUrl);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  async function handleToggleInstalled() {
    if (isInstallBusy) return;

    // Steam: on déclenche l’action réelle via steam://...
    if (game.platform === 'Steam') {
      const appid = getSteamAppId(game);
      if (!appid) {
        window.alert('Steam app id not found for this game.');
        return;
      }

      if (game.installed) {
        const ok = window.confirm(
          `Uninstall "${game.title}"?\n\nSteam will open and ask you to confirm.`,
        );
        if (!ok) return;

        setIsInstallBusy(true);
        try {
          await openSteamUrl(`steam://uninstall/${appid}`);

          // Optimiste: on met à jour l’UI tout de suite.
          // Si l’utilisateur annule dans Steam, il faudra rescan.
          onToggleInstalled(game.id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to open Steam uninstall.';
          window.alert(msg);
        } finally {
          // petit délai pour que l'utilisateur "voit" l'opening (sinon ça clignote)
          window.setTimeout(() => setIsInstallBusy(false), 650);
        }
        return;
      }

      // Install
      const ok = window.confirm(
        `Install "${game.title}"?\n\nSteam will open and start the install.`,
      );
      if (!ok) return;

      setIsInstallBusy(true);
      try {
        await openSteamUrl(`steam://install/${appid}`);

        // Optimiste: on met à jour l’UI tout de suite.
        onToggleInstalled(game.id);
      } catch (e1) {
        // Fallback: ouvrir la page store (mais on NE toggle PAS l’état ici)
        try {
          await openSteamUrl(`steam://store/${appid}`);
        } catch (e2) {
          const msg =
            e2 instanceof Error
              ? e2.message
              : e1 instanceof Error
                ? e1.message
                : 'Failed to open Steam.';
          window.alert(msg);
        }
      } finally {
        window.setTimeout(() => setIsInstallBusy(false), 650);
      }

      return;
    }

    // Autres plateformes: pour l’instant on garde le toggle UI uniquement
    if (game.installed) {
      const ok = window.confirm(`Uninstall "${game.title}" ?`);
      if (!ok) return;
    }
    onToggleInstalled(game.id);
  }

  function handleImageError() {
    setCoverUrl(null);
    setImgSrc(null);
  }

  const showLetter = !imgSrc;
  const lastPlayedLabel = useMemo(() => formatLastPlayed(game.lastPlayedAt), [game.lastPlayedAt]);

  // NEW: style du bouton install/uninstall
  const isSteam = game.platform === 'Steam';
  const secondaryClassName = useMemo(() => {
    const classes = [css.secondary];

    if (isSteam) classes.push(css.secondarySteam);
    if (game.installed) classes.push(css.secondaryDanger);
    else classes.push(css.secondarySuccess);

    if (isInstallBusy) classes.push(css.secondaryBusy);

    return classes.join(' ');
  }, [isSteam, game.installed, isInstallBusy]);

  const secondaryLabel = useMemo(() => {
    if (isInstallBusy) return 'Opening…';
    return game.installed ? 'Uninstall' : 'Install';
  }, [isInstallBusy, game.installed]);

  const secondaryTitle = useMemo(() => {
    if (isInstallBusy) return 'Opening Steam…';
    if (isSteam) return game.installed ? 'Uninstall via Steam' : 'Install via Steam';
    return game.installed ? 'Uninstall' : 'Install';
  }, [isInstallBusy, isSteam, game.installed]);

  return (
    <article className={[css.card, isFav ? css.cardFavorite : ''].join(' ')}>
      <div className={css.cover} aria-hidden="true">
        {!showLetter ? (
          <img
            className={css.coverImg}
            src={imgSrc}
            alt=""
            loading="lazy"
            draggable={false}
            onError={handleImageError}
          />
        ) : (
          game.title.slice(0, 1).toUpperCase()
        )}
      </div>

      <div className={css.body}>
        <div className={css.topRow}>
          <div className={css.titleWrap}>
            <div className={css.titleRow}>
              <div className={css.title}>{game.title}</div>

              <button
                type="button"
                className={[css.fav, isFav ? css.favActive : ''].join(' ')}
                onClick={() => onToggleFavorite(game.id)}
                aria-label={isFav ? `Unfavorite ${game.title}` : `Favorite ${game.title}`}
                aria-pressed={isFav}
                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFav ? '★' : '☆'}
              </button>
            </div>

            <div className={css.meta}>
              <span className={css.badge}>{game.platform}</span>
              {isFav && <span className={css.favPill}>Favorite</span>}
              <span className={css.dot} aria-hidden="true">
                •
              </span>
              <span className={css.muted}>{game.installed ? 'Installed' : 'Not installed'}</span>
            </div>
          </div>

          <div className={css.actions}>
            <button
              type="button"
              className={secondaryClassName}
              onClick={() => void handleToggleInstalled()}
              title={secondaryTitle}
              disabled={isInstallBusy}
              aria-disabled={isInstallBusy}
            >
              {secondaryLabel}
            </button>

            <button
              type="button"
              className={css.play}
              onClick={() => onPlay(game)}
              disabled={!canPlay}
              title={!canPlay ? 'Not available' : 'Launch'}
            >
              Play
            </button>

            <button
              type="button"
              className={css.remove}
              onClick={() => onRemove(game.id)}
              aria-label={`Remove ${game.title}`}
              title="Remove"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={css.footer}>{lastPlayedLabel}</div>
      </div>
    </article>
  );
}
