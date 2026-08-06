import { useCallback, useMemo, useRef, useState } from 'react';
import type { Game } from '../../features/types';
import {
  loadGamesFromStorage,
  saveGamesToStorage,
} from '../../features/Library/services/libraryStorage';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { PLATFORM_CSS } from './constants';
import { useSolarScene } from './scene/useSolarScene';
import { GamePanel } from './components/GamePanel';
import css from './SolarSystemPage.module.css';

export function SolarSystemPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const clearPlanetRef = useRef<() => void>(() => {});

  const [games, setGames] = useState<Game[]>(() => loadGamesFromStorage());
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  // null = aucun choix explicite, on retombe sur la plateforme la plus fournie
  const [chosenPlatform, setChosenPlatform] = useState<string | null>(null);
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

  // Identités stables : la scène se reconstruit entièrement quand une de ses
  // dépendances change, il ne faut donc pas en recréer à chaque rendu.
  const handleSelect = useCallback((game: Game | null) => setSelectedGame(game), []);

  useSolarScene({
    mountRef,
    labelsRef,
    tooltipRef,
    games: visibleGames,
    platform,
    labelClass: css.planetLabel,
    orbitLabelClass: css.orbitLabel,
    onSelect: handleSelect,
    clearRef: clearPlanetRef,
  });

  function handleGameUpdate(updated: Game) {
    setGames((prev) => {
      const next = prev.map((g) => (g.id === updated.id ? updated : g));
      saveGamesToStorage(next);
      return next;
    });
    setSelectedGame(updated);
  }

  function handleGameRemove(id: string) {
    setGames((prev) => {
      const next = prev.filter((g) => g.id !== id);
      saveGamesToStorage(next);
      return next;
    });
  }

  return (
    <div className={css.page}>
      <div ref={mountRef} className={css.canvas} />

      {/* Labels HTML, positionnés par projection caméra depuis la scène */}
      <div ref={labelsRef} className={css.labels} />

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
  );
}
