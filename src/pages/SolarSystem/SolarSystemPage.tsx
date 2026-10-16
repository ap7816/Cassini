import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ICONE_PAR_DEFAUT } from './lib/iconesSysteme';
import { nomPlateforme } from '../../i18n/plateformes';
import logo from '../../assets/logo.svg';
import { useCalques } from '../../features/calques/useCalques';
import { AideRaccourcis } from './components/AideRaccourcis';
import { rayonSysteme } from './lib/etendue';
import { tagsDeLaBibliotheque } from '../../features/library/services/tags';
import { enregistrerDernierSysteme, lireDernierSysteme, systemeOuverture } from './lib/ouverture';
import { definirCritereTaille, type CritereTaille } from './lib/orbits';
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
  REGLAGE_DEFAUT,
  ajouterJeu,
  cleSysteme,
  couleurEntier,
  estReglageDefaut,
  estSystemePerso,
  jeuxDuSysteme,
  nouveauSysteme,
  reglageDeSysteme,
  remplacerSysteme,
  retirerJeu,
  retirerSysteme,
  type ReglageSysteme,
  type SystemePerso,
} from './lib/customSystems';
import {
  chargerReglagesLaunchers,
  chargerSystemesPerso,
  enregistrerReglagesLaunchers,
  enregistrerSystemesPerso,
} from './lib/customSystemsStorage';
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
import {
  reglerMusiquesEvenements,
  reglerVolumesEvenements,
} from '../../features/evenements/musiqueEvenement';

/**
 * Signature des seules propriétés dont dépend le rendu 3D : identité, nom,
 * plateforme, taille sur disque (rayon de la planète) et sources de jaquette.
 *
 * Séparateurs NUL et saut de ligne : ni l'un ni l'autre ne peut apparaître
 * dans un titre ou une URL, deux bibliothèques différentes ne peuvent donc pas
 * produire la même signature.
 */
