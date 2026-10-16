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
import { desinstallerJeu, trouverDesinstalleur } from '../../../features/library/services/uninstallGame';
import { useToast } from '../../../features/toast/ToastContext';
import { useEnLigne, useEpoqueReseau } from '../../../features/system/useReseau';
import { useDialog } from '../../../hooks/useDialog';
import { AppDialog } from '../../../components/AppDialog/AppDialog';
import { PLATFORM_CSS } from '../constants';
import { tauriInvoke } from '../../../services/tauri';
import { formaterDate, formaterTaille } from '../../../i18n/formats';
import { nomPlateforme } from '../../../i18n/plateformes';
import css from './GamePanel.module.css';
import { IconeHud } from '../../../components/IconeHud/IconeHud';
import { EditeurTags } from '../../../components/Tags/Tags';

type Props = {
  game: Game;
  /** Une clé SteamGridDB est configurée (la clé elle-même reste côté Rust). */
  sgdbKeySet: boolean;
  onClose: () => void;
  onUpdate: (updated: Game) => void;
  /** Tags déjà posés ailleurs dans la bibliothèque, proposés en premier. */
  tagsConnus?: readonly string[];
  onRemove: (id: string) => void;
};

/**
 * Carte de détail flottante, ancrée à la planète sélectionnée — reprend les
 * fonctionnalités de la carte de bibliothèque. Son placement à l'écran est
 * l'affaire de la scène 3D (updatePopupAnchor dans useSolarScene) : elle-même
 * ne connaît que son contenu.
 */
