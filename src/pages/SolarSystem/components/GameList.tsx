import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../../features/types';
import {
  fetchCoverArt,
  steamCdnUrl,
  steamPortraitUrl,
} from '../../../features/library/services/coverArtService';
import { PLATFORM_CSS } from '../constants';
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
  /** Launcher consulté dans la liste. */
  platform: string;
  /** Launcher réellement affiché en 3D, quand on en consulte un autre. */
  currentPlatform: string;
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
  /** Change le launcher consulté, sans toucher au système affiché. */
  onPickPlatform: (platform: string) => void;
  /** Liste dépliée. Repliée, elle sort par la droite et rend la place à la scène. */
  open: boolean;
  onToggle: () => void;
};

/** Au-delà, la liste des résultats venus d'ailleurs cesse d'être consultable. */
const MAX_AILLEURS = 40;

/**
 * Liste des jeux du launcher courant, à droite de la scène.
 *
 * Cliquer une entrée produit exactement le même effet qu'un clic sur la
 * planète : la caméra s'en approche et le panneau de détail s'ouvre.
 */
export function GameList({
  games, allGames, selectedId, platform, currentPlatform, platforms, icons,
  sgdbKeySet, onPickGame, onPickPlatform, open, onToggle,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const color = PLATFORM_CSS[platform] ?? '#7a8a9a';
  const listId = useId();

  // Même ordre que les orbites : la n-ième entrée est la n-ième planète.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => g.title.toLowerCase().includes(q));
  }, [games, query]);

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
    return allGames
      .filter((g) => (g.platform || 'Other') !== platform && g.title.toLowerCase().includes(q))
      .slice(0, MAX_AILLEURS);
  }, [allGames, platform, query]);

  /** Le launcher consulté n'est pas celui qu'on survole en 3D. */
  const enApercu = platform !== currentPlatform;

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

      <aside
        id={listId}
        className={[css.list, open ? '' : css.listHidden].filter(Boolean).join(' ')}
      >
        <div className={css.head}>
          <span className={css.headTitle} style={{ color }}>
            {platform}
          </span>
          {/* Sans cette mention, une liste qui ne correspond à aucune des
              planètes visibles passerait pour un défaut d'affichage. */}
          {enApercu && <span className={css.headHint}>aperçu</span>}
        </div>

        <input
          className={css.search}
          placeholder={t('nav.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className={css.items}>
          {shown.map((g) => (
            <Ligne
              key={g.id}
              game={g}
              // Le rang dans la liste complète correspond au rang orbital —
              // mais seulement si l'on regarde bien ce système. En aperçu, ces
              // planètes n'existent pas à l'écran, le numéro ne désignerait
              // rien : la pastille du launcher le remplace.
              orbit={enApercu ? null : games.indexOf(g) + 1}
              selected={g.id === selectedId}
              sgdbKeySet={sgdbKeySet}
              onPick={onPickGame}
            />
          ))}

          {ailleurs.length > 0 && (
            <>
              <li className={css.groupe}>Autres launchers</li>
              {ailleurs.map((g) => (
                <Ligne
                  key={g.id}
                  game={g}
                  orbit={null}
                  selected={false}
                  sgdbKeySet={sgdbKeySet}
                  onPick={onPickGame}
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
      <nav className={css.rail} aria-label="Launchers">
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
                p.name === currentPlatform ? css.railBtnCurrent : '',
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
  game, orbit, selected, sgdbKeySet, onPick,
}: {
  game: Game;
  orbit: number | null;
  selected: boolean;
  sgdbKeySet: boolean;
  onPick: (game: Game) => void;
}) {
  const teinte = PLATFORM_CSS[game.platform || 'Other'] ?? '#7a8a9a';
  return (
    <li>
      <button
        type="button"
        className={[css.item, selected ? css.itemActive : ''].filter(Boolean).join(' ')}
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
          <span
            className={css.puce}
            style={{ background: teinte, color: teinte }}
            aria-hidden="true"
          />
        )}
        <Thumb game={game} color={teinte} sgdbKeySet={sgdbKeySet} />
        <span className={css.labels}>
          <span className={css.name}>{game.title}</span>
          <span className={css.meta}>
            {game.sizeOnDisk != null && game.sizeOnDisk > 0 ? fmtSize(game.sizeOnDisk) : '—'}
            {game.favorite && <span className={css.fav}> ★</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
