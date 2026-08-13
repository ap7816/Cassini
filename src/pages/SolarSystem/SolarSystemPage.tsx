import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Game } from '../../features/types';
import {
  loadGamesFromStorage,
  saveGamesToStorage,
} from '../../features/library/services/libraryStorage';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { PLATFORM_COLOR, PLATFORM_CSS } from './constants';
import { useSolarScene } from './scene/useSolarScene';
import { GamePanel } from './components/GamePanel';
import { GameList } from './components/GameList';
import { FlyKeysPanel } from './components/FlyKeysPanel';
import { loadFlySettings, saveFlySettings, type FlySettings } from './lib/flyKeys';
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

/**
 * Durées du voile de traversée, accordées à la scène :
 * `WARP_OUT_MS` couvre la plongée de la caméra (WARP_DIVE_S) et doit lui
 * laisser le temps de finir, `WARP_IN_MS` la levée du voile pendant que la
 * nouvelle scène joue son arrivée (ARRIVAL_S).
 */
const WARP_OUT_MS = 1150;
const WARP_IN_MS = 900;

export function SolarSystemPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const clearPlanetRef = useRef<() => void>(() => {});
  const focusPlanetRef = useRef<(gameId: string) => void>(() => {});
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
  const [warp, setWarp] = useState<{ phase: 'out' | 'in'; target: string } | null>(null);
  // Système quitté lors de la dernière traversée : la scène s'en sert pour
  // faire émerger la caméra du portail qui y ramène.
  const [arriveFrom, setArriveFrom] = useState<string | null>(null);
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

  // Toutes les autres plateformes : une destination, donc un portail, par
  // système voisin. Identité stable tant que la liste ne change pas — elle
  // entre dans les dépendances de la scène, qui se reconstruirait sinon à
  // chaque rendu.
  const destinations = useMemo(
    () =>
      platforms
        .filter((p) => p.name !== platform)
        .map((p) => ({ platform: p.name, color: PLATFORM_COLOR[p.name] ?? 0x7a8a9a })),
    [platforms, platform],
  );

  // Identités stables : la scène se reconstruit entièrement quand une de ses
  // dépendances change, il ne faut donc pas en recréer à chaque rendu.
  const handleSelect = useCallback((game: Game | null) => setSelectedId(game?.id ?? null), []);

  const setFlySettings = useCallback((next: FlySettings) => {
    flySettingsRef.current = next;
    setFlySettingsState(next);
    saveFlySettings(next);
  }, []);

  // La destination est retenue ici : au moment de la bascule, la scène qui
  // l'a émise n'existera plus.
  const handlePortal = useCallback(
    (target: string) => setWarp({ phase: 'out', target }),
    [],
  );

  // Traversée du portail, en deux temps.
  //
  // Changer de plateforme détruit et reconstruit toute la scène : planètes,
  // textures, ceinture. Aucune animation 3D ne peut couvrir cette couture,
  // puisque l'objet qui l'animerait disparaît en cours de route. C'est donc un
  // voile HTML — qui survit au remontage — qui la masque.
  //
  //   'out' : la caméra plonge dans le portail pendant que le voile s'opacifie
  //   'in'  : la plateforme a changé, la nouvelle scène joue son arrivée
  //           derrière le voile qui se lève
  useEffect(() => {
    if (!warp) return;
    if (warp.phase === 'out') {
      const id = setTimeout(() => {
        // Mémorisé avant la bascule : après, `platform` désigne la destination.
        setArriveFrom(platform);
        setChosenPlatform(warp.target);
        clearPlanetRef.current();
        setWarp({ phase: 'in', target: warp.target });
      }, WARP_OUT_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setWarp(null), WARP_IN_MS);
    return () => clearTimeout(id);
  }, [warp, platform]);

  useSolarScene({
    mountRef,
    labelsRef,
    games: sceneGames,
    platform,
    labelClass: css.planetLabel,
    orbitLabelClass: css.orbitLabel,
    onSelect: handleSelect,
    clearRef: clearPlanetRef,
    focusRef: focusPlanetRef,
    popupRef,
    sideProbeRef,
    navProbeRef,
    fpsRef,
    destinations,
    onPortal: handlePortal,
    flySettingsRef,
    arriveFrom,
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
      <div ref={navProbeRef} className={css.navProbe} />

      {/* Compteur d'images, écrit par la scène sans passer par React. */}
      <div ref={fpsRef} className={css.fps} />

      <FlyKeysPanel settings={flySettings} onChange={setFlySettings} />

      {/* Voile de traversée. Rendu inconditionnellement pour que la classe
          seule pilote l'animation : le monter au moment du départ ferait
          démarrer la transition sur un élément qui vient d'apparaître, et le
          premier palier serait sauté. */}
      <div
        className={[css.warp, warp ? css.warpOn : ''].filter(Boolean).join(' ')}
        style={{ '--warp-tint': PLATFORM_CSS[platform] ?? '#7a8a9a' } as CSSProperties}
        aria-hidden="true"
      />

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