export function GamePanel({ game, sgdbKeySet, onClose, onUpdate, onRemove, tagsConnus = [] }: Props) {
  const { t, i18n } = useTranslation();
  const { dlgState, closeDialog, prompt, confirm } = useDialog();
  const toast = useToast();
  const [desinstallation, setDesinstallation] = useState(false);
  /** Entrées proposées au choix quand la recherche automatique échoue. */
  const isSteam = game.platform === 'Steam';
  const resolvedAppId =
    game.steamAppId ??
    (isSteam && game.id.startsWith('steam-') ? game.id.slice('steam-'.length) : null);

  const depart = resolvedAppId ? steamCdnUrl(resolvedAppId) : null;
  const enLigne = useEnLigne();
  const epoque = useEpoqueReseau();

  // Étiquetée par l'époque du réseau : au retour du wifi, l'étiquette ne
  // correspond plus et la jaquette repart de son adresse de départ. Voir
  // `useReseau.ts` — étiqueter plutôt que remettre à zéro dans un effet.
  const [resolu, setResolu] = useState<{ epoque: number; src: string | null } | null>(null);
  const imgSrc = resolu && resolu.epoque === epoque ? resolu.src : depart;
  const setImgSrc = (valeur: string | null) => setResolu({ epoque, src: valeur });
  const [launching, setLaunching] = useState(false);
  /** Le lancement vient d'aboutir : la coche verte reste quelques secondes. */
  const [lance, setLance] = useState(false);

  useEffect(() => {
    if (!lance) return;
    const minuteur = setTimeout(() => setLance(false), 2500);
    return () => clearTimeout(minuteur);
  }, [lance]);

  // Image personnalisée qui ne se charge pas : retenue par son adresse, pour
  // qu'on cesse de la réclamer (voir `GameCard`, même repli).
  const [imageKo, setImageKo] = useState<string | null>(null);
  const imagePerso = game.customImageUrl && game.customImageUrl !== imageKo
    ? game.customImageUrl
    : null;

  const bannerUrl = imagePerso ?? imgSrc;
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
      fetchCoverArt(game).then((url) => {
        if (!cancelled) setImgSrc(url ?? null);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [game.id, game.title, game.customImageUrl, resolvedAppId, isSteam, sgdbKeySet]);


  function handleImgError() {
    // Hors ligne, l'image n'a pas échoué : elle n'a pas pu être demandée.
    // Enchaîner sur SteamGridDB jetterait au passage une adresse parfaitement
    // valable, et la jaquette ne reviendrait plus de la session.
    if (!enLigne) {
      setImgSrc(null);
      return;
    }
    if (imagePerso) {
      setImageKo(imagePerso);
      return;
    }
    if (isSteam && resolvedAppId) {
      const portrait = steamPortraitUrl(resolvedAppId);
      if (imgSrc !== portrait) {
        setImgSrc(portrait);
        return;
      }
      // Aucune image chez Valve pour cet identifiant : on le dit au service,
      // qui rendait sinon l'adresse morte qu'on vient d'essayer.
      if (sgdbKeySet) {
        fetchCoverArt(game, { sansSteam: true }).then((url) =>
          setImgSrc(url && url !== steamCdnUrl(resolvedAppId) && url !== portrait ? url : null),
        );
      } else {
        setImgSrc(null);
      }
      return;
    }
    clearCoverCacheEntry(game.title.toLowerCase());
    if (sgdbKeySet) fetchCoverArt(game).then((url) => setImgSrc(url ?? null));
    else setImgSrc(null);
  }

  async function handleSetImage() {
    const url = await prompt(t('gameCard.imageUrlPrompt'), game.customImageUrl ?? '');
    if (url === null) return;
    onUpdate({ ...game, customImageUrl: url.trim() || undefined });
    setImgSrc(null);
  }

  /**
   * Lance le jeu, et le dit.
   *
   * Le résultat du lancement était ignoré : la date de dernière partie n'était
   * jamais enregistrée depuis cette fiche — le jeu restait « Jamais joué »
   * après y avoir joué — et un échec passait inaperçu. Désormais la date est
   * notée, une coche verte confirme que le lancement est parti, et un échec
   * s'affiche avec sa raison.
   */
  async function handlePlay() {
    if (!canPlay || launching) return;
    setLaunching(true);
    try {
      const r = await launchGame(game);
      if (r.ok) {
        onUpdate({ ...game, lastPlayedAt: new Date().toISOString() });
        setLance(true);
      } else {
        toast.error(r.message);
      }
    } finally {
      setLaunching(false);
    }
  }

  /**
   * Désinstalle le jeu — ou plutôt, ouvre ce qui sait le faire.
   *
   * On cherche d'abord le désinstalleur, pour nommer dans la confirmation ce
   * qui va s'ouvrir, et pour ne rien promettre quand il n'y en a pas. Steam
   * n'a pas besoin de cette recherche : son protocole ouvre sa propre fenêtre.
   *
   * Le résultat nous échappe ensuite : c'est un autre programme qui agit, et
   * l'utilisateur peut encore annuler chez lui. Le jeu n'est donc pas retiré
   * de la bibliothèque ici — le prochain scan le marquera non installé.
   */
  async function handleUninstall() {
    if (!game.installed) {
      toast.info(t('gameCard.uninstallOnlyInstalled'));
      return;
    }
    setDesinstallation(true);
    try {
      const nom = isSteam ? 'Steam' : await trouverDesinstalleur(game);
      if (!nom) {
        // Le nom exact ou le même dossier d'installation, sinon rien : une
        // correspondance approximative désinstallerait « Portal 2 » pour
        // « Portal ». Mieux vaut le dire que de se tromper de jeu.
        toast.error(t('gameCard.uninstallNone', { name: game.title }));
        return;
      }
      const cle = isSteam ? 'gameCard.uninstallConfirmSteam' : 'gameCard.uninstallConfirm';
      if (!(await confirm(t(cle, { name: game.title }), { danger: true }))) return;

      const lance = await desinstallerJeu(game);
      toast.success(t('gameCard.uninstallStarted', { name: lance }));
      onClose();
    } catch (e) {
      toast.error(t('gameCard.uninstallFailed', { error: String(e) }));
    } finally {
      setDesinstallation(false);
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
          {game.playtimeMinutes != null && game.playtimeMinutes > 0 && (
            <>
              <span className={css.dot}>•</span>
              <span className={css.muted}>
                {game.playtimeMinutes < 60
                  ? t('gameCard.playtimeMinutes', { count: game.playtimeMinutes })
                  : t('gameCard.playtimeHours', { count: Math.round(game.playtimeMinutes / 60) })}
              </span>
            </>
          )}
        </div>

        {/* Posés à la main : état d'avancement, genre, envie. Ils suivent le
            jeu partout — filtre de la bibliothèque, liste, systèmes. */}
        <EditeurTags
          tags={game.tags ?? []}
          connus={tagsConnus}
          onChange={(tags) => onUpdate({ ...game, tags })}
        />

        {/* Rangée pleine largeur : le titre garde toute la sienne au-dessus. */}
        <div className={css.actions}>
          <button
            type="button"
            className={[css.play, launching ? css.playLaunching : '', lance ? css.playLance : ''].join(' ')}
            onClick={handlePlay}
            disabled={!canPlay || launching}
            title={!canPlay ? t('gameCard.notAvailable') : t('gameCard.launch')}
          >
            {launching ? (
              t('gameCard.opening')
            ) : lance ? (
              <span className={css.playLanceContenu}>
                <IconeHud nom="valide" />
                {t('gameCard.launched')}
              </span>
            ) : (
              t('gameCard.play')
            )}
          </button>
          {/* Annoncé aussi aux lecteurs d'écran, qui ne voient pas la coche. */}
          <span className="sr-only" role="status">
            {lance ? t('gameCard.launchedAnnounce', { name: game.title }) : ''}
          </span>

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

          {game.installed && (
            <button
              type="button"
              className={css.uninstall}
              onClick={() => void handleUninstall()}
              disabled={desinstallation}
              title={t('gameCard.uninstall')}
              aria-label={t('gameCard.uninstall')}
            >
              <IconeHud nom="desinstaller" />
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
