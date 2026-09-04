import { useEffect, useRef } from 'react';
import { dessinerTunnel, semerParticules } from '../lib/warpTunnel';

/**
 * Tunnel de particules joué pendant la traversée d'un portail.
 *
 * Dessiné sur une canvas 2D et non en CSS : l'effet demande des centaines de
 * traits qui s'allongent à mesure qu'ils s'éloignent du centre. En CSS il
 * aurait fallu autant d'éléments animés, donc autant de calques promus, pour un
 * résultat plus pauvre.
 *
 * Et dessiné **dans un worker** quand la plateforme le permet. Changer de
 * launcher reconstruit toute la scène 3D de façon synchrone — mesuré à 222 ms
 * sur soixante jeux — et une boucle `requestAnimationFrame` s'arrête net
 * pendant ce temps, en plein vol. Le worker, lui, continue de dessiner : c'est
 * tout l'objet de `transferControlToOffscreen`.
 *
 * Le repli sur le fil principal reste là pour les moteurs sans
 * `OffscreenCanvas` : l'animation s'y fige à la couture, comme avant, mais
 * elle ne disparaît pas.
 *
 * Le voile opaque, lui, reste en CSS : porté par le compositeur, il couvre la
 * couture même si tout le reste s'interrompt.
 */

type Props = {
  /** Phase en cours, ou `null` au repos. */
  phase: 'out' | 'in' | null;
  /** Durée totale de la traversée, les deux phases réunies. */
  dureeMs: number;
  /** Couleur du launcher, dont quelques particules se teintent. */
  tint: string;
  className?: string;
};

export function WarpTunnel({ phase, dureeMs, tint, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  /** Le transfert au worker n'a lieu qu'une fois pour la vie de la canvas. */
  const transfereRef = useRef(false);

  // La teinte change au basculement de phase : la lire dans une ref évite de
  // relancer l'animation, qui repartirait de zéro au milieu du vol. Écrite par
  // un effet et non pendant le rendu — un rendu abandonné laisserait sinon la
  // ref sur une valeur qui n'a jamais été affichée.
  const tintRef = useRef(tint);
  useEffect(() => {
    tintRef.current = tint;
    workerRef.current?.postMessage({ type: 'teinte', tint });
  }, [tint]);

  // Worker créé une fois pour toutes : la canvas ne peut céder son contrôle
  // qu'une seule fois, et le recréer à chaque voyage coûterait un démarrage de
  // fil d'exécution au pire moment.
  useEffect(() => {
    const cv = ref.current;
    if (!cv || typeof cv.transferControlToOffscreen !== 'function') return;

    let w: Worker;
    try {
      w = new Worker(new URL('../lib/warpTunnel.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      return; // repli sur le fil principal
    }
    workerRef.current = w;

    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  // L'effet ne dépend que du fait qu'un voyage soit en cours, jamais de la
  // phase : passer de « sortie » à « entrée » ne doit pas réamorcer le tunnel.
  const actif = phase !== null;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    if (!actif) {
      workerRef.current?.postMessage({ type: 'arreter' });
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Plafonné à 2 : au-delà, la densité de pixels ne se voit plus sur des
    // traits fins et ne fait que quadrupler la surface à remplir.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const largeur = cv.clientWidth;
    const hauteur = cv.clientHeight;
    if (largeur === 0 || hauteur === 0) return;

    const worker = workerRef.current;
    if (worker) {
      const depart: Record<string, unknown> = {
        type: 'demarrer', largeur, hauteur, dpr, dureeMs, tint: tintRef.current,
      };
      let cede = transfereRef.current;
      if (!cede) {
        try {
          // Refusé si un contexte 2D a déjà été demandé sur cette canvas. Ne
          // devrait pas arriver — elle n'existe que pour cela — mais un échec
          // ici ne doit pas emporter la page : on retombe sur le fil principal.
          const offscreen = cv.transferControlToOffscreen();
          depart.canvas = offscreen;
          worker.postMessage(depart, [offscreen]);
          transfereRef.current = true;
          cede = true;
        } catch {
          workerRef.current = null;
        }
      } else {
        worker.postMessage(depart);
      }
      if (cede) return () => worker.postMessage({ type: 'arreter' });
    }

    // ── Repli : boucle sur le fil principal ──────────────────────────────
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    cv.width = Math.round(largeur * dpr);
    cv.height = Math.round(hauteur * dpr);
    ctx.scale(dpr, dpr);

    const particules = semerParticules();
    let raf = 0;
    const t0 = performance.now();

    const dessiner = (t: number) => {
      raf = requestAnimationFrame(dessiner);
      dessinerTunnel(ctx, {
        largeur, hauteur,
        u: Math.min((t - t0) / dureeMs, 1),
        particules,
        tint: tintRef.current,
      });
    };
    raf = requestAnimationFrame(dessiner);

    return () => {
      cancelAnimationFrame(raf);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
    };
  }, [actif, dureeMs]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
