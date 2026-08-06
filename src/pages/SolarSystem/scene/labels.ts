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

  /** Label ancré à une position fixe du monde. */
  addWorld(world: THREE.Vector3, text: string, className: string, color?: string): void {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    if (color) div.style.color = color;
    this.push(div, { world });
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
   */
  update(camera: THREE.Camera, systemR: number): void {
    const el = this.host;
    if (!el) return;

    const w2 = el.clientWidth / 2;
    const h2 = el.clientHeight / 2;
    const camDist = camera.position.length();
    const overview = camDist > systemR * 0.55;
    const maxDist = systemR * 2.6;
    const fadeFrom = systemR * 0.5;
    const fadeSpan = systemR * 1.8;

    for (const lbl of this.labels) {
      let show: boolean;
      let opacity = 1;

      if (lbl.entry) {
        this.proj.copy(lbl.entry.mesh.position);
        const dist = camera.position.distanceTo(this.proj);
        this.proj.y -= lbl.entry.radius * 1.9;
        this.proj.project(camera);
        show = this.proj.z <= 1 && dist <= maxDist;
        if (show) opacity = Math.max(0.18, Math.min(1, 1 - (dist - fadeFrom) / fadeSpan));
      } else if (lbl.world) {
        show = overview;
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

      if (lbl.entry) {
        // Quantifié par pas de 0,05 : inutile de réécrire le style pour une
        // variation d'opacité invisible.
        const q = Math.round(opacity * 20) / 20;
        if (q !== lbl.lastOpacity) {
          lbl.div.style.opacity = String(q);
          lbl.lastOpacity = q;
        }
      }
    }
  }

  dispose(): void {
    if (this.host) this.host.innerHTML = '';
    this.labels = [];
  }
}
