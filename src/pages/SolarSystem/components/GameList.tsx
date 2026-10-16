import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Game } from '../../../features/types';
import {
  fetchCoverArt,
  steamCdnUrl,
  steamPortraitUrl,
} from '../../../features/library/services/coverArtService';
import { PLATFORM_CSS } from '../constants';
import { useDiskSpace } from '../../../features/system/useDiskSpace';
import { useEnLigne, useEpoqueReseau } from '../../../features/system/useReseau';
import { formaterTaille } from '../../../i18n/formats';
import { nomPlateforme } from '../../../i18n/plateformes';
import { useCalques } from '../../../features/calques/useCalques';
import { useAppSettings } from '../../../features/settings/context/useAppSettings';
import { cleSysteme, estSystemePerso, jeuxDuSysteme, type SystemePerso } from '../lib/customSystems';
import { IconeSysteme } from './IconeSysteme';
import { IconeHud } from '../../../components/IconeHud/IconeHud';
import { libelleTag } from '../../../components/Tags/Tags';
import { aLeTag, tagsDeLaBibliotheque } from '../../../features/library/services/tags';
import { scannerTousLesLaunchers } from '../../../features/library/services/libraryScan';
import { useToast } from '../../../features/toast/ToastContext';
import { PoigneeLargeur } from './PoigneeLargeur';
import { LARGEUR_LISTE, LARGEUR_RAIL, type Colonne } from '../lib/largeurs';
import css from './GameList.module.css';

/** Identifiant Steam, qu'il soit stocké explicitement ou déductible de l'id. */
function steamAppIdOf(g: Game): string | null {
  return (
    g.steamAppId ??
    (g.platform === 'Steam' && g.id.startsWith('steam-') ? g.id.slice('steam-'.length) : null)
  );
}

/**
 * Vignette du jeu. Même chaîne de résolution que le panneau de détail :
 * image utilisateur → CDN Steam (bannière puis portrait) → SteamGridDB.
 *
 * Le repli SteamGridDB est indispensable : sans lui, aucun jeu non-Steam
 * n'avait de vignette, puisque l'URL du CDN Valve ne se calcule qu'à partir
 * d'un appId.
 */
