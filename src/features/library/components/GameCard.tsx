import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../types';
import css from './GameCard.module.css';
import { useDialog } from '../../../hooks/useDialog';
import { AppDialog } from '../../../components/AppDialog/AppDialog';
import { fetchCoverArt, clearCoverCacheEntry, steamCdnUrl, steamPortraitUrl } from '../services/coverArtService';
import { tauriInvoke } from '../../../services/tauri';
import { useEnLigne, useEpoqueReseau } from '../../system/useReseau';
import { formaterDate, formaterTaille } from '../../../i18n/formats';
import { nomPlateforme } from '../../../i18n/plateformes';
import { EditeurTags } from '../../../components/Tags/Tags';

type Props = {
  game: Game;
  onRemove: (id: string) => void;
  onPlay: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onSetImageUrl: (id: string, url: string | null) => void;
  onSetTags: (id: string, tags: string[]) => void;
  /** Tags déjà posés ailleurs, proposés en premier. */
  tagsConnus: readonly string[];
  // Indique si une clé SteamGridDB est configurée — la clé elle-même reste
  // dans le coffre système et n'est jamais transmise au frontend
  sgdbKeySet: boolean;
  isLaunching?: boolean;
};

export function GameCard({
  game, onRemove, onPlay, onToggleFavorite, onSetImageUrl, onSetTags, tagsConnus,
  sgdbKeySet, isLaunching = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const { dlgState, closeDialog, prompt, confirm } = useDialog();

  const canPlay = Boolean(game.installed && game.launchUrl);
  const isFav = Boolean(game.favorite);

  const lastPlayedLabel = useMemo(() => {
    if (!game.lastPlayedAt) return t('gameCard.neverPlayed');
    const d = new Date(game.lastPlayedAt);
    if (Number.isNaN(d.getTime())) return t('gameCard.unknownDate');
    return t('gameCard.lastPlayed', { date: formaterDate(d, i18n.language) });
  }, [game.lastPlayedAt, t, i18n.language]);

  const isSteam = game.platform === 'Steam';

  // Résout l'appId Steam — game.steamAppId peut être null pour les jeux anciennement
  // stockés avant l'ajout du champ. On le reextrait depuis game.id (ex: "steam-552100").
  const resolvedSteamAppId =
    game.steamAppId ??
    (isSteam && game.id.startsWith('steam-') ? game.id.slice('steam-'.length) : null);

  // Pour les jeux Steam, l'URL CDN est toujours calculable directement depuis l'appId.
  // On ne passe jamais par le cache pour éviter que handleImgError ne la supprime.
  const steamDirectUrl = resolvedSteamAppId ? steamCdnUrl(resolvedSteamAppId) : null;

  // Source résolue, étiquetée par l'identifiant du jeu : la carte est réutilisée
  // d'un jeu à l'autre sans être remontée, l'étiquette garantit qu'on n'affiche
  // jamais l'image du jeu précédent. Elle rend aussi inutile la réinitialisation
  // par effet, qui provoquait un rendu en cascade.
  //
  // L'étiquette porte aussi **l'époque du réseau** : au retour du wifi, elle ne
  // correspond plus, et la chaîne repart de l'adresse Steam calculée. C'est ce
  // qui manquait — hors ligne, la jaquette échouait, et plus rien ne la
  // relançait, même en actualisant la bibliothèque.
  const enLigne = useEnLigne();
  const epoque = useEpoqueReseau();
  const [resolved, setResolved] = useState<
    { id: string; epoque: number; src: string | null } | null
  >(null);
  const imgSrc = resolved?.id === game.id && resolved.epoque === epoque
    ? resolved.src
    : steamDirectUrl;

  // Image personnalisée qui ne se charge pas : retenue par son adresse, pour
  // qu'on cesse de la réclamer. Sans cela le cadre restait vide — la bannière
  // s'obstinait sur une URL morte et la lettre de repli n'apparaissait jamais.
  const [imageKo, setImageKo] = useState<string | null>(null);
  const imagePerso = game.customImageUrl && game.customImageUrl !== imageKo
    ? game.customImageUrl
    : null;

  const bannerUrl = imagePerso ?? imgSrc;
  const showFallback = !bannerUrl;

  const setImgSrc = useCallback(
    (src: string | null) => setResolved({ id: game.id, epoque, src }),
    [game.id, epoque],
  );

  // Seul le cas non-Steam demande un aller-retour réseau : pour Steam, l'URL
  // du CDN se calcule directement depuis l'appId.
  useEffect(() => {
    if (game.customImageUrl) return;
    if (isSteam && resolvedSteamAppId) return;
    if (!isSteam && sgdbKeySet) {
      let cancelled = false;
      fetchCoverArt(game).then((url) => {
        if (!cancelled) setResolved({ id: game.id, epoque, src: url ?? null });
      });
      return () => { cancelled = true; };
    }
    // `epoque` relance la demande au retour du réseau.
  }, [game.id, game.title, game.customImageUrl, resolvedSteamAppId, isSteam, sgdbKeySet, epoque]);

  function handleImgError() {
    // Hors ligne, l'image n'a pas échoué : elle n'a pas pu être demandée.
    // Enchaîner sur SteamGridDB jetterait au passage une adresse parfaitement
    // valable, et la jaquette ne reviendrait plus de la session.
    if (!enLigne) {
      setImgSrc(null);
      return;
    }
    if (imagePerso) { setImageKo(imagePerso); return; }

    if (isSteam && resolvedSteamAppId) {
      // header.jpg a échoué → essayer library_600x900.jpg en fallback
      const portrait = steamPortraitUrl(resolvedSteamAppId);
      if (imgSrc !== portrait) {
        setImgSrc(portrait);
      } else {
        // Les deux images de Valve ont échoué : il n'y en a pas pour ce jeu.
        // `sansSteam` le dit au service, qui rendait sinon l'adresse morte
        // qu'on vient d'essayer — l'image se rechargeait alors sans fin.
        if (sgdbKeySet) {
          fetchCoverArt(game, { sansSteam: true }).then((url) =>
            setImgSrc(url && url !== steamDirectUrl && url !== portrait ? url : null),
          );
        } else {
          setImgSrc(null);
        }
      }
      return;
    }

    // Non-Steam : vider le cache et retenter via SteamGridDB
    clearCoverCacheEntry(game.title.toLowerCase());
    if (sgdbKeySet) {
      fetchCoverArt(game).then((url) => setImgSrc(url ?? null));
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
              <span className={css.badge}>{nomPlateforme(game.platform, t)}</span>
              {isFav && <span className={css.favPill}>{t('gameCard.favorite')}</span>}
              <span className={css.dot} aria-hidden="true">•</span>
              <span className={css.muted}>
                {game.installed ? t('gameCard.installed') : t('gameCard.notInstalled')}
              </span>
              {game.sizeOnDisk != null && game.sizeOnDisk > 0 && (
                <>
                  <span className={css.dot} aria-hidden="true">•</span>
                  <span className={css.muted}>{formaterTaille(game.sizeOnDisk, i18n.language)}</span>
                </>
              )}
            </div>

            <EditeurTags
              tags={game.tags ?? []}
              connus={tagsConnus}
              onChange={(tags) => onSetTags(game.id, tags)}
            />
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
