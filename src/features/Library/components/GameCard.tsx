import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Game } from '../../types';
import css from './GameCard.module.css';
import { fetchRawgImage, setRawgCacheEntry } from '../services/rawgService';

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onSetImageUrl: (id: string, url: string | null) => void;
  rawgApiKey: string;
  isLaunching?: boolean;
};

const lastPlayedFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function GameCard({ game, onRemove, onPlay, onToggleFavorite, onSetImageUrl, rawgApiKey, isLaunching = false }: Props) {
  const { t } = useTranslation();

  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);

  const lastPlayedLabel = useMemo(() => {
    if (!game.lastPlayedAt) return t('gameCard.neverPlayed');
    const d = new Date(game.lastPlayedAt);
    if (Number.isNaN(d.getTime())) return t('gameCard.unknownDate');
    return t('gameCard.lastPlayed', { date: lastPlayedFormatter.format(d) });
  }, [game.lastPlayedAt, t]);

  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const bannerUrl = game.customImageUrl ?? imgSrc;
  const showFallback = !bannerUrl;

  const isSteam = game.platform === 'Steam';

  // Ref pour rawgApiKey : permet au fallback Steam (sans steamAppId) de lire la clé
  // sans l'ajouter aux deps de l'effet Steam
  const rawgApiKeyRef = useRef(rawgApiKey);
  useEffect(() => { rawgApiKeyRef.current = rawgApiKey; }, [rawgApiKey]);

  // Jeux Steam :
  //  - steamAppId présent → CDN Steam, si 404 → placeholder (jamais RAWG)
  //  - steamAppId absent  → placeholder, RAWG via ref si clé dispo
  useEffect(() => {
    if (game.customImageUrl || !isSteam) return;
    if (game.steamAppId) {
      fetchRawgImage(game.title, '', game.steamAppId).then((url) => {
        setImgSrc(url ?? null);
      });
    } else if (rawgApiKeyRef.current) {
      fetchRawgImage(game.title, rawgApiKeyRef.current).then((url) => {
        setImgSrc(url ?? null);
      });
    }
  }, [game.title, game.customImageUrl, game.steamAppId, isSteam]);

  // Jeux Epic / Battle.net : RAWG avec clé API
  useEffect(() => {
    if (game.customImageUrl || isSteam) return;
    fetchRawgImage(game.title, rawgApiKey).then((url) => {
      setImgSrc(url ?? null);
    });
  }, [game.title, game.customImageUrl, isSteam, rawgApiKey]);

  function handleImgError() {
    if (!imgSrc) return;
    // Steam avec steamAppId : CDN 404 → placeholder uniquement (pas de RAWG)
    if (isSteam) {
      setImgSrc(null);
      return;
    }
    // Epic/Battle.net : fallback RAWG si clé dispo
    if (rawgApiKey) {
      fetchRawgImage(game.title, rawgApiKey).then((url) => {
        setImgSrc(url ?? null);
      });
      return;
    }
    setImgSrc(null);
  }

  function handleSetImage() {
    const current = game.customImageUrl ?? '';
    const url = window.prompt(t('gameCard.imageUrlPrompt'), current);
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
              {isLaunching ? 'Opening...' : t('gameCard.play')}
            </button>

            <button
              type="button"
              className={css.remove}
              onClick={() => { void confirm(t('gameCard.removeConfirm', { name: game.title })).then((ok) => { if (ok) onRemove(game.id); }); }}
              aria-label={t('gameCard.remove')}
              title={t('gameCard.remove')}
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
