import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import type { Game } from '../../features/types';
import {
  loadGamesFromStorage,
  saveGamesToStorage,
  subscribeGames,
} from '../../features/library/services/libraryStorage';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { useSolarScene } from './scene/useSolarScene';
import { GamePanel } from './components/GamePanel';
import { GameList } from './components/GameList';
import { FlyKeysPanel } from './components/FlyKeysPanel';
import { loadFlySettings, saveFlySettings, type FlySettings } from './lib/flyKeys';
import { useLauncherIcons } from './lib/launcherIcons';
import { PLATFORM_CSS } from './constants';
import { SystemeDialog } from './components/SystemeDialog';
import { EditeurSysteme } from './components/EditeurSysteme';
import { EDITION_INERTE, type EditionScene } from './scene/edition';
import {
  ajouterJeu,
  cleSysteme,
  couleurEntier,
  estSystemePerso,
  jeuxDuSysteme,
  remplacerSysteme,
  retirerJeu,
  retirerSysteme,
  type SystemePerso,
} from './lib/customSystems';
import { chargerSystemesPerso, enregistrerSystemesPerso } from './lib/customSystemsStorage';
import {
  LARGEUR_LISTE,
  LARGEUR_RAIL,
  chargerLargeurs,
  echelles,
  enregistrerLargeurs,
  type Largeurs,
} from './lib/largeurs';
import css from './SolarSystemPage.module.css';
import { abonnerReglages, versionStructure } from '../../features/debug/tuning';

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
  // `null` tant que rien n'a été choisi : la feuille de style garde alors sa
  // largeur par défaut, et son plafond en pourcentage.
  const [largeurs, setLargeurs] = useState<Largeurs>(chargerLargeurs);
  const [systemesPerso, setSystemesPerso] = useState<SystemePerso[]>(chargerSystemesPerso);
  // Éditeur ouvert : identifiant du système personnalisé qu'on règle.
  const [editeur, setEditeur] = useState<string | null>(null);
  const editionRef = useRef<EditionScene>(EDITION_INERTE);
  // Système qu'on vient d'enregistrer depuis l'éditeur : la scène montre déjà
  // son état final, le rebâtir ferait clignoter ses planètes pour rien.
  const sansRechargerRef = useRef<string | null>(null);
  // Dialogue ouvert : `systeme` vaut null pour une création.
  const [edition, setEdition] = useState<{ systeme: SystemePerso | null } | null>(null);
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
  //
  // Un système personnalisé supprimé laisse une clé qui ne désigne plus rien :
  // on retombe alors, comme sans choix, sur le launcher le plus fourni.
  const systemeCourant =
    chosenPlatform && estSystemePerso(chosenPlatform)
      ? systemesPerso.find((s) => cleSysteme(s) === chosenPlatform) ?? null
      : null;
  const platform =
    chosenPlatform && (!estSystemePerso(chosenPlatform) || systemeCourant)
      ? chosenPlatform
      : platforms[0]?.name ?? '';

  const sceneGames = useSceneGames(games);

  // Jeux du launcher affiché — pour la liste, pas pour la scène : celle-ci
  // les reçoit tous, puisque tous les systèmes coexistent.
  const visibleGames = useMemo(() => {
    if (systemeCourant) return jeuxDuSysteme(systemeCourant, new Map(games.map((g) => [g.id, g])));
    return games.filter((g) => (g.platform || 'Other') === platform);
  }, [games, platform, systemeCourant]);

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
    const launchers = [...parNom.entries()].map(([p, jeux]) => ({ platform: p, games: jeux }));

    // Systèmes personnalisés, tirés de la même copie figée des jeux. Un système
    // dont tous les jeux ont quitté la bibliothèque reste dans la barre, où l'on
    // peut le modifier, mais pas dans la galaxie : un soleil sans planète ne
    // désignerait rien.
    const parId = new Map(sceneGames.map((g) => [g.id, g]));
    const perso = systemesPerso
      .map((s) => ({
        platform: cleSysteme(s),
        games: jeuxDuSysteme(s, parId),
        nom: s.nom,
        couleur: couleurEntier(s.couleur),
        reglage: { soleil: s.soleil, vitesse: s.vitesse, aPlat: s.aPlat, placements: s.placements },
      }))
      .filter((s) => s.games.length > 0);

    return [...launchers, ...perso];
  }, [sceneGames, systemesPerso]);

  /**
   * Ce qui oblige à reconstruire la galaxie : les jeux affichés, et pour chaque
   * système personnalisé son nom, sa couleur et le fait qu'il ait un soleil.
   *
   * Ni ses jeux ni ses placements : les changer ne rebâtit que lui, sans
   * relancer la caméra (voir `editionRef`).
   */
  const cleScene = useMemo(() => {
    const presents = new Set(parPlateforme.map((p) => p.platform));
    return [
      sceneSignature(sceneGames),
      ...systemesPerso.map((s) => [s.id, s.nom, s.couleur, presents.has(cleSysteme(s)) ? '1' : '0'].join('\u0000')),
    ].join('\u0001');
  }, [sceneGames, systemesPerso, parPlateforme]);

  const parPlateformeRef = useRef(parPlateforme);
  const systemesPrecedentsRef = useRef(systemesPerso);
  useEffect(() => {
    parPlateformeRef.current = parPlateforme;

    // Un système dont les jeux ont changé hors de l'éditeur est rebâti seul.
    // La référence vient d'être mise à jour : la scène relit les bons jeux.
    const avant = new Map(systemesPrecedentsRef.current.map((x) => [x.id, x]));
    for (const sys of systemesPerso) {
      const ancien = avant.get(sys.id);
      if (!ancien || ancien.jeux.join('\n') === sys.jeux.join('\n')) continue;
      if (sansRechargerRef.current === sys.id) continue;
      editionRef.current.recharger(cleSysteme(sys));
    }
    sansRechargerRef.current = null;
    systemesPrecedentsRef.current = systemesPerso;
  }, [parPlateforme, systemesPerso]);

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

  // Suit les changements de bibliothèque venus d'ailleurs — le scan de
  // démarrage, ou la page Bibliothèque. Sans cela, un jeu détecté pendant que
  // la galaxie est affichée n'y apparaîtrait qu'après avoir quitté la page et
  // y être revenu.
  //
  // Relu sans condition : c'est `useSceneGames` qui décide si la 3D doit être
  // rebâtie, en comparant ce dont elle dépend vraiment. Filtrer ici serait
  // filtrer au mauvais endroit — un favori basculé depuis la bibliothèque ne
  // change pas la géométrie, mais la liste latérale doit tout de même
  // l'afficher.
  useEffect(() => subscribeGames(() => setGames(loadGamesFromStorage())), []);

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

  /**
   * Enregistre un système créé ou modifié, et s'y rend.
   *
   * La galaxie se reconstruit pour l'accueillir. Comme la scène démarre devant
   * le système courant, la caméra se pose directement devant le nouveau.
   */
  function enregistrerSysteme(s: SystemePerso) {
    const suivants = remplacerSysteme(systemesPerso, s);
    setSystemesPerso(suivants);
    enregistrerSystemesPerso(suivants);
    setChosenPlatform(cleSysteme(s));
    setEdition(null);
  }

  /** Remplace un système enregistré et le persiste. */
  function majSysteme(s: SystemePerso) {
    const suivants = remplacerSysteme(systemesPerso, s);
    setSystemesPerso(suivants);
    enregistrerSystemesPerso(suivants);
  }

  function enregistrerDepuisEditeur(s: SystemePerso) {
    sansRechargerRef.current = s.id;
    majSysteme(s);
    editionRef.current.terminer(cleSysteme(s), false);
    setEditeur(null);
  }

  function annulerEditeur(id: string) {
    editionRef.current.terminer(cleSysteme({ id }), true);
    setEditeur(null);
  }

  function ajouterAuSysteme(game: Game) {
    if (systemeCourant) majSysteme(ajouterJeu(systemeCourant, game.id));
  }

  function retirerDuSysteme(game: Game) {
    if (systemeCourant) majSysteme(retirerJeu(systemeCourant, game.id));
  }

  function supprimerSysteme(id: string) {
    editionRef.current.terminer(cleSysteme({ id }), false);
    setEditeur(null);
    const suivants = retirerSysteme(systemesPerso, id);
    setSystemesPerso(suivants);
    enregistrerSystemesPerso(suivants);
    if (chosenPlatform === cleSysteme({ id })) setChosenPlatform(null);
    setEdition(null);
  }

  /**
   * Rend visible un système depuis la barre.
   *
   * Un système personnalisé vide n'a pas de soleil dans la galaxie : la caméra
   * n'a nulle part où aller, mais la liste doit tout de même le montrer.
   */
  function choisirSysteme(cle: string) {
    if (parPlateforme.some((p) => p.platform === cle)) flyToSystemRef.current(cle);
    else setChosenPlatform(cle);
  }

  // Une poignée sous la main. La scène doit alors coller à la largeur réelle
  // plutôt qu'à la courbe de repli — voir `.pageGlisse` dans la feuille.
  const [glisse, setGlisse] = useState(false);
  // Les largeurs les plus fraîches, sans passer par le rendu : sous la main les
  // changements se suivent de près, et deux poignées peuvent bouger dans le
  // même tour. Relire l'état de la fermeture en perdrait une — c'est ce qui
  // faisait qu'une double remise à zéro n'en gardait qu'une.
  const largeursRef = useRef(largeurs);

  /** Pose une largeur, ou `null` pour rendre la main à la feuille de style. */
  function poserLargeur(colonne: keyof Largeurs, v: number | null, enregistrer: boolean) {
    const suivantes = { ...largeursRef.current, [colonne]: v };
    largeursRef.current = suivantes;
    setLargeurs(suivantes);
    setGlisse(!enregistrer);
    // Pendant le glissement on ne fait qu'afficher ; on enregistre au relâché.
    if (enregistrer) enregistrerLargeurs(suivantes);
  }

  function largeurParDefaut(colonne: keyof Largeurs) {
    poserLargeur(colonne, null, true);
  }

  // Plafond en pourcentage conservé : sur une fenêtre étroite, une largeur
  // choisie au large laisserait la scène sans place.
  //
  // Les facteurs d'échelle accompagnent la largeur : élargir la colonne
  // grossit ce qu'elle montre, la rétrécir le réduit. Tant que rien n'est
  // choisi, aucune variable n'est posée et les feuilles gardent la main —
  // leurs valeurs de repli valent 1, donc les tailles d'origine.
  const e = echelles(largeurs);
  const styleColonnes = {
    ...(largeurs.liste !== null
      ? {
          '--list-w': `min(${largeurs.liste}px, 60%)`,
          '--img-e': `${e.image}`,
          '--txt-e': `${e.texte}`,
        }
      : null),
    ...(largeurs.rail !== null
      ? {
          '--rail-w': `${largeurs.rail}px`,
          '--rail-e': `${e.rail}`,
          '--rail-et': `${e.railTexte}`,
        }
      : null),
  } as CSSProperties;

  const titreListe = systemeCourant?.nom ?? platform;
  const teinteListe = systemeCourant?.couleur ?? PLATFORM_CSS[platform] ?? '#7a8a9a';

  // Change quand un réglage de débogage fixe un nombre d'objets — étoiles,
  // astéroïdes : la scène doit alors être reconstruite. Toujours zéro en
  // production, où rien ne modifie les réglages.
  const structure = useSyncExternalStore(abonnerReglages, versionStructure);

  useSolarScene({
    mountRef,
    labelsRef,
    parPlateformeRef,
    cleScene,
    editionRef,
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
    structure,
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
    <div
      className={[css.page, listOpen ? '' : css.pageListHidden, glisse ? css.pageGlisse : '']
        .filter(Boolean)
        .join(' ')}
      style={styleColonnes}
    >
      {/* La page n'avait aucun titre : un lecteur d'écran ne pouvait pas la
          nommer. Visible pour lui seul, la barre d'en-tête l'affiche déjà. */}
      <h1 className="sr-only">Système solaire</h1>

      {/* La scène et ses étiquettes sont écartées de l'arbre d'accessibilité :
          un canvas ne s'explore pas, et la liste de droite en donne l'équivalent
          — mêmes jeux, vrais boutons, atteignables au clavier. */}
      <div ref={mountRef} className={css.canvas} aria-hidden="true" />

      {/* Labels HTML, positionnés par projection caméra depuis la scène */}
      <div ref={labelsRef} className={css.labels} aria-hidden="true" />

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
        onPickPlatform={choisirSysteme}
        open={listOpen}
        onToggle={() => setListOpen((v) => !v)}
        titre={titreListe}
        teinte={teinteListe}
        systemes={systemesPerso}
        onCreerSysteme={() => setEdition({ systeme: null })}
        onModifierSysteme={() => {
          if (systemeCourant) setEditeur(systemeCourant.id);
        }}
        onAjouterAuSysteme={systemeCourant ? ajouterAuSysteme : undefined}
        onRetirerDuSysteme={systemeCourant ? retirerDuSysteme : undefined}
        largeurListe={largeurs.liste ?? LARGEUR_LISTE.defaut}
        largeurRail={largeurs.rail ?? LARGEUR_RAIL.defaut}
        onLargeurListe={(v, e) => poserLargeur('liste', v, e)}
        onLargeurRail={(v, e) => poserLargeur('rail', v, e)}
        onLargeursParDefaut={largeurParDefaut}
      />

      {(() => {
        const edite = editeur ? systemesPerso.find((x) => x.id === editeur) : undefined;
        return edite ? (
          <EditeurSysteme
            key={edite.id}
            systeme={edite}
            games={games}
            edition={editionRef}
            onEnregistrer={enregistrerDepuisEditeur}
            onAnnuler={() => annulerEditeur(edite.id)}
            onSupprimer={supprimerSysteme}
          />
        ) : null;
      })()}

      {edition && (
        <SystemeDialog
          systeme={edition.systeme}
          existants={systemesPerso}
          games={games}
          onEnregistrer={enregistrerSysteme}
          onSupprimer={supprimerSysteme}
          onFermer={() => setEdition(null)}
        />
      )}

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
