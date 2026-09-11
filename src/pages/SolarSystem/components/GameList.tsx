import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../../features/types';
import {
  fetchCoverArt,
  steamCdnUrl,
  steamPortraitUrl,
} from '../../../features/library/services/coverArtService';
import { PLATFORM_CSS } from '../constants';
import { formaterVolume, useDiskSpace } from '../../../features/system/useDiskSpace';
import { cleSysteme, estSystemePerso, type SystemePerso } from '../lib/customSystems';
import { IconeSysteme } from './IconeSysteme';
import { PoigneeLargeur } from './PoigneeLargeur';
import { LARGEUR_LISTE, LARGEUR_RAIL, type Colonne } from '../lib/largeurs';
import css from './GameList.module.css';

const GB = 1024 ** 3;

function fmtSize(bytes: number): string {
  return bytes >= GB
    ? `${(bytes / GB).toFixed(1)} Go`
    : `${(bytes / 1024 ** 2).toFixed(0)} Mo`;
}

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
  const [src, setSrc] = useState<string | null>(
    game.customImageUrl ?? (appId ? steamCdnUrl(appId) : null),
  );

  // Jeux sans appId Steam : la jaquette ne peut venir que de SteamGridDB.
  // Le service met en cache par titre, donc une entrée déjà vue est gratuite.
  useEffect(() => {
    if (game.customImageUrl || appId || !sgdbKeySet) return;
    let cancelled = false;
    fetchCoverArt(game.title).then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => { cancelled = true; };
  }, [game.title, game.customImageUrl, appId, sgdbKeySet]);

  function handleError() {
    // La bannière Steam manque parfois : tenter le portrait, puis SteamGridDB
    if (appId && src === steamCdnUrl(appId)) {
      setSrc(steamPortraitUrl(appId));
      return;
    }
    if (sgdbKeySet) {
      fetchCoverArt(game.title).then((url) => setSrc(url ?? null));
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
  /** Liste dépliée. Repliée, elle sort par la droite et rend la place à la scène. */
  open: boolean;
  onToggle: () => void;
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
};

/** Petit bouton porté par une ligne, révélé au survol. */
type ActionLigne = { symbole: string; libelle: string; faire: (game: Game) => void };

/** Au-delà, la liste des résultats venus d'ailleurs cesse d'être consultable. */
const MAX_AILLEURS = 40;

/**
 * Liste des jeux du launcher courant, à droite de la scène.
 *
 * Cliquer une entrée produit exactement le même effet qu'un clic sur la
 * planète : la caméra s'en approche et le panneau de détail s'ouvre.
 */
export function GameList({
  games, allGames, selectedId, platform, platforms, icons,
  sgdbKeySet, onPickGame, onPickPlatform, open, onToggle,
  titre, teinte, systemes, onCreerSysteme, onModifierSysteme,
  onAjouterAuSysteme, onRetirerDuSysteme,
  largeurListe, largeurRail, onLargeurListe, onLargeurRail, onLargeursParDefaut,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const color = teinte;
  const perso = estSystemePerso(platform);
  const retrait: ActionLigne | undefined = perso && onRetirerDuSysteme
    ? { symbole: '−', libelle: 'Retirer de ce système', faire: onRetirerDuSysteme }
    : undefined;
  const ajout: ActionLigne | undefined = perso && onAjouterAuSysteme
    ? { symbole: '+', libelle: 'Ajouter à ce système', faire: onAjouterAuSysteme }
    : undefined;
  const listId = useId();
  const disque = useDiskSpace();

  // Même ordre que les orbites : la n-ième entrée est la n-ième planète.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => g.title.toLowerCase().includes(q));
  }, [games, query]);

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
      <button
        type="button"
        className={css.toggle}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        title={open ? 'Masquer la liste des jeux' : 'Afficher la liste des jeux'}
      >
        {/* Chevron vectoriel plutôt qu'un caractère : à cette taille, « › »
            reste fin et dépend de la police disponible. Il pointe vers la
            droite pour renvoyer la liste, et s'inverse pour la rappeler. */}
        <svg
          className={[css.toggleIcon, open ? '' : css.toggleIconFlipped].filter(Boolean).join(' ')}
          width="11"
          height="18"
          viewBox="0 0 11 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 2L9 9l-6.5 7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Frontières saisissables. Repliée, la colonne n'a plus de largeur à
          régler : les poignées disparaissent avec elle. */}
      {open && (
        <>
          <PoigneeLargeur
            valeur={largeurListe}
            min={LARGEUR_LISTE.min}
            max={LARGEUR_LISTE.max}
            libelle="Largeur de la liste des jeux"
            droite="var(--side-w, 0px)"
            onChange={(v) => onLargeurListe(v, false)}
            onFin={(v) => onLargeurListe(v, true)}
            onDefaut={() => onLargeursParDefaut('liste')}
          />
          <PoigneeLargeur
            valeur={largeurRail}
            min={LARGEUR_RAIL.min}
            max={LARGEUR_RAIL.max}
            libelle="Largeur de la barre des launchers"
            droite="var(--rail-w, 0px)"
            onChange={(v) => onLargeurRail(v, false)}
            onFin={(v) => onLargeurRail(v, true)}
            onDefaut={() => onLargeursParDefaut('rail')}
          />
        </>
      )}

      <aside
        id={listId}
        className={[css.list, open ? '' : css.listHidden].filter(Boolean).join(' ')}
      >
        <div className={css.head}>
          <h2 className={css.headTitle} style={{ color }}>
            {titre}
          </h2>
          {perso && (
            <button type="button" className={css.headModifier} onClick={onModifierSysteme}>
              Modifier
            </button>
          )}
        </div>

        {/* Occupation du disque système — pas de tous les disques : un jeu
            installé ailleurs ne se verrait pas ici, et l'étiquette le dit. */}
        {disque && disque.total > 0 && (
          <div className={css.disque} title={`Lecteur ${disque.lecteur}`}>
            <div className={css.disqueLigne}>
              <span>{formaterVolume(disque.total - disque.libre)} utilisés</span>
              <span className={css.disqueLibre}>{formaterVolume(disque.libre)} libres</span>
            </div>
            <div
              className={css.disqueJauge}
              style={{ '--part': `${((disque.total - disque.libre) / disque.total) * 100}%` } as CSSProperties}
              aria-hidden="true"
            />
          </div>
        )}

        <input
          className={css.search}
          placeholder={t('nav.searchPlaceholder')}
          aria-label={t('nav.searchLabel')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

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
                Désinstallés
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
              <li className={css.groupe}>{perso ? 'Hors de ce système' : 'Autres launchers'}</li>
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
            <li className={css.empty}>Aucun résultat</li>
          )}
        </ul>
      </aside>

      {/* Barre des launchers, adossée au bord droit.

          Hors de l'`aside` : elle reste accessible une fois la liste repliée,
          alors que portée par elle, elle sortirait de l'écran avec elle. */}
      <nav
        className={[css.rail, open ? '' : css.railHidden].filter(Boolean).join(' ')}
        aria-label="Launchers"
      >
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
              title={`${p.name} — ${p.count} ${p.count > 1 ? 'jeux' : 'jeu'}`}
            >
              {icone
                ? <img src={icone} alt="" className={css.railIcon} draggable={false} />
                : <span className={css.railInitiale}>{p.name.slice(0, 1).toUpperCase()}</span>}
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
              title={`${s.nom} — ${s.jeux.length} ${s.jeux.length > 1 ? 'jeux' : 'jeu'}`}
            >
              <IconeSysteme nom={s.icone} couleur={s.couleur} className={css.railIcon} />
            </button>
          );
        })}

        <button
          type="button"
          className={css.railAjout}
          onClick={onCreerSysteme}
          title="Créer un système solaire"
          aria-label="Créer un système solaire"
        >
          <svg viewBox="0 0 24 24" className={css.railAjoutIcone} aria-hidden="true">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
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
            <span className="sr-only">{game.platform}</span>
          </>
        )}
        <Thumb game={game} color={teinte} sgdbKeySet={sgdbKeySet} />
        <span className={css.labels}>
          <span className={css.name}>{game.title}</span>
          <span className={css.meta}>
            {/* La taille sur disque d'un jeu désinstallé ne veut plus rien
                dire : l'espace a été rendu. On dit son état à la place. */}
            {absent
              ? 'Non installé'
              : game.sizeOnDisk != null && game.sizeOnDisk > 0
                ? fmtSize(game.sizeOnDisk)
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
          aria-label={`${action.libelle} : ${game.title}`}
        >
          {action.symbole}
        </button>
      )}
    </li>
  );
}
