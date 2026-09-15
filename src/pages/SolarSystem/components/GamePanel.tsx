import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../../features/types';
import {
  clearCoverCacheEntry,
  fetchCoverArt,
  steamCdnUrl,
  steamPortraitUrl,
} from '../../../features/library/services/coverArtService';
import { launchGame } from '../../../features/library/services/launchGame';
import { useDialog } from '../../../hooks/useDialog';
import { AppDialog } from '../../../components/AppDialog/AppDialog';
import { PLATFORM_CSS } from '../constants';
import { tauriInvoke } from '../../../services/tauri';
import { formaterDate, formaterTaille } from '../../../i18n/formats';
import { nomPlateforme } from '../../../i18n/plateformes';
import css from './GamePanel.module.css';
import { IconeHud } from '../../../components/IconeHud/IconeHud';

type Props = {
  game: Game;
  /** Une clé SteamGridDB est configurée (la clé elle-même reste côté Rust). */
  sgdbKeySet: boolean;
  onClose: () => void;
  onUpdate: (updated: Game) => void;
  onRemove: (id: string) => void;
};

/**
 * Carte de détail flottante, ancrée à la planète sélectionnée — reprend les
 * fonctionnalités de la carte de bibliothèque. Son placement à l'écran est
 * l'affaire de la scène 3D (updatePopupAnchor dans useSolarScene) : elle-même
 * ne connaît que son contenu.
 */
export function GamePanel({ game, sgdbKeySet, onClose, onUpdate, onRemove }: Props) {
  const { t, i18n } = useTranslation();
  const { dlgState, closeDialog, prompt, confirm } = useDialog();

  const isSteam = game.platform === 'Steam';
  const resolvedAppId =
    game.steamAppId ??
    (isSteam && game.id.startsWith('steam-') ? game.id.slice('steam-'.length) : null);

  const [imgSrc, setImgSrc] = useState<string | null>(
    resolvedAppId ? steamCdnUrl(resolvedAppId) : null,
  );
  const [launching, setLaunching] = useState(false);

  const bannerUrl = game.customImageUrl ?? imgSrc;
  const showFallback = !bannerUrl;
  const col = PLATFORM_CSS[game.platform] ?? '#7a8a9a';
  const canPlay = Boolean(game.installed && game.launchUrl);

  useEffect(() => {
    if (game.customImageUrl) return;
    if (isSteam && resolvedAppId) {
      setImgSrc(steamCdnUrl(resolvedAppId));
      return;
    }
    if (!isSteam && sgdbKeySet) {
      let cancelled = false;
      fetchCoverArt(game.title).then((url) => {
        if (!cancelled) setImgSrc(url ?? null);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [game.id, game.title, game.customImageUrl, resolvedAppId, isSteam, sgdbKeySet]);

  function handleImgError() {
    if (game.customImageUrl) {
      setImgSrc(null);
      return;
    }
    if (isSteam && resolvedAppId) {
      const portrait = steamPortraitUrl(resolvedAppId);
      if (imgSrc !== portrait) {
        setImgSrc(portrait);
        return;
      }
      if (sgdbKeySet) fetchCoverArt(game.title).then((url) => setImgSrc(url ?? null));
      else setImgSrc(null);
      return;
    }
    clearCoverCacheEntry(game.title.toLowerCase());
    if (sgdbKeySet) fetchCoverArt(game.title).then((url) => setImgSrc(url ?? null));
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
    try {
      await launchGame(game);
    } finally {
      setLaunching(false);
    }
  }

  async function handleRemove() {
    const ok = await confirm(t('gameCard.removeConfirm', { name: game.title }), { danger: true });
    if (ok) {
      onRemove(game.id);
      onClose();
    }
  }

  const lastPlayedLabel = useMemo(() => {
    if (!game.lastPlayedAt) return t('gameCard.neverPlayed');
    const d = new Date(game.lastPlayedAt);
    if (Number.isNaN(d.getTime())) return t('gameCard.unknownDate');
    return t('gameCard.lastPlayed', { date: formaterDate(d, i18n.language) });
  }, [game.lastPlayedAt, t, i18n.language]);

  return (
    <div className={css.panel}>
      {/* Bannière — même ratio 460/215 que la carte bibliothèque */}
      <div className={css.banner}>
        {!showFallback ? (
          <>
            <img src={bannerUrl!} alt="" className={css.bannerImg} onError={handleImgError} />
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
          </>
        ) : (
          <div
            className={css.bannerFallback}
            style={{ background: `linear-gradient(135deg,${col}44,${col}11)` }}
          >
            <span className={css.bannerLetter}>{game.title.slice(0, 1).toUpperCase()}</span>
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
        <div className={css.bannerGrad} />
        <button className={css.close} onClick={onClose} aria-label={t('common.close')}>
          ✕
        </button>
      </div>

      <div className={css.body}>
        <div className={css.titleRow}>
          <h2 className={css.title}>{game.title}</h2>
          <button
            type="button"
            className={[css.favBtn, game.favorite ? css.favBtnActive : ''].join(' ')}
            onClick={() => onUpdate({ ...game, favorite: !game.favorite })}
            aria-label={game.favorite ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
            title={game.favorite ? t('gameCard.removeFavorite') : t('gameCard.addFavorite')}
          >
            {game.favorite ? '★' : '☆'}
          </button>
        </div>

        <div className={css.meta}>
          <span
            className={css.badge}
            style={{ background: col + '28', borderColor: col + '55', color: col }}
          >
            {nomPlateforme(game.platform, t)}
          </span>
          {game.favorite && <span className={css.favPill}>{t('gameCard.favorite')}</span>}
          <span className={css.dot}>•</span>
          <span className={css.muted}>
            {game.installed ? t('gameCard.installed') : t('gameCard.notInstalled')}
          </span>
          {game.sizeOnDisk != null && game.sizeOnDisk > 0 && (
            <>
              <span className={css.dot}>•</span>
              <span className={css.muted}>{formaterTaille(game.sizeOnDisk, i18n.language)}</span>
            </>
          )}
        </div>

        {/* Rangée pleine largeur : le titre garde toute la sienne au-dessus. */}
        <div className={css.actions}>
          <button
            type="button"
            className={[css.play, launching ? css.playLaunching : ''].join(' ')}
            onClick={handlePlay}
            disabled={!canPlay || launching}
            title={!canPlay ? t('gameCard.notAvailable') : t('gameCard.launch')}
          >
            {launching ? t('gameCard.opening') : t('gameCard.play')}
          </button>

          {game.installPath && (
            <button
              type="button"
              className={css.folder}
              onClick={() => void tauriInvoke('open_folder', { path: game.installPath })}
              title={t('gameCard.openFolder')}
            >
              <IconeHud nom="dossier" />
            </button>
          )}

          <button
            type="button"
            className={css.remove}
            onClick={handleRemove}
            title={t('gameCard.remove')}
          >
            ✕
          </button>
        </div>

        <div className={css.lastPlayed}>{lastPlayedLabel}</div>
      </div>

      {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
    </div>
  );
}
