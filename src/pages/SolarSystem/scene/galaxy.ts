import * as THREE from 'three';
import type { Game } from '../../../features/types';
import { PLATFORM_COLOR } from '../constants';
import { placerSystemes, rayonGalaxie, type Astre } from '../lib/galaxyLayout';
import { hashStr, seededRng } from '../lib/random';
import { dimensionnerSysteme, type TailleSysteme } from '../lib/systemSize';
import { createBelt, createSun } from './decor';
import { createPlanetGlow, createPlanets } from './planets';
import type { PlanetEntry } from './types';

/**
 * Distances de construction et de libération d'un système, en multiples de son
 * propre rayon.
 *
 * Deux seuils et non un seul : entre les deux, on ne fait rien. Un seuil unique
 * ferait basculer un système entre construit et libéré à chaque frame dès que
 * la caméra flotte à cette distance précise — soit plusieurs centaines de
 * millisecondes de construction par seconde.
 */
const SEUIL_CHARGE = 4.5;
const SEUIL_LIBERE = 6.5;

export type SystemeGalaxie = {
  platform: string;
  games: Game[];
  /** Position du soleil dans la galaxie. */
  centre: THREE.Vector3;
  taille: TailleSysteme;
  /** Porte le soleil, la ceinture et — quand il est construit — les planètes. */
  groupe: THREE.Group;
  /** Les planètes sont-elles construites ? */
  charge: boolean;
  planets: PlanetEntry[];
  /**
   * Sphère invisible englobant le soleil, offerte au pointeur.
   *
   * Le soleil lui-même est un assemblage de coques translucides que le rayon
   * traverserait de façon imprévisible ; et de très loin, il ne couvre que
   * quelques pixels. Cette sphère donne une cible franche et généreuse : c'est
   * elle qu'on désigne pour se rendre dans un système.
   */
  hitSoleil: THREE.Mesh;
  /** Ceinture d'astéroïdes, absente sur les tout petits systèmes. */
  ceinture: THREE.InstancedMesh | null;
};

type Options = {
  scene: THREE.Scene;
  /** Une entrée par launcher, dans n'importe quel ordre. */
  parPlateforme: Array<{ platform: string; games: Game[] }>;
  /** Interroge le montage : coupe les chargements arrivés après démontage. */
  isDisposed: () => boolean;
  /**
   * Tableaux de sélection partagés avec le pointeur, **mutés en place**.
   *
   * Le pointeur les reçoit une fois pour toutes à sa création ; les remplacer
   * lui laisserait des références périmées et le rendrait aveugle aux systèmes
   * construits depuis.
   */
  planets: PlanetEntry[];
  pickMeshes: THREE.Object3D[];
  meshToEntry: Map<THREE.Object3D, PlanetEntry>;
  /** Étiquette une planète qui vient d'apparaître. */
  onPlanet: (entry: PlanetEntry) => void;
  /** Retire les étiquettes d'un système libéré. */
  onSystemeLibere: (systeme: SystemeGalaxie) => void;
};

/**
 * Tous les systèmes solaires dans un seul espace.
 *
 * Chaque launcher a le sien, posé quelque part dans la galaxie et gardant sa
 * taille réelle — celle qui découle du nombre de jeux. Seul le soleil existe en
 * permanence : les planètes ne sont construites qu'à l'approche, et libérées
 * ensuite.
 *
 * C'est la condition pour que l'ensemble tienne. Construire les sept systèmes
 * d'un coup coûtait une à trois secondes de gel — exactement ce qu'on venait de
 * supprimer au démarrage.
 */
