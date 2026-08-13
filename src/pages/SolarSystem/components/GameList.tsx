import { useEffect, useId, useMemo, useState } from 'react';
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
  games: Game[];
  selectedId: string | null;
  platform: string;
  /** Une clé SteamGridDB est configurée (la clé reste côté Rust). */
  sgdbKeySet: boolean;
  /** Cible la planète correspondante dans la scène. */
  onPick: (gameId: string) => void;
  /** Liste dépliée. Repliée, elle sort par la droite et rend la place à la scène. */
  open: boolean;
  onToggle: () => void;
};

/**
 * Liste des jeux du launcher courant, à droite de la scène.
 *
 * Cliquer une entrée produit exactement le même effet qu'un clic sur la
 * planète : la caméra s'en approche et le panneau de détail s'ouvre.
 */
export function GameList({
  games, selectedId, platform, sgdbKeySet, onPick, open, onToggle,
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
        </div>

        <input
          className={css.search}
          placeholder={t('nav.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <ul className={css.items}>
          {shown.map((g) => {
            // Le rang dans la liste complète correspond au rang orbital
            const orbit = games.indexOf(g) + 1;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className={[css.item, g.id === selectedId ? css.itemActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onPick(g.id)}
                  title={g.title}
                  style={g.id === selectedId ? { borderColor: color + '88' } : undefined}
                >
                  <span className={css.orbitNum}>{orbit}</span>
                  <Thumb game={g} color={color} sgdbKeySet={sgdbKeySet} />
                  <span className={css.labels}>
                    <span className={css.name}>{g.title}</span>
                    <span className={css.meta}>
                      {g.sizeOnDisk != null && g.sizeOnDisk > 0 ? fmtSize(g.sizeOnDisk) : '—'}
                      {g.favorite && <span className={css.fav}> ★</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}

          {shown.length === 0 && <li className={css.empty}>Aucun résultat</li>}
        </ul>
      </aside>
    </>
  );
}
