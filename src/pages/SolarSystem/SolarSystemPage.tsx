import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../features/types';
import {
  loadGamesFromStorage,
  saveGamesToStorage,
} from '../../features/library/services/libraryStorage';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useSolarScene } from './scene/useSolarScene';
import { GamePanel } from './components/GamePanel';
import { GameList } from './components/GameList';
import { FlyKeysPanel } from './components/FlyKeysPanel';
import { loadFlySettings, saveFlySettings, type FlySettings } from './lib/flyKeys';
import { useLauncherIcons } from './lib/launcherIcons';
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
  const clearPlanetRef = useRef<() => void>(() => {});
  const focusPlanetRef = useRef<(gameId: string) => void>(() => {});
  // Mène la caméra jusqu'à un launcher. Remplace la traversée de portail : la
  // galaxie contient déjà tous les systèmes, il n'y a qu'à s'y rendre.
  const flyToSystemRef = useRef<(platform: string) => void>(() => {});
  const popupRef = useRef<HTMLDivElement>(null);
  const sideProbeRef = useRef<HTMLDivElement>(null);
  const navProbeRef = useRef<HTMLDivElement>(null);
  const fpsRef = useRef<HTMLDivElement>(null);
  // Les affectations vivent dans une ref lue par la scène à chaque frame, et
  // en état pour l'affichage du panneau. Les passer en dépendance de la scène
  // la reconstruirait à chaque touche réaffectée.
  const [flySettings, setFlySettingsState] = useState<FlySettings>(loadFlySettings);
  const flySettingsRef = useRef<FlySettings>(flySettings);

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

  const sceneGames = useSceneGames(games);

  // Jeux du launcher affiché — pour la liste, pas pour la scène : celle-ci
  // les reçoit tous, puisque tous les systèmes coexistent.
  const visibleGames = useMemo(
    () => games.filter((g) => (g.platform || 'Other') === platform),
    [games, platform],
  );

  /**
   * La bibliothèque regroupée par launcher, telle que la scène l'attend.
   *
   * Passe par `useSceneGames` afin que basculer un favori ne reconstruise pas
   * la galaxie entière : seules les propriétés que la 3D affiche comptent.
   */
  const parPlateforme = useMemo(() => {
    const parNom = new Map<string, Game[]>();
    for (const g of sceneGames) {
      const k = g.platform || 'Other';
      const liste = parNom.get(k);
      if (liste) liste.push(g);
      else parNom.set(k, [g]);
    }
    return [...parNom.entries()].map(([p, jeux]) => ({ platform: p, games: jeux }));
  }, [sceneGames]);

  // Le jeu affiché par la carte est relu dans `games` : la scène n'en détient
  // qu'une copie figée, qui ignorerait un favori basculé entre-temps.
  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedId) ?? null,
    [games, selectedId],
  );

  const launcherIcons = useLauncherIcons();

  // Le launcher courant, offert à la scène par référence.
  //
  // La scène ne le lit qu'à son montage, pour savoir devant quel système poser
  // la caméra. Le passer en valeur la ferait se reconstruire à chaque voyage,
  // puisque arriver quelque part met cet état à jour.
  const platformRef = useRef(platform);
  useEffect(() => { platformRef.current = platform; }, [platform]);

  // Identités stables : la scène se reconstruit entièrement quand une de ses
  // dépendances change, il ne faut donc pas en recréer à chaque rendu.
  const handleSelect = useCallback((game: Game | null) => setSelectedId(game?.id ?? null), []);

  const setFlySettings = useCallback((next: FlySettings) => {
    flySettingsRef.current = next;
    setFlySettingsState(next);
    saveFlySettings(next);
  }, []);

  // Le système regardé a changé — soit qu'on ait volé vers un soleil, soit
  // qu'on ait choisi un jeu d'ailleurs : la liste latérale suit.
  const handleSysteme = useCallback((nom: string) => setChosenPlatform(nom), []);

  useSolarScene({
    mountRef,
    labelsRef,
    parPlateforme,
    platformRef,
    labelClass: css.planetLabel,
    orbitLabelClass: css.orbitLabel,
    onSelect: handleSelect,
    clearRef: clearPlanetRef,
    focusRef: focusPlanetRef,
    popupRef,
    sideProbeRef,
    navProbeRef,
    fpsRef,
    flyToRef: flyToSystemRef,
    onSysteme: handleSysteme,
    flySettingsRef,
  });

  /**
   * Sélectionne un jeu, où qu'il soit rangé.
   *
   * Plus rien à orchestrer côté React : la scène sait rejoindre n'importe quel
   * système et construit celui de destination au départ du trajet. Elle nous
   * rappelle ensuite par `onSysteme` pour que la liste suive.
   */
  function handlePickGame(game: Game) {
    focusPlanetRef.current(game.id);
  }

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
      <div ref={navProbeRef} className={css.navProbe} />

      {/* Compteur d'images, écrit par la scène sans passer par React. */}
      <div ref={fpsRef} className={css.fps} />

      <FlyKeysPanel settings={flySettings} onChange={setFlySettings} />

      {/* Liste des jeux du launcher, repliable par sa languette. */}
      <GameList
        games={visibleGames}
        allGames={games}
        selectedId={selectedId}
        platform={platform}
        platforms={platforms}
        icons={launcherIcons}
        sgdbKeySet={settings.sgdbKeySet}
        onPickGame={handlePickGame}
        onPickPlatform={(nom) => flyToSystemRef.current(nom)}
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