export function createGalaxy({
  scene, parPlateforme, isDisposed, planets, pickMeshes, meshToEntry,
  onPlanet, onSystemeLibere,
}: Options) {
  const astres: Astre[] = parPlateforme.map((p) => ({
    platform: p.platform,
    rayon: dimensionnerSysteme(p.games.length).systemR,
  }));

  // Graine tirée des noms de launchers : la galaxie garde la même forme d'une
  // session à l'autre tant que la bibliothèque ne change pas de launchers.
  const rng = seededRng(hashStr([...astres].map((a) => a.platform).sort().join('|')));
  const positions = placerSystemes(astres, rng);

  const systemes: SystemeGalaxie[] = parPlateforme.map((p) => {
    const taille = dimensionnerSysteme(p.games.length);
    const pos = positions.get(p.platform) ?? { x: 0, y: 0, z: 0 };
    const centre = new THREE.Vector3(pos.x, pos.y, pos.z);

    const groupe = new THREE.Group();
    groupe.position.copy(centre);
    scene.add(groupe);

    // Le soleil reste en place quoi qu'il arrive : c'est lui qui signale le
    // système de loin, une fois ses planètes libérées.
    const soleil = createSun(taille.sunR, taille.outerR * 0.42);
    groupe.add(soleil.group);

    const ceinture = createBelt(taille.outerR, p.games.length);
    if (ceinture) groupe.add(ceinture);

    const hitSoleil = new THREE.Mesh(
      new THREE.SphereGeometry(taille.sunR * 1.6, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    groupe.add(hitSoleil);

    return {
      platform: p.platform,
      games: p.games,
      centre,
      taille,
      groupe,
      charge: false,
      planets: [],
      hitSoleil,
      ceinture,
    };
  });

  const parNom = new Map(systemes.map((s) => [s.platform, s]));
  const rayon = rayonGalaxie(astres, positions);

  /** Lueurs de repérage, une série par système construit. */
  const lueurs = new Map<string, ReturnType<typeof createPlanetGlow>>();

  /**
   * Système épinglé, jamais libéré tant qu'il l'est.
   *
   * Sert pendant un voyage : le trajet s'élève au-dessus de la galaxie, et à
   * son sommet la caméra est assez loin de la destination pour que la règle de
   * distance la libère — celle qu'on venait justement de construire au départ.
   * Elle serait rebâtie à l'approche, produisant un à-coup à l'instant précis
   * où l'on se pose.
   */
  let epingle: string | null = null;

  function charger(s: SystemeGalaxie): void {
    if (s.charge || isDisposed()) return;
    s.charge = true;

    const resultat = createPlanets({
      scene: s.groupe,
      games: s.games,
      orbStep: s.taille.orbStep,
      orbBase: s.taille.orbBase,
      tint: PLATFORM_COLOR[s.platform] ?? 0x7a8a9a,
      isDisposed,
      onPlanet,
    });

    s.planets = resultat.planets;
    planets.push(...resultat.planets);
    pickMeshes.push(...resultat.pickMeshes);
    for (const [mesh, entry] of resultat.meshToEntry) meshToEntry.set(mesh, entry);

    const lueur = createPlanetGlow(resultat.planets);
    s.groupe.add(lueur.points);
    lueurs.set(s.platform, lueur);
  }

  function liberer(s: SystemeGalaxie): void {
    if (!s.charge) return;
    s.charge = false;

    onSystemeLibere(s);

    for (const p of s.planets) {
      const i = planets.indexOf(p);
      if (i >= 0) planets.splice(i, 1);
      const j = pickMeshes.indexOf(p.mesh);
      if (j >= 0) pickMeshes.splice(j, 1);
      meshToEntry.delete(p.mesh);

      s.groupe.remove(p.mesh);
      // Anneaux et atmosphère sont portés par la planète : tout ce qu'elle
      // porte disparaît avec elle. Sans ce parcours, chaque aller-retour
      // laisserait derrière lui la géométrie et les textures d'un système.
      p.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        if (m.material) libererMateriau(m.material);
      });
    }
    s.planets = [];

    // Les anneaux d'orbite vivent dans le groupe, hors des planètes.
    for (const enfant of [...s.groupe.children]) {
      const m = enfant as THREE.Mesh;
      if (m.geometry?.type !== 'TorusGeometry') continue;
      s.groupe.remove(m);
      m.geometry.dispose();
      if (m.material) libererMateriau(m.material);
    }

    const lueur = lueurs.get(s.platform);
    if (lueur) {
      s.groupe.remove(lueur.points);
      lueur.dispose();
      lueurs.delete(s.platform);
    }
  }

  return {
    systemes,
    /** Rayon englobant toute la galaxie. */
    rayon,

    get(platform: string): SystemeGalaxie | undefined {
      return parNom.get(platform);
    },

    /** Construit un système sans attendre que la caméra s'en approche. */
    forcer(platform: string): SystemeGalaxie | undefined {
      const s = parNom.get(platform);
      if (s) charger(s);
      return s;
    },

    /**
     * Protège un système de la libération, ou lève la protection avec `null`.
     *
     * Un seul à la fois : c'est la destination du voyage en cours, et il n'y en
     * a jamais qu'un.
     */
    epingler(platform: string | null): void {
      epingle = platform;
    },

    /**
     * Recale les lueurs de repérage sur les planètes qui viennent de bouger.
     * À appeler après leur déplacement, sinon elles traînent d'une frame.
     */
    updateLueurs(): void {
      for (const l of lueurs.values()) l.update();
    },

    /**
     * Ajuste ce qui est construit à la position de la caméra.
     *
     * Au plus une construction par frame : elle est synchrone, en enchaîner
     * plusieurs produirait le gel qu'on cherche justement à éviter.
     */
    update(camera: THREE.Camera): void {
      // Les libérations d'abord, et sans limite : elles ne coûtent presque rien
      // et rendent la place avant la construction qui suit.
      for (const s of systemes) {
        if (!s.charge || s.platform === epingle) continue;
        if (camera.position.distanceTo(s.centre) > s.taille.systemR * SEUIL_LIBERE) {
          liberer(s);
        }
      }

      // Puis la plus proche des constructions en attente : c'est celle qu'on
      // verra en premier.
      let candidat: SystemeGalaxie | null = null;
      let meilleure = Infinity;
      for (const s of systemes) {
        if (s.charge) continue;
        const d = camera.position.distanceTo(s.centre);
        if (d < s.taille.systemR * SEUIL_CHARGE && d < meilleure) {
          meilleure = d;
          candidat = s;
        }
      }
      if (candidat) charger(candidat);
    },

    dispose(): void {
      for (const s of systemes) {
        liberer(s);
        scene.remove(s.groupe);
        s.groupe.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
          if (m.material) libererMateriau(m.material);
        });
      }
      systemes.length = 0;
      parNom.clear();
    },
  };
}

/** Libère un matériau et ses textures, qu'il soit seul ou en tableau. */
function libererMateriau(mat: THREE.Material | THREE.Material[]): void {
  for (const m of Array.isArray(mat) ? mat : [mat]) {
    const std = m as THREE.MeshStandardMaterial;
    std.map?.dispose();
    if (std.emissiveMap && std.emissiveMap !== std.map) std.emissiveMap.dispose();
    m.dispose();
  }
}