function Thumb({ game, color, sgdbKeySet }: { game: Game; color: string; sgdbKeySet: boolean }) {
  const appId = steamAppIdOf(game);
  const depart = game.customImageUrl ?? (appId ? steamCdnUrl(appId) : null);
  const enLigne = useEnLigne();
  const epoque = useEpoqueReseau();

  // Source résolue, **étiquetée par l'époque du réseau**.
  //
  // C'est le défaut à réparer : hors ligne l'image échouait, la vignette
  // retombait sur sa lettre, et plus rien ne la relançait — même en
  // actualisant la bibliothèque, puisque le service avait retenu l'échec comme
  // une absence de jaquette. Au retour du wifi, l'époque change, l'étiquette ne
  // correspond plus, et la vignette repart de son adresse de départ. Étiqueter
  // plutôt que remettre à zéro dans un effet : c'est ce que fait déjà la fiche
  // de jeu, et cela évite un rendu en cascade.
  const [resolu, setResolu] = useState<{ epoque: number; src: string | null } | null>(null);
  const src = resolu && resolu.epoque === epoque ? resolu.src : depart;
  const setSrc = (valeur: string | null) => setResolu({ epoque, src: valeur });

  // Jeux sans appId Steam : la jaquette ne peut venir que de SteamGridDB.
  // Le service met en cache par titre, donc une entrée déjà vue est gratuite.
  useEffect(() => {
    if (game.customImageUrl || appId || !sgdbKeySet) return;
    let cancelled = false;
    fetchCoverArt(game).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => { cancelled = true; };
    // `epoque` est dans les dépendances pour que le retour du réseau relance la
    // demande, et non pour être lu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.title, game.customImageUrl, appId, sgdbKeySet, epoque]);

  function handleError() {
    // Hors ligne, l'image n'a pas échoué : elle n'a pas pu être demandée.
    //
    // Sans cette porte, on enchaînait sur SteamGridDB, qui jetait l'adresse
    // Steam du cache persistant au passage — une coupure de réseau coûtait
    // ainsi une jaquette parfaitement valable.
    if (!enLigne) {
      setSrc(null);
      return;
    }
    // La bannière Steam manque parfois : tenter le portrait, puis SteamGridDB
    if (appId && src === steamCdnUrl(appId)) {
      setSrc(steamPortraitUrl(appId));
      return;
    }
    if (sgdbKeySet) {
      // `sansSteam` quand l'identifiant est en cause : sans lui, le service
      // rendait l'adresse morte de Valve à qui venait de la voir échouer, et
      // la vignette se rechargeait en boucle.
      fetchCoverArt(game, { sansSteam: Boolean(appId) }).then((url) =>
        setSrc(url && url !== src ? url : null),
      );
      return;
    }
    setSrc(null);
  }

  if (!src) {
    return (
      <div
        className={css.thumbFallback}
        style={{ background: `linear-gradient(135deg,${color}55,${color}18)` }}
      >
        {game.title.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <img src={src} alt="" className={css.thumb} onError={handleError} draggable={false} />
  );
}

type Props = {
  /** Jeux du launcher consulté — pas forcément celui affiché en 3D. */
  games: Game[];
  /** Toute la bibliothèque : la recherche ne s'arrête pas au launcher courant. */
  allGames: Game[];
  selectedId: string | null;
  /** Launcher affiché, en liste comme en 3D — les deux ne divergent plus. */
  platform: string;
  /** Launchers présents dans la bibliothèque, pour la barre de sélection. */
  platforms: Array<{ name: string; count: number }>;
  /** Icône de chaque launcher, quand elle a pu être extraite. */
  icons: Record<string, string>;
  /** Une clé SteamGridDB est configurée (la clé reste côté Rust). */
  sgdbKeySet: boolean;
  /**
   * Sélectionne un jeu. Le jeu porte sa plateforme : c'est à l'appelant de
   * décider s'il suffit de viser la planète ou s'il faut d'abord voyager.
   */
  onPickGame: (game: Game) => void;
  /** Mène la caméra jusqu'à ce launcher, et la liste suit. */
  onPickPlatform: (platform: string) => void;
  /** Nom affiché en tête de liste : le launcher, ou le système personnalisé. */
  titre: string;
  /** Teinte du système consulté. */
  teinte: string;
  /** Systèmes personnalisés, rangés dans la barre après les launchers. */
  systemes: SystemePerso[];
  onCreerSysteme: () => void;
  /** Ouvre la modification du système personnalisé consulté. */
  onModifierSysteme: () => void;
  /** Système personnalisé consulté : ajoute un jeu trouvé ailleurs. */
  onAjouterAuSysteme?: (game: Game) => void;
  /** Système personnalisé consulté : retire un de ses jeux. */
  onRetirerDuSysteme?: (game: Game) => void;
  /** Largeurs en vigueur, poignées comprises. */
  largeurListe: number;
  largeurRail: number;
  onLargeurListe: (v: number, enregistrer: boolean) => void;
  onLargeurRail: (v: number, enregistrer: boolean) => void;
  onLargeursParDefaut: (colonne: Colonne) => void;
  /** Champ de recherche, que `Ctrl+F` ramène sous la main depuis la page. */
  rechercheRef?: RefObject<HTMLInputElement | null>;
};

/** Petit bouton porté par une ligne, révélé au survol. */
type ActionLigne = { symbole: string; libelle: string; faire: (game: Game) => void };

/** Au-delà, la liste des résultats venus d'ailleurs cesse d'être consultable. */
const MAX_AILLEURS = 40;

/**
 * Pages rappelables dans la barre, dans l'ordre où elles s'y rangent.
 *
 * Leurs icônes sont celles que l'application dessine déjà pour les systèmes
 * personnalisés : une manette pour la bibliothèque de jeux, une fusée pour les
 * launchers, une note pour la musique.
 */
const PAGES_RAPPELABLES = [
  { to: '/library', reglage: 'showLibrary', cle: 'nav.library', icone: 'manette' },
  { to: '/launchers', reglage: 'showLaunchers', cle: 'nav.launchers', icone: 'fusee' },
] as const;

/**
 * Liste des jeux du launcher courant, à droite de la scène.
 *
 * Cliquer une entrée produit exactement le même effet qu'un clic sur la
 * planète : la caméra s'en approche et le panneau de détail s'ouvre.
 */
export function GameList({
  games, allGames, selectedId, platform, platforms, icons,
  sgdbKeySet, onPickGame, onPickPlatform,
  titre, teinte, systemes, onCreerSysteme, onModifierSysteme,
  onAjouterAuSysteme, onRetirerDuSysteme,
  largeurListe, largeurRail, onLargeurListe, onLargeurRail, onLargeursParDefaut,
  rechercheRef,
}: Props) {
  const { t, i18n } = useTranslation();
  const calques = useCalques();
  const { settings } = useAppSettings();
  const toast = useToast();
  const [actualisation, setActualisation] = useState(false);

  /** Rescanne les launchers et dit ce qui a changé. */
  async function actualiser() {
    setActualisation(true);
    try {
      const r = await scannerTousLesLaunchers();
      if (r.ajoutes > 0) toast.success(t('solar.refreshAdded', { count: r.ajoutes }));
      else if (r.modifiee) toast.success(t('solar.refreshUpdated'));
      else toast.info(t('solar.refreshUpToDate'));
    } finally {
      setActualisation(false);
    }
  }
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const color = teinte;
  const perso = estSystemePerso(platform);
  const retrait: ActionLigne | undefined = perso && onRetirerDuSysteme
    ? { symbole: '−', libelle: t('solar.removeFromSystem'), faire: onRetirerDuSysteme }
    : undefined;
  const ajout: ActionLigne | undefined = perso && onAjouterAuSysteme
    ? { symbole: '+', libelle: t('solar.addToSystem'), faire: onAjouterAuSysteme }
    : undefined;
  const disque = useDiskSpace();

  // Même ordre que les orbites : la n-ième entrée est la n-ième planète.
  /**
   * Tags portés par les jeux de ce système. Le filtre ne propose que ceux-là :
   * un tag qui ne désigne aucun jeu d'ici ne donnerait qu'une liste vide.
   */
  const tagsDuSysteme = useMemo(() => tagsDeLaBibliotheque(games), [games]);

  /**
   * Nombre de jeux de chaque système personnalisé, résolu sur la bibliothèque.
   *
   * Compter les identifiants enregistrés annonçait des jeux qui n'existent
   * plus — et zéro pour un système de tag, qui n'en garde aucun.
   */
  const comptesSystemes = useMemo(() => {
    const parId = new Map(allGames.map((g) => [g.id, g]));
    return new Map(systemes.map((s) => [cleSysteme(s), jeuxDuSysteme(s, parId).length]));
  }, [allGames, systemes]);
  const [tagChoisi, setTagChoisi] = useState<string | null>(null);
  // Un tag qui disparaît — dernier jeu retiré, ou changement de système —
  // ne doit pas laisser la liste filtrée sur rien.
  const tagActif = tagChoisi && tagsDuSysteme.some((x) => x.tag === tagChoisi) ? tagChoisi : null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let liste = tagActif ? games.filter((g) => aLeTag(g, tagActif)) : games;
    if (q) liste = liste.filter((g) => g.title.toLowerCase().includes(q));
    return liste;
  }, [games, query, tagActif]);

  /**
   * Les deux groupes de la liste : ce qui est installé, et ce qui ne l'est plus.
   *
   * Un jeu désinstallé n'est pas retiré de la bibliothèque — on garde son
   * favori, sa date de dernière partie et son image. Mais mêlé aux autres, il
   * laisse croire qu'on peut y jouer. Les séparer évite le clic déçu.
   *
   * L'ordre au sein de chaque groupe est celui de `games`, donc celui des
   * orbites : le rang affiché reste celui de la planète.
   */
  const installes = useMemo(() => shown.filter((g) => g.installed !== false), [shown]);
  const desinstalles = useMemo(() => shown.filter((g) => g.installed === false), [shown]);

  /**
   * Résultats venus des autres launchers.
   *
   * Chercher un jeu et ne rien trouver parce qu'il est rangé sous un autre
   * launcher est le genre d'absence qu'on impute à l'application plutôt qu'au
   * filtre. La recherche parcourt donc toute la bibliothèque, en distinguant
   * ce qui est ici de ce qui est ailleurs — sans quoi on ne saurait plus quelle
   * entrée correspond à quelle planète.
   */
  const ailleurs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Ce qui figure déjà dans la liste n'est pas « ailleurs ». Pour un launcher
    // cela revient à exclure sa plateforme ; pour un système personnalisé, la
    // plateforme du jeu ne dit rien de sa présence ici.
    const ici = new Set(games.map((g) => g.id));
    return allGames
      .filter((g) => !ici.has(g.id) && g.title.toLowerCase().includes(q))
      .slice(0, MAX_AILLEURS);
  }, [allGames, games, query]);

  return (
    <>
      {/* Frontières saisissables, une par colonne. */}
      <PoigneeLargeur
        valeur={largeurListe}
        min={LARGEUR_LISTE.min}
        max={LARGEUR_LISTE.max}
        libelle={t('solar.listWidth')}
        droite="var(--side-w, 0px)"
        onChange={(v) => onLargeurListe(v, false)}
        onFin={(v) => onLargeurListe(v, true)}
        onDefaut={() => onLargeursParDefaut('liste')}
      />
      <PoigneeLargeur
        valeur={largeurRail}
        min={LARGEUR_RAIL.min}
        max={LARGEUR_RAIL.max}
        libelle={t('solar.railWidth')}
        droite="var(--rail-w, 0px)"
        onChange={(v) => onLargeurRail(v, false)}
        onFin={(v) => onLargeurRail(v, true)}
        onDefaut={() => onLargeursParDefaut('rail')}
      />

      <aside className={css.list}>
        <div className={css.head}>
          <h2 className={css.headTitle} style={{ '--teinte': color } as CSSProperties}>
            {titre}
          </h2>
          <div className={css.headActions}>
            {/* Un launcher se règle aussi : soleil, orbites, planètes. */}
            {(perso || games.length > 0) && (
              <button type="button" className={css.headModifier} onClick={onModifierSysteme}>
                {t('common.edit')}
              </button>
            )}
            {/* Le scan tourne déjà au démarrage et au retour sur la fenêtre ;
                ce bouton est pour qui vient d'installer ou de désinstaller
                et ne veut pas attendre. */}
            <button
              type="button"
              className={actualisation ? `${css.headActualiser} ${css.headActualiserEnCours}` : css.headActualiser}
              onClick={() => void actualiser()}
              disabled={actualisation}
              title={actualisation ? t('solar.refreshing') : t('solar.refresh')}
              aria-label={actualisation ? t('solar.refreshing') : t('solar.refresh')}
            >
              <IconeHud nom="actualiser" />
            </button>
          </div>
        </div>

        {/* Occupation du disque système — pas de tous les disques : un jeu
            installé ailleurs ne se verrait pas ici, et l'étiquette le dit. */}
        {disque && disque.total > 0 && (
          <div className={css.disque} title={t('solar.drive', { drive: disque.lecteur })}>
            <div className={css.disqueLigne}>
              <span>{t('library.diskUsed', { size: formaterTaille(disque.total - disque.libre, i18n.language) })}</span>
              <span className={css.disqueLibre}>
                {t('library.diskFree', { free: formaterTaille(disque.libre, i18n.language) })}
              </span>
            </div>
            <div
              className={css.disqueJauge}
              style={{ '--part': `${((disque.total - disque.libre) / disque.total) * 100}%` } as CSSProperties}
              aria-hidden="true"
            />
          </div>
        )}

        <input
          ref={rechercheRef}
          className={css.search}
          placeholder={t('nav.searchPlaceholder')}
          aria-label={t('nav.searchLabel')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {tagsDuSysteme.length > 0 && (
          <div className={css.tags} role="group" aria-label={t('filters.tag')}>
            <button
              type="button"
              className={tagActif === null ? `${css.tagFiltre} ${css.tagFiltreActif}` : css.tagFiltre}
              onClick={() => setTagChoisi(null)}
              aria-pressed={tagActif === null}
            >
              {t('tags.filterNone')}
            </button>
            {tagsDuSysteme.map(({ tag, nombre }) => (
              <button
                key={tag}
                type="button"
                className={tagActif === tag ? `${css.tagFiltre} ${css.tagFiltreActif}` : css.tagFiltre}
                onClick={() => setTagChoisi(tagActif === tag ? null : tag)}
                aria-pressed={tagActif === tag}
              >
                {libelleTag(tag, t)} <span className={css.tagNombre}>{nombre}</span>
              </button>
            ))}
          </div>
        )}

        <ul className={css.items}>
          {installes.map((g) => (
            <Ligne
              key={g.id}
              game={g}
              // Le rang dans la liste correspond au rang orbital.
              orbit={games.indexOf(g) + 1}
              selected={g.id === selectedId}
              sgdbKeySet={sgdbKeySet}
              onPick={onPickGame}
              action={retrait}
            />
          ))}

          {desinstalles.length > 0 && (
            <>
              <li className={css.groupe}>
                {t('solar.uninstalled')}
                <span className={css.groupeCompte}>{desinstalles.length}</span>
              </li>
              {desinstalles.map((g) => (
                <Ligne
                  key={g.id}
                  game={g}
                  orbit={games.indexOf(g) + 1}
                  selected={g.id === selectedId}
                  sgdbKeySet={sgdbKeySet}
                  onPick={onPickGame}
                  action={retrait}
                />
              ))}
            </>
          )}

          {ailleurs.length > 0 && (
            <>
              <li className={css.groupe}>{perso ? t('solar.outsideSystem') : t('solar.otherLaunchers')}</li>
              {ailleurs.map((g) => (
                <Ligne
                  key={g.id}
                  game={g}
                  orbit={null}
                  selected={false}
                  sgdbKeySet={sgdbKeySet}
                  onPick={onPickGame}
                  action={ajout}
                />
              ))}
            </>
          )}

          {shown.length === 0 && ailleurs.length === 0 && (
            <li className={css.empty}>{t('library.noResultsTitle')}</li>
          )}
        </ul>
      </aside>

      {/* Barre des launchers, adossée au bord droit.

          Hors de l'`aside` : les deux colonnes se règlent en largeur
          séparément, chacune par sa propre poignée. */}
      <nav className={css.rail} aria-label={t('nav.launchers')}>
        {platforms.map((p) => {
          const teinte = PLATFORM_CSS[p.name] ?? '#7a8a9a';
          const icone = icons[p.name];
          return (
            <button
              key={p.name}
              type="button"
              className={[
                css.railBtn,
                p.name === platform ? css.railBtnActive : '',
              ].filter(Boolean).join(' ')}
              style={{ '--teinte': teinte } as CSSProperties}
              onClick={() => onPickPlatform(p.name)}
              aria-current={p.name === platform}
              title={t('solar.railItem', {
                name: nomPlateforme(p.name, t),
                games: t('library.gameCount', { count: p.count }),
              })}
            >
              {icone
                ? <img src={icone} alt="" className={css.railIcon} draggable={false} />
                : <span className={css.railInitiale}>{nomPlateforme(p.name, t).slice(0, 1).toUpperCase()}</span>}
            </button>
          );
        })}

        {systemes.length > 0 && <span className={css.railSeparateur} aria-hidden="true" />}

        {systemes.map((s) => {
          const cle = cleSysteme(s);
          return (
            <button
              key={cle}
              type="button"
              className={[css.railBtn, cle === platform ? css.railBtnActive : ''].filter(Boolean).join(' ')}
              style={{ '--teinte': s.couleur } as CSSProperties}
              onClick={() => onPickPlatform(cle)}
              aria-current={cle === platform}
              title={t('solar.railItem', {
                name: s.nom,
                games: t('library.gameCount', { count: comptesSystemes.get(cle) ?? 0 }),
              })}
            >
              <IconeSysteme nom={s.icone} image={s.image} couleur={s.couleur} className={css.railIcon} />
            </button>
          );
        })}

        <button
          type="button"
          className={css.railAjout}
          onClick={onCreerSysteme}
          title={t('solar.createSystem')}
          aria-label={t('solar.createSystem')}
        >
          <svg viewBox="0 0 24 24" className={css.railAjoutIcone} aria-hidden="true">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Ce qui règle l'application, poussé en bas : les systèmes occupent le
            haut de la barre, le reste vit sous un trait. */}
        <span className={css.railEspace} aria-hidden="true" />
        <span className={css.railSeparateur} aria-hidden="true" />

        {/* Pages que le système solaire n'a pas encore absorbées. Masquées par
            défaut, rappelées une à une depuis les réglages. */}
        {PAGES_RAPPELABLES.filter((p) => settings[p.reglage]).map((p) => (
          <button
            key={p.to}
            type="button"
            className={css.railReglages}
            onClick={() => navigate(p.to)}
            title={t(p.cle)}
            aria-label={t(p.cle)}
            aria-current={location.pathname === p.to}
          >
            <IconeSysteme nom={p.icone} couleur="currentColor" className={css.railAjoutIcone} />
          </button>
        ))}
        {/* La musique se pose sur la vue, elle aussi : choisir un album ne doit
            pas faire quitter ce qu'on regarde. */}
        <button
          type="button"
          className={css.railReglages}
          onClick={() => calques.basculer('musique')}
          title={t('nav.music')}
          aria-label={t('nav.music')}
          aria-expanded={calques.ouvert === 'musique'}
        >
          <IconeSysteme nom="musique" couleur="currentColor" className={css.railAjoutIcone} />
        </button>

        <button
          type="button"
          className={css.railReglages}
          onClick={() => calques.basculer('reglages')}
          title={t('nav.settings')}
          aria-label={t('nav.settings')}
          aria-expanded={calques.ouvert === 'reglages'}
        >
          {/* Trois curseurs plutôt qu'une roue dentée : c'est de curseurs et
              d'interrupteurs qu'est faite la page qu'il ouvre. */}
          <svg viewBox="0 0 24 24" className={css.railAjoutIcone} aria-hidden="true">
            <path
              d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h6M16 17h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="15" cy="7" r="2.2" fill="currentColor" />
            <circle cx="9" cy="12" r="2.2" fill="currentColor" />
            <circle cx="13" cy="17" r="2.2" fill="currentColor" />
          </svg>
        </button>

        {/* La version vivait en pied du panneau de navigation. */}
        <span className={css.railVersion}>v{__APP_VERSION__}</span>
      </nav>
    </>
  );
}

