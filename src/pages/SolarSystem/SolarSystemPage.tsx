import { useCallback, useMemo, useRef, useState } from 'react';
import type { Game } from '../../features/types';
import {
  loadGamesFromStorage,
  saveGamesToStorage,
} from '../../features/library/services/libraryStorage';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { PLATFORM_CSS } from './constants';
import { useSolarScene } from './scene/useSolarScene';
import { GamePanel } from './components/GamePanel';
import { GameList } from './components/GameList';
import css from './SolarSystemPage.module.css';

/**
 * Signature des seules propriétés dont dépend le rendu 3D : identité, nom,
 * plateforme, taille sur disque (rayon de la planète) et sources de jaquette.
 *
 * Séparateurs NUL et saut de ligne : ni l'un ni l'autre ne peut apparaître
 * dans un titre ou une URL, deux bibliothèques différentes ne peuvent donc pas
 * produire la même signature.
 */
function sceneSignature(games: Game[]): string {
  return games
    .map((g) =>
      [g.id, g.title, g.platform, g.sizeOnDisk ?? 0, g.customImageUrl ?? '', g.steamAppId ?? '']
        .join('\u0000'),
    )
    .join('\n');
}

/**
 * Fige l'identité du tableau de jeux tant que rien de ce que la scène affiche
 * n'a changé.
 *
 * `useSolarScene` reconstruit le système entier dès que l'identité de `games`
 * change — c'est voulu, la géométrie en dépend. Mais mettre un jeu en favori
 * réécrit le tableau sans rien changer en 3D : la scène était rebâtie et la
 * caméra revenait à son cadrage initial à chaque clic sur l'étoile.
 */
function useSceneGames(games: Game[]): Game[] {
  const key = useMemo(() => sceneSignature(games), [games]);

  // Mise à jour d'état pendant le rendu : le motif que React prévoit pour une
  // valeur dérivée d'une entrée. Le rendu en cours renvoie déjà le nouveau
  // tableau, la passe suivante le retrouve figé.
  const [held, setHeld] = useState({ key, games });
  if (held.key !== key) setHeld({ key, games });

  return held.key === key ? held.games : games;
}

export function SolarSystemPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const clearPlanetRef = useRef<() => void>(() => {});
  const focusPlanetRef = useRef<(gameId: string) => void>(() => {});
  const popupRef = useRef<HTMLDivElement>(null);
  const sideProbeRef = useRef<HTMLDivElement>(null);
  const fpsRef = useRef<HTMLDivElement>(null);

  const [games, setGames] = useState<Game[]>(() => loadGamesFromStorage());
  // Seul l'identifiant est mémorisé : la carte de détail lit ensuite le jeu
  // dans `games`, et reflète donc toute modification sans qu'il faille
  // resynchroniser deux états — la copie détenue par la scène 3D, elle, est
  // volontairement figée (voir useSceneGames).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // null = aucun choix explicite, on retombe sur la plateforme la plus fournie
  const [chosenPlatform, setChosenPlatform] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const { settings } = useAppSettings();

  // Plateformes présentes dans la bibliothèque, la plus fournie en premier
  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) {
      const k = g.platform || 'Other';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [games]);

  // Valeur dérivée plutôt qu'un état synchronisé par effet : écrire un état
  // depuis un effet provoque un rendu en cascade, et la valeur par défaut
  // resterait périmée si la bibliothèque changeait.
  const platform = chosenPlatform ?? platforms[0]?.name ?? '';

  // Seuls les jeux de la plateforme choisie peuplent le système
  const visibleGames = useMemo(
    () => games.filter((g) => (g.platform || 'Other') === platform),
    [games, platform],
  );

  // Le jeu affiché par la carte est relu dans `games` : la scène n'en détient
  // qu'une copie figée, qui ignorerait un favori basculé entre-temps.
  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedId) ?? null,
    [games, selectedId],
  );

  const sceneGames = useSceneGames(visibleGames);

  // Identités stables : la scène se reconstruit entièrement quand une de ses
  // dépendances change, il ne faut donc pas en recréer à chaque rendu.
  const handleSelect = useCallback((game: Game | null) => setSelectedId(game?.id ?? null), []);

  useSolarScene({
    mountRef,
    labelsRef,
    tooltipRef,
    games: sceneGames,
    platform,
    labelClass: css.planetLabel,
    orbitLabelClass: css.orbitLabel,
    onSelect: handleSelect,
    clearRef: clearPlanetRef,
    focusRef: focusPlanetRef,
    popupRef,
    sideProbeRef,
    fpsRef,
  });

  function handleGameUpdate(updated: Game) {
    setGames((prev) => {
      const next = prev.map((g) => (g.id === updated.id ? updated : g));
      saveGamesToStorage(next);
      return next;
    });
  }

  function handleGameRemove(id: string) {
    setGames((prev) => {
      const next = prev.filter((g) => g.id !== id);
      saveGamesToStorage(next);
      return next;
    });
  }

  return (
    <div className={[css.page, listOpen ? '' : css.pageListHidden].filter(Boolean).join(' ')}>
      <div ref={mountRef} className={css.canvas} />

      {/* Labels HTML, positionnés par projection caméra depuis la scène */}
      <div ref={labelsRef} className={css.labels} />

      {/* Témoin de la largeur animée de la colonne : la scène le mesure pour
          décaler sa projection en suivant la transition CSS (voir applyView). */}
      <div ref={sideProbeRef} className={css.sideProbe} />

      {/* Compteur d'images, écrit par la scène sans passer par React. */}
      <div ref={fpsRef} className={css.fps} />

      {/* Infobulle de survol — pilotée en direct par la scène, jamais par
          un état React : re-rendre la page à chaque pixel de souris coûtait
          bien plus cher que le rendu 3D lui-même. */}
      <div ref={tooltipRef} className={css.tooltip} style={{ display: 'none' }} />

      <div className={css.selector}>
        <label className={css.selectorLabel}>Launcher</label>
        <div className={css.selectorRow}>
          <span
            className={css.selectorDot}
            style={{ background: PLATFORM_CSS[platform] ?? '#7a8a9a' }}
          />
          <select
            className={css.select}
            value={platform}
            onChange={(e) => {
              clearPlanetRef.current();
              setChosenPlatform(e.target.value);
            }}
          >
            {platforms.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} — {p.count} {p.count > 1 ? 'jeux' : 'jeu'}
              </option>
            ))}
          </select>
        </div>
        <div className={css.selectorHint}>
          {visibleGames.length} planète{visibleGames.length > 1 ? 's' : ''} en orbite
        </div>
      </div>

      {/* Liste des jeux du launcher, repliable par sa languette. */}
      <GameList
        games={visibleGames}
        selectedId={selectedId}
        platform={platform}
        sgdbKeySet={settings.sgdbKeySet}
        onPick={(id) => focusPlanetRef.current(id)}
        open={listOpen}
        onToggle={() => setListOpen((v) => !v)}
      />

      {/* Carte de détail — repositionnée chaque frame à côté de la planète
          sélectionnée par useSolarScene, via `popupRef`. Son origine coïncide
          avec celle de `labelsRef` (même coin haut-gauche de .page), donc la
          projection calculée sur l'un s'applique telle quelle à l'autre. */}
      <div ref={popupRef} className={css.popupAnchor}>
        {selectedGame && (
          <GamePanel
            key={selectedGame.id}
            game={selectedGame}
            sgdbKeySet={settings.sgdbKeySet}
            onClose={() => clearPlanetRef.current()}
            onUpdate={handleGameUpdate}
            onRemove={handleGameRemove}
          />
        )}
      </div>
    </div>
  );
}
