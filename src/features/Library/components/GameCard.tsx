import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../types';
import css from './GameCard.module.css';
import { useDialog } from '../../../hooks/useDialog';
import { AppDialog } from '../../../components/AppDialog/AppDialog';
import { fetchRawgImage, clearRawgCacheEntry, steamCdnUrl, steamPortraitUrl } from '../services/rawgService';

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onSetImageUrl: (id: string, url: string | null) => void;
  sgdbApiKey: string;
  isLaunching?: boolean;
};

const lastPlayedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__ as unknown as { invoke?: TauriInvoke } | undefined;
  if (tauri?.invoke) return tauri.invoke<T>(cmd, args);
  const mod = await import('@tauri-apps/api/core');
  return (mod.invoke as unknown as TauriInvoke)<T>(cmd, args);
}

const GB = 1024 ** 3;
const TB = 1024 ** 4;

function fmtBytes(b: number): string {
  if (b >= TB) return `${(b / TB).toFixed(1)} TB`;
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  return `${(b / (1024 ** 2)).toFixed(0)} MB`;
}

export function GameCard({ game, onRemove, onPlay, onToggleFavorite, onSetImageUrl, sgdbApiKey, isLaunching = false }: Props) {
  const { t } = useTranslation();
  const { dlgState, closeDialog, prompt, confirm } = useDialog();

  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);

  const lastPlayedLabel = useMemo(() => {
    if (!game.lastPlayedAt) return t('gameCard.neverPlayed');
    const d = new Date(game.lastPlayedAt);
    if (Number.isNaN(d.getTime())) return t('gameCard.unknownDate');
    return t('gameCard.lastPlayed', { date: lastPlayedFormatter.format(d) });
  }, [game.lastPlayedAt, t]);

  const isSteam = game.platform === 'Steam';

  // Résout l'appId Steam — game.steamAppId peut être null pour les jeux anciennement
  // stockés avant l'ajout du champ. On le reextrait depuis game.id (ex: "steam-552100").
  const resolvedSteamAppId =
    game.steamAppId ??
    (isSteam && game.id.startsWith('steam-') ? game.id.slice('steam-'.length) : null);

  // Pour les jeux Steam, l'URL CDN est toujours calculable directement depuis l'appId.
  // On ne passe jamais par le cache pour éviter que handleImgError ne la supprime.
  const steamDirectUrl = resolvedSteamAppId ? steamCdnUrl(resolvedSteamAppId) : null;

  const [imgSrc, setImgSrc] = useState<string | null>(steamDirectUrl);

  const bannerUrl = game.customImageUrl ?? imgSrc;
  const showFallback = !bannerUrl;

  // Charge l'image : Steam → URL directe, non-Steam → RAWG (clé requise)
  useEffect(() => {
    if (game.customImageUrl) return;

    if (isSteam && resolvedSteamAppId) {
      // L'URL CDN Steam est toujours disponible, aucun fetch async nécessaire
      setImgSrc(steamCdnUrl(resolvedSteamAppId));
      return;
    }

    if (!isSteam && sgdbApiKey) {
      let cancelled = false;
      fetchRawgImage(game.title, sgdbApiKey).then((url) => {
        if (!cancelled) setImgSrc(url ?? null);
      });
      return () => { cancelled = true; };
    }
  }, [game.id, game.title, game.customImageUrl, resolvedSteamAppId, isSteam, sgdbApiKey]);

  function handleImgError() {
    if (game.customImageUrl) { setImgSrc(null); return; }

    if (isSteam && resolvedSteamAppId) {
      // header.jpg a échoué → essayer library_600x900.jpg en fallback
      const portrait = steamPortraitUrl(resolvedSteamAppId);
      if (imgSrc !== portrait) {
        setImgSrc(portrait);
      } else {
        // Les deux URLs Steam ont échoué → tenter SteamGridDB en dernier recours
        if (sgdbApiKey) {
          fetchRawgImage(game.title, sgdbApiKey).then((url) => setImgSrc(url ?? null));
        } else {
          setImgSrc(null);
        }
      }
      return;
    }

    // Non-Steam : vider le cache et retenter via RAWG
    clearRawgCacheEntry(game.title.toLowerCase());
    if (sgdbApiKey) {
      fetchRawgImage(game.title, sgdbApiKey).then((url) => setImgSrc(url ?? null));
    } else {
      setImgSrc(null);
    }
  }

  async function handleSetImage() {
    const current = game.customImageUrl ?? '';
    const url = await prompt(t('gameCard.imageUrlPrompt'), current);
    if (url === null) return;
    onSetImageUrl(game.id, url.trim() || null);
    setImgSrc(null);
  }

  return (
    <article className={[css.card, isFav ? css.cardFavorite : ''].join(' ')}>
      {!showFallback ? (
        <div className={css.banner}>
          <img
            className={css.bannerImg}
            src={bannerUrl!}
            alt=""
            onError={handleImgError}
          />
          {game.customImageUrl && (
            <button
              type="button"
              className={css.bannerEdit}
              onClick={handleSetImage}
              title={t('gameCard.editImage')}
            >
              ✎
            </button>
          )}
        </div>
      ) : (
        <div className={css.bannerFallback}>
          <span>{game.title.slice(0, 1).toUpperCase()}</span>
          <button
            type="button"
            className={css.bannerEditFallback}
            onClick={handleSetImage}
            title={t('gameCard.setImage')}
          >
            {t('gameCard.imageButton')}
          </button>
        </div>
      )}

      <div className={css.body}>
        <div className={css.topRow}>
          <div className={css.titleWrap}>
            <div className={css.titleRow}>
              <div className={css.title}>{game.title}</div>

              <button
                type="button"
                className={[css.fav, isFav ? css.favActive : ''].join(' ')}
                onClick={() => onToggleFavorite(game.id)}
                aria-label={isFav ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
                aria-pressed={isFav}
                title={isFav ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
              >
                {isFav ? '★' : '☆'}
              </button>
            </div>

            <div className={css.meta}>
              <span className={css.badge}>{game.platform}</span>
              {isFav && <span className={css.favPill}>{t('gameCard.favorite')}</span>}
              <span className={css.dot} aria-hidden="true">•</span>
              <span className={css.muted}>
                {game.installed ? t('gameCard.installed') : t('gameCard.notInstalled')}
              </span>
              {game.sizeOnDisk != null && game.sizeOnDisk > 0 && (
                <>
                  <span className={css.dot} aria-hidden="true">•</span>
                  <span className={css.muted}>{fmtBytes(game.sizeOnDisk)}</span>
                </>
              )}
            </div>
          </div>

          <div className={css.actions}>
            <button
              type="button"
              className={[css.play, isLaunching ? css.playLaunching : ''].join(' ')}
              onClick={() => onPlay(game)}
              disabled={!canPlay || isLaunching}
              title={!canPlay ? t('gameCard.notAvailable') : t('gameCard.launch')}
            >
              {isLaunching ? t('gameCard.opening') : t('gameCard.play')}
            </button>

            {game.installPath && (
              <button
                type="button"
                className={css.folder}
                onClick={() => void tauriInvoke('open_folder', { path: game.installPath })}
                aria-label={t('gameCard.openFolder')}
                title={t('gameCard.openFolder')}
              >
                📁
              </button>
            )}

            <button
              type="button"
              className={css.remove}
              onClick={async () => { const ok = await confirm(t('gameCard.removeConfirm', { name: game.title }), { danger: true }); if (ok) onRemove(game.id); }}
              aria-label={t('gameCard.remove')}
              title={t('gameCard.remove')}
            >
              ✕
            </button>
          </div>
        </div>

        <div className={css.footer}>{lastPlayedLabel}</div>
      </div>

      {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
    </article>
  );
}
