import * as THREE from 'three';
import type { PlanetEntry } from './types';

/**
 * Un label HTML positionné chaque frame par projection caméra.
 *
 * Les dernières valeurs écrites sont mémorisées : à 60 fps et avec plusieurs
 * dizaines de labels, réécrire `transform` et `opacity` alors que rien n'a
 * bougé représentait des milliers d'invalidations de style par seconde.
 */
type Label = {
  div: HTMLDivElement;
  /** Position monde fixe (label de plateforme). */
  world?: THREE.Vector3;
  /** Distance au-delà de laquelle ce label apparaît. */
  seuil?: number;
  /** Planète suivie (label de jeu). */
  entry?: PlanetEntry;
  lastX: number;
  lastY: number;
  lastShown: boolean;
  lastOpacity: number;
};

/**
 * Calque de labels HTML superposé à la scène 3D.
 *
 * Volontairement hors de React : ces éléments bougent à chaque frame, les
 * confier au rendu React reviendrait à re-rendre la page 60 fois par seconde.
 */
export class LabelLayer {
  private labels: Label[] = [];
  private readonly proj = new THREE.Vector3();

  constructor(private readonly host: HTMLElement | null) {}

  /** Label suivant une planète, affiché sous la sphère. */
  addPlanet(entry: PlanetEntry, text: string, className: string): void {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    this.push(div, { entry });
  }

  /**
   * Label ancré à une position fixe du monde.
   *
   * `seuil` est la distance au-delà de laquelle il apparaît : le nom d'un
   * launcher n'a d'intérêt qu'en vue d'ensemble, il encombrerait la vue une
   * fois entré dans son système. Mesurée depuis le label lui-même et non
   * depuis l'origine — dans une galaxie, l'origine n'est le centre de rien.
   */
  addWorld(
    world: THREE.Vector3,
    text: string,
    className: string,
    color?: string,
    seuil = 0,
  ): void {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    if (color) div.style.color = color;
    this.push(div, { world, seuil });
  }

  /**
   * Retire les labels des planètes données.
   *
   * Nécessaire depuis que la galaxie libère les systèmes dont on s'éloigne :
   * sans cela, leurs noms resteraient dans le calque et se projetteraient sur
   * des planètes qui n'existent plus.
   */
  removePlanets(entries: Iterable<PlanetEntry>): void {
    const aRetirer = new Set(entries);
    if (aRetirer.size === 0) return;
    this.labels = this.labels.filter((l) => {
      if (!l.entry || !aRetirer.has(l.entry)) return true;
      l.div.remove();
      return false;
    });
  }

  private push(div: HTMLDivElement, opts: Partial<Label>): void {
    this.host?.appendChild(div);
    this.labels.push({
      div,
      lastX: NaN,
      lastY: NaN,
      lastShown: true,
      lastOpacity: -1,
      ...opts,
    });
  }

  /**
   * Reprojette tous les labels. Doit être appelé **après** `controls.update()`
   * et `camera.updateMatrixWorld()` : projeter avant utiliserait la matrice de
   * la frame précédente et ferait vibrer le texte pendant les déplacements.
   *
   * Les dimensions du calque sont fournies par l'appelant plutôt que relues
   * ici : la boucle les regroupe avec ses autres lectures en tête de frame,
   * avant toute écriture de style (voir tick dans useSolarScene).
   */
  update(
    camera: THREE.Camera,
    systemR: number,
    width: number,
    height: number,
    hovered: PlanetEntry | null,
  ): void {
    const el = this.host;
    if (!el) return;

    const w2 = width / 2;
    const h2 = height / 2;
    const maxDist = systemR * 2.6;

    for (const lbl of this.labels) {
      let show: boolean;
      let opacity = 1;

      if (lbl.entry) {
        // Le nom du jeu ne s'affiche qu'au survol de sa planète. Affiché en
        // permanence, il encombrait la vue d'ensemble d'autant d'étiquettes
        // qu'il y a de jeux.
        //
        // L'apparition passe par l'opacité et non par `display`, seule façon
        // de l'adoucir en CSS. Le label reste donc positionné tant qu'il est
        // dans le champ, mais `display` continue d'écarter ceux qui sont
        // derrière la caméra ou trop lointains — sauf celui qu'on survole,
        // qui doit rester lisible quelle que soit la distance.
        const survole = lbl.entry === hovered;
        // Position **monde** : la planète vit dans le groupe de son système,
        // sa position propre est relative au soleil de celui-ci. La projeter
        // telle quelle rassemblerait tous les noms autour du centre de la
        // galaxie.
        lbl.entry.mesh.getWorldPosition(this.proj);
        const dist = camera.position.distanceTo(this.proj);
        this.proj.y -= lbl.entry.radius * 1.9;
        this.proj.project(camera);
        show = this.proj.z <= 1 && (survole || dist <= maxDist);
        opacity = survole ? 1 : 0;
      } else if (lbl.world) {
        show = camera.position.distanceTo(lbl.world) > (lbl.seuil ?? 0);
        if (show) {
          this.proj.copy(lbl.world).project(camera);
          show = this.proj.z <= 1;
        }
      } else {
        show = false;
      }

      if (!show) {
        if (lbl.lastShown) {
          lbl.div.style.display = 'none';
          lbl.lastShown = false;
        }
        continue;
      }

      if (!lbl.lastShown) {
        lbl.div.style.display = '';
        lbl.lastShown = true;
      }

      // Pixels entiers : les valeurs sous-pixel font baver le texte
      // différemment à chaque frame, ce qui se voit comme un tremblement.
      const x = Math.round(this.proj.x * w2 + w2);
      const y = Math.round(-this.proj.y * h2 + h2);

      if (x !== lbl.lastX || y !== lbl.lastY) {
        lbl.div.style.transform = lbl.entry
          ? `translate(-50%,0) translate(${x}px,${y}px)`
          : `translate(-50%,-50%) translate(${x}px,${y}px)`;
        lbl.lastX = x;
        lbl.lastY = y;
      }

      // Opacité binaire depuis le passage au survol : elle ne vaut plus que 0
      // ou 1, il suffit donc de n'écrire que sur changement d'état.
      if (lbl.entry && opacity !== lbl.lastOpacity) {
        lbl.div.style.opacity = String(opacity);
        lbl.lastOpacity = opacity;
      }
    }
  }

  dispose(): void {
    if (this.host) this.host.innerHTML = '';
    this.labels = [];
  }
}