function sceneSignature(games: Game[], critere: CritereTaille, avecTags: boolean): string {
  return games
    .map((g) =>
      [
        g.id,
        g.title,
        g.platform,
        g.sizeOnDisk ?? 0,
        g.customImageUrl ?? '',
        g.steamAppId ?? '',
        // Seulement quand il fait la taille : sinon, rejouer à un jeu Steam
        // reconstruirait la galaxie au retour pour une donnée qu'elle ignore.
        critere === 'tempsDeJeu' ? g.playtimeMinutes ?? 0 : '',
        // Seulement quand un système suit un tag : sinon, taguer un jeu
        // reconstruirait la galaxie pour une donnée qu'elle n'affiche pas.
        avecTags ? (g.tags ?? []).join(',') : '',
      ].join('\u0000'),
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
function useSceneGames(games: Game[], critere: CritereTaille, avecTags: boolean): Game[] {
  const key = useMemo(
    () => sceneSignature(games, critere, avecTags) + critere,
    [games, critere, avecTags],
  );

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
  const [aideOuverte, setAideOuverte] = useState(false);
  /** Champ de recherche de la liste, que `Ctrl+F` ramène sous la main. */
  const rechercheRef = useRef<HTMLInputElement>(null);
  // `null` tant que rien n'a été choisi : la feuille de style garde alors sa
  // largeur par défaut, et son plafond en pourcentage.
  const [largeurs, setLargeurs] = useState<Largeurs>(chargerLargeurs);
  const { t } = useTranslation();
  const [systemesPerso, setSystemesPerso] = useState<SystemePerso[]>(chargerSystemesPerso);
  const { settings } = useAppSettings();
  // null = aucun choix explicite, on retombe sur la plateforme la plus fournie.
  // Au départ, le système d'ouverture réglé dans les paramètres.
  const [chosenPlatform, setChosenPlatform] = useState<string | null>(() =>
    systemeOuverture(
      settings.startSystem,
      lireDernierSysteme(),
      [...new Set(games.map((g) => g.platform || 'Other'))],
      systemesPerso,
    ),
  );
  // Réglages des systèmes des launchers, par plateforme.
  const [reglagesLaunchers, setReglagesLaunchers] = useState(chargerReglagesLaunchers);
  // Éditeur ouvert : clé, dans la galaxie, du système qu'on règle.
  const [editeur, setEditeur] = useState<string | null>(null);
  const editionRef = useRef<EditionScene>(EDITION_INERTE);
  // Système qu'on vient d'enregistrer depuis l'éditeur : la scène montre déjà
  // son état final, le rebâtir ferait clignoter ses planètes pour rien.
  const sansRechargerRef = useRef<string | null>(null);
  // Dialogue ouvert : `systeme` vaut null pour une création.
  const [edition, setEdition] = useState<{ systeme: SystemePerso | null } | null>(null);

  // La scène s'arrête de dessiner quand un calque la recouvre entièrement : les
  // réglages, la musique, ou la fenêtre de création d'un système. Pas
  // l'éditeur, qui sert justement à regarder la scène changer pendant qu'on la
  // règle.
  const calques = useCalques();
  const pauseScene = useRef(false);
  useEffect(() => {
    pauseScene.current = calques.ouvert !== null || edition !== null;
  }, [calques.ouvert, edition]);

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

  const critereTaille: CritereTaille = settings.planetSizeByPlaytime ? 'tempsDeJeu' : 'disque';

  // Le ciel vivant se coupe et se rallume sans reconstruire la scène : elle lit
  // la référence à chaque image.
  const cielRef = useRef(settings.cielVivant);
  useEffect(() => { cielRef.current = settings.cielVivant; }, [settings.cielVivant]);

  // Les événements se coupent à part : on peut vouloir le ciel vivant sans que
  // rien ne vienne traverser le regard.
  const evenementsRef = useRef(settings.evenementsCiel);
  useEffect(() => { evenementsRef.current = settings.evenementsCiel; }, [settings.evenementsCiel]);

  // Et la musique qui les accompagne, portée au module qui la joue — le
  // morceau de chacun, et le volume de chacun.
  useEffect(() => {
    reglerMusiquesEvenements(settings.musiquesEvenements);
  }, [settings.musiquesEvenements]);
  useEffect(() => {
    reglerVolumesEvenements(settings.volumesEvenements);
  }, [settings.volumesEvenements]);

  // Les réglages de graphisme suivent le même chemin : une référence que la
  // scène relit, pour que les changer ne la reconstruise pas.
  const graphismeRef = useRef({
    echelleRendu: settings.echelleRendu,
    limiteIPS: settings.limiteIPS,
    debordement: settings.debordement,
    densiteCiel: settings.densiteCiel,
  });
  useEffect(() => {
    graphismeRef.current = {
      echelleRendu: settings.echelleRendu,
      limiteIPS: settings.limiteIPS,
      debordement: settings.debordement,
      densiteCiel: settings.densiteCiel,
    };
  }, [settings.echelleRendu, settings.limiteIPS, settings.debordement, settings.densiteCiel]);
  // Un système au moins suit un tag : la scène doit alors se refaire quand on
  // tague un jeu, puisque cela change la liste de ses planètes.
  const systemesSuivantUnTag = useMemo(() => systemesPerso.some((s) => s.tag), [systemesPerso]);
  const sceneGames = useSceneGames(games, critereTaille, systemesSuivantUnTag);

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
    const launchers = [...parNom.entries()].map(([p, jeux]) => ({
      platform: p,
      games: jeux,
      reglage: reglagesLaunchers[p],
    }));

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
        // Le réglage entier : la couleur de l'étoile et son nuage manquaient,
        // et ne s'affichaient donc jamais hors de l'aperçu de l'éditeur.
        reglage: reglageDeSysteme(s),
      }))
      .filter((s) => s.games.length > 0);

    return [...launchers, ...perso];
  }, [sceneGames, systemesPerso, reglagesLaunchers]);

  /**
   * Ce qui oblige à reconstruire la galaxie : les jeux affichés, et pour chaque
   * système personnalisé ce que seule la construction de la galaxie applique —
   * nom, couleur, couleur de l'étoile, nuage d'étoiles, présence d'un soleil —
   * et son encombrement.
   *
   * L'encombrement compte parce que la galaxie place ses systèmes d'après lui,
   * une fois pour toutes : un système agrandi dans l'éditeur débordait sur ses
   * voisins jusqu'au prochain démarrage. Arrondi au supérieur, il ne change
   * qu'avec les placements qui l'élargissent vraiment.
   *
   * Ni ses jeux ni ses autres placements : les changer ne rebâtit que lui,
   * sans relancer la caméra (voir `editionRef`).
   */
  const cleScene = useMemo(() => {
    const presents = new Set(parPlateforme.map((p) => p.platform));
    return [
      critereTaille,
      sceneSignature(sceneGames, critereTaille, systemesSuivantUnTag),
      ...systemesPerso.map((s) =>
        [
          s.id,
          s.nom,
          s.couleur,
          s.couleurSoleil ?? '',
          String(s.etoiles),
          String(Math.ceil(rayonSysteme(s.jeux.length, s))),
          presents.has(cleSysteme(s)) ? '1' : '0',
        ].join('\u0000'),
      ),
      ...Object.entries(reglagesLaunchers).map(([p, r]) =>
        [
          p,
          r.couleurSoleil ?? '',
          String(r.etoiles),
          String(Math.ceil(rayonSysteme(parPlateforme.find((e) => e.platform === p)?.games.length ?? 0, r))),
        ].join('\u0000'),
      ),
    ].join('\u0001');
  }, [sceneGames, systemesPerso, parPlateforme, reglagesLaunchers, critereTaille, systemesSuivantUnTag]);

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

  // Tags déjà posés dans la bibliothèque : proposés en premier sur la fiche.
  const tagsConnus = useMemo(() => tagsDeLaBibliotheque(games).map((x) => x.tag), [games]);

  const launcherIcons = useLauncherIcons();

  // Le launcher courant, offert à la scène par référence.
  //
  // La scène ne le lit qu'à son montage, pour savoir devant quel système poser
  // la caméra. Le passer en valeur la ferait se reconstruire à chaque voyage,
  // puisque arriver quelque part met cet état à jour.
  const platformRef = useRef(platform);
  useEffect(() => {
    platformRef.current = platform;
    // Retenu pour le réglage « dernier système visité ».
    if (platform) enregistrerDernierSysteme(platform);
  }, [platform]);

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

  function annulerEditeur(cle: string) {
    editionRef.current.terminer(cle, true);
    setEditeur(null);
  }

  /** Enregistre les réglages d'un launcher ; ceux par défaut ne sont pas gardés. */
  function enregistrerLauncher(plateforme: string, s: SystemePerso) {
    const suivants = { ...reglagesLaunchers };
    if (estReglageDefaut(s)) delete suivants[plateforme];
    else suivants[plateforme] = reglageDeSysteme(s);
    setReglagesLaunchers(suivants);
    enregistrerReglagesLaunchers(suivants);
    editionRef.current.terminer(plateforme, false);
    setEditeur(null);
  }

  // Un système de tag n'a pas de liste à tenir : ses jeux sont ceux qui
  // portent le tag, et ces deux fonctions ne lui sont pas proposées.
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

  const titreListe = systemeCourant?.nom ?? nomPlateforme(platform, t);
  const teinteListe = systemeCourant?.couleur ?? PLATFORM_CSS[platform] ?? '#7a8a9a';

  // Change quand un réglage de débogage fixe un nombre d'objets — étoiles,
  // astéroïdes : la scène doit alors être reconstruite. Toujours zéro en
  // production, où rien ne modifie les réglages.
  const structure = useSyncExternalStore(abonnerReglages, versionStructure);

  // Posé avant la scène, dont l'effet s'exécute après celui-ci dans le même
  // passage : elle bâtit ses planètes avec le critère à jour.
  useEffect(() => definirCritereTaille(critereTaille), [critereTaille]);

  useSolarScene({
    mountRef,
    cielRef,
    evenementsRef,
    graphismeRef,
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
    pauseRef: pauseScene,
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

  /**
   * Raccourcis de l'application, en une seule écoute.
   *
   * Répartis entre plusieurs composants, ils finissaient par se marcher dessus
   * — et personne ne pouvait dire lesquels existaient. Ceux de la scène
   * (déplacement) restent à la scène : ils se règlent, et ils ne valent que
   * lorsqu'elle a le focus.
   *
   * Rien ne se déclenche pendant qu'on tape : un champ de saisie ou une zone
   * éditable garde la main, sans quoi écrire « favori » dans la recherche
   * basculerait huit fois le favori du jeu choisi.
   */
  const raccourcisRef = useRef({ selectedGame, systemes: [] as string[] });
  useEffect(() => {
    raccourcisRef.current.selectedGame = selectedGame;
    raccourcisRef.current.systemes = [
      ...platforms.map((p) => p.name),
      ...systemesPerso.map((sys) => cleSysteme(sys)),
    ];
  }, [selectedGame, platforms, systemesPerso]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const saisie = !!cible && (
        cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable
      );

      // Chercher : la seule qui doit fonctionner **depuis** un champ, pour
      // revenir à la recherche quand on s'est égaré ailleurs.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        rechercheRef.current?.focus();
        rechercheRef.current?.select();
        return;
      }

      if (saisie || e.ctrlKey || e.metaKey || e.altKey) return;

      // `?` se tape avec Maj sur un clavier français comme anglais : on lit le
      // caractère produit, non la touche physique.
      if (e.key === '?') {
        e.preventDefault();
        setAideOuverte((v) => !v);
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        const jeu = raccourcisRef.current.selectedGame;
        if (!jeu) return;
        e.preventDefault();
        handleGameUpdate({ ...jeu, favorite: !jeu.favorite });
        return;
      }

      // Les chiffres suivent l'ordre de la barre : launchers, puis systèmes
      // personnalisés. `e.code` plutôt que `e.key` pour que la rangée du haut
      // marche aussi sur un clavier AZERTY, où elle produit des symboles.
      const rang = /^Digit([1-9])$/.exec(e.code);
      if (rang) {
        const cle = raccourcisRef.current.systemes[Number(rang[1]) - 1];
        if (!cle) return;
        e.preventDefault();
        choisirSysteme(cle);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `choisirSysteme` et `handleGameUpdate` sont redéfinis à chaque rendu ;
    // les données changeantes passent par la référence ci-dessus, l'écoute
    // n'est donc posée qu'une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      className={[css.page, glisse ? css.pageGlisse : ''].filter(Boolean).join(' ')}
      style={styleColonnes}
    >
      {/* La page n'avait aucun titre : un lecteur d'écran ne pouvait pas la
          nommer. Visible pour lui seul, la barre d'en-tête l'affiche déjà. */}
      <h1 className="sr-only">{t('nav.solarSystem')}</h1>

      {/* Marque de l'application, dans le coin haut gauche de la scène — là où
          le panneau de navigation la portait. Décorative : le nom est déjà
          annoncé par le titre ci-dessus, et rien ne se clique ici. */}
      <div className={`${css.marque} theme-espace`} aria-hidden="true">
        <img src={logo} className={css.marqueLogo} alt="" draggable={false} />
        <span className={css.marqueNom}>{t('nav.brandName')}</span>
      </div>

      {/* La scène et ses étiquettes sont écartées de l'arbre d'accessibilité :
          un canvas ne s'explore pas, et la liste de droite en donne l'équivalent
          — mêmes jeux, vrais boutons, atteignables au clavier. */}
      <div ref={mountRef} className={css.canvas} aria-hidden="true" />

      {/* Labels HTML, positionnés par projection caméra depuis la scène */}
      <div ref={labelsRef} className={`${css.labels} theme-espace`} aria-hidden="true" />

      {/* Témoin de la largeur animée de la colonne : la scène le mesure pour
          décaler sa projection en suivant la transition CSS (voir applyView). */}
      <div ref={sideProbeRef} className={css.sideProbe} />
      <div ref={navProbeRef} className={css.navProbe} />

      {/* Compteur d'images, écrit par la scène sans passer par React. */}
      {/* Verrière du cockpit, décorative : elle encadre la scène sans rien
          capter ni rien annoncer. */}
      <div className={css.verriere} aria-hidden="true" />

      {/* La pastille du compteur. Un attribut plutôt qu'un style en ligne :
          le panneau de débogage garde ainsi le pouvoir de la masquer par sa
          variable, qu'un style en ligne écraserait. */}
      <div ref={fpsRef} className={css.fps} data-visible={settings.afficherIPS} />

      <FlyKeysPanel settings={flySettings} onChange={setFlySettings} />

      {/* Liste des jeux du launcher, réglable en largeur par ses poignées. */}
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
        titre={titreListe}
        teinte={teinteListe}
        systemes={systemesPerso}
        onCreerSysteme={() => setEdition({ systeme: null })}
        onModifierSysteme={() => {
          setEditeur(systemeCourant ? cleSysteme(systemeCourant) : platform);
        }}
        onAjouterAuSysteme={systemeCourant && !systemeCourant.tag ? ajouterAuSysteme : undefined}
        onRetirerDuSysteme={systemeCourant && !systemeCourant.tag ? retirerDuSysteme : undefined}
        largeurListe={largeurs.liste ?? LARGEUR_LISTE.defaut}
        largeurRail={largeurs.rail ?? LARGEUR_RAIL.defaut}
        onLargeurListe={(v, e) => poserLargeur('liste', v, e)}
        onLargeurRail={(v, e) => poserLargeur('rail', v, e)}
        onLargeursParDefaut={largeurParDefaut}
        rechercheRef={rechercheRef}
      />

      {aideOuverte && <AideRaccourcis onFermer={() => setAideOuverte(false)} />}

      {(() => {
        if (!editeur) return null;
        const edite = systemesPerso.find((x) => cleSysteme(x) === editeur);
        if (edite) {
          return (
            <EditeurSysteme
              key={editeur}
              cle={editeur}
              systeme={edite}
              games={games}
              edition={editionRef}
              onEnregistrer={enregistrerDepuisEditeur}
              onAnnuler={() => annulerEditeur(editeur)}
              onSupprimer={supprimerSysteme}
            />
          );
        }
        const entree = parPlateforme.find((p) => p.platform === editeur && !estSystemePerso(p.platform));
        if (!entree) return null;
        return (
          <EditeurSysteme
            key={editeur}
            cle={editeur}
            launcher
            systeme={systemeDeLauncher(editeur, entree.games, reglagesLaunchers[editeur], t)}
            games={games}
            edition={editionRef}
            onEnregistrer={(s) => enregistrerLauncher(editeur, s)}
            onAnnuler={() => annulerEditeur(editeur)}
            onSupprimer={() => {}}
          />
        );
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
            tagsConnus={tagsConnus}
            onClose={() => clearPlanetRef.current()}
            onUpdate={handleGameUpdate}
            onRemove={handleGameRemove}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Un launcher présenté à l'éditeur comme un système.
 *
 * Ses jeux sont ceux de la galaxie, dans l'ordre de leurs orbites ; son nom et
 * sa couleur sont ceux du launcher. Seuls ses réglages seront gardés.
 */
function systemeDeLauncher(
  plateforme: string,
  jeux: readonly Game[],
  reglage: ReglageSysteme | undefined,
  t: TFunction,
): SystemePerso {
  return {
    ...nouveauSysteme({
      id: plateforme,
      nom: nomPlateforme(plateforme, t),
      icone: ICONE_PAR_DEFAUT,
      couleur: PLATFORM_CSS[plateforme] ?? '#7a8a9a',
      jeux: jeux.map((g) => g.id),
    }),
    ...REGLAGE_DEFAUT,
    ...reglage,
  };
}