/**
 * Une entrée de la liste.
 *
 * `orbit` vaut `null` quand la planète n'est pas à l'écran : on montre alors la
 * couleur de son launcher, seule information utile pour situer le jeu.
 */
function Ligne({
  game, orbit, selected, sgdbKeySet, onPick, action,
}: {
  game: Game;
  orbit: number | null;
  selected: boolean;
  sgdbKeySet: boolean;
  onPick: (game: Game) => void;
  action?: ActionLigne;
}) {
  const { t, i18n } = useTranslation();
  const teinte = PLATFORM_CSS[game.platform || 'Other'] ?? '#7a8a9a';
  const absent = game.installed === false;
  return (
    <li className={action ? css.ligneAvecAction : undefined}>
      <button
        type="button"
        className={[
          css.item,
          selected ? css.itemActive : '',
          absent ? css.itemAbsent : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onPick(game)}
        title={game.title}
        style={selected ? { borderColor: teinte + '88' } : undefined}
      >
        {/* La pastille porte `color` autant que `background` : sa lueur est
            tirée de `currentColor`, sans quoi elle serait blanche autour d'un
            point coloré. */}
        {orbit !== null ? (
          <span className={css.orbitNum}>{orbit}</span>
        ) : (
          <>
            <span
              className={css.puce}
              style={{ background: teinte, color: teinte }}
              aria-hidden="true"
            />
            {/* La pastille ne dit la plateforme que par sa couleur : seule
                information portée par la couleur dans toute la liste. */}
            <span className="sr-only">{nomPlateforme(game.platform, t)}</span>
          </>
        )}
        <Thumb game={game} color={teinte} sgdbKeySet={sgdbKeySet} />
        <span className={css.labels}>
          <span className={css.name}>{game.title}</span>
          <span className={css.meta}>
            {/* La taille sur disque d'un jeu désinstallé ne veut plus rien
                dire : l'espace a été rendu. On dit son état à la place. */}
            {absent
              ? t('gameCard.notInstalled')
              : game.sizeOnDisk != null && game.sizeOnDisk > 0
                ? formaterTaille(game.sizeOnDisk, i18n.language)
                : '—'}
            {game.favorite && <span className={css.fav}> ★</span>}
          </span>
        </span>
      </button>
      {/* À côté du bouton de la ligne et non dedans : un bouton dans un bouton
          n'est pas valide, et le clic sélectionnerait aussi la planète. */}
      {action && (
        <button
          type="button"
          className={css.ligneAction}
          onClick={() => action.faire(game)}
          title={action.libelle}
          aria-label={t('solar.rowAction', { action: action.libelle, title: game.title })}
        >
          {action.symbole}
        </button>
      )}
    </li>
  );
}
