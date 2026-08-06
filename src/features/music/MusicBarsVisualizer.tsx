import { useEffect, useRef } from 'react';
import { getMusicPlaying, getAnalyser, resumeCtx } from './musicAnalyser';

const N_BARS      = 120;
const MAX_H       = 20;   // px
const SPREAD      = 35;   // barres touchées de chaque côté
const IDLE_SPEED  = 1.0;  // rad/s en veille

export function MusicBarsVisualizer() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const rafRef        = useRef<number>(0);

  // Initialisés dans l'effet et non ici : `performance.now()` et `Math.random()`
  // sont impurs, les appeler pendant le rendu casse l'idempotence attendue par
  // React (et empêche le compilateur de mémoïser le composant).
  const prevTime      = useRef(0);

  // État du pic courant — position tirée au hasard au premier passage
  const peakPos       = useRef(-1);
  const energy        = useRef(0);      // énergie actuelle 0-1 (lerpée)
  const heights       = useRef<Float32Array>(new Float32Array(N_BARS).fill(0));

  // Détection de beat
  const freqData      = useRef<Uint8Array>(new Uint8Array(1024));
  const avgBass       = useRef(0.05);
  const beatCooldown  = useRef(0);

  // Animation en veille
  const idlePhase     = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bars = Array.from(container.children) as HTMLElement[];

    // Amorçage des valeurs impures, hors phase de rendu
    prevTime.current = performance.now();
    if (peakPos.current < 0) peakPos.current = Math.floor(Math.random() * N_BARS);

    function frame() {
      rafRef.current = requestAnimationFrame(frame);
      const now = performance.now();
      const dt  = Math.min((now - prevTime.current) / 1000, 0.05);
      prevTime.current = now;

      const playing  = getMusicPlaying();
      const analyser = getAnalyser();
      let   targetE  = 0;

      if (playing && analyser) {
        // ── Données réelles ──────────────────────────────────────
        resumeCtx();
        analyser.getByteFrequencyData(freqData.current);

        // Énergie basse (bins 0-25 ≈ 0-540 Hz) — réagit aux beats
        let bass = 0;
        for (let j = 0; j < 25; j++) bass += freqData.current[j];
        bass = bass / 25 / 255;

        // Moyenne exponentielle pour avoir une référence "calme"
        avgBass.current += (bass - avgBass.current) * 0.08;

        beatCooldown.current = Math.max(0, beatCooldown.current - dt);

        // Beat détecté : énergie significativement > moyenne ET cooldown écoulé
        const isBeat = bass > avgBass.current * 1.5 && bass > 0.05 && beatCooldown.current === 0;
        if (isBeat) {
          peakPos.current    = Math.floor(Math.random() * N_BARS);
          beatCooldown.current = 0.18; // max ~5-6 pics/s
        }

        targetE = Math.min(1, bass * 2.2); // amplifié pour que ce soit visible

      } else if (!playing) {
        // ── Animation veille ────────────────────────────────────
        idlePhase.current += IDLE_SPEED * dt;
        if (idlePhase.current >= Math.PI) {
          idlePhase.current -= Math.PI;
          peakPos.current = Math.floor(Math.random() * N_BARS);
        }
        targetE = Math.sin(idlePhase.current) * 0.28;
      }

      // Lerp de l'énergie (attaque rapide, déclin progressif)
      const lerpUp   = playing ? 0.45 : 0.12;
      const lerpDown = playing ? 0.12 : 0.05;
      energy.current += (targetE - energy.current) * (targetE > energy.current ? lerpUp : lerpDown);

      const E = energy.current;
      const p = peakPos.current;

      for (let i = 0; i < N_BARS; i++) {
        const dist  = Math.abs(i - p);
        // Chaque barre est strictement plus basse que la précédente vers le centre
        const decay = Math.max(0, 1 - dist / SPREAD);
        const target = E * decay;

        heights.current[i] += (target - heights.current[i]) * (playing ? 0.30 : 0.07);

        const hh = heights.current[i] * MAX_H;
        const op = 0.10 + heights.current[i] * 0.72;

        if (bars[i]) {
          bars[i].style.height  = `${Math.max(1, hh)}px`;
          bars[i].style.opacity = `${Math.min(1, op).toFixed(3)}`;
        }
      }
    }

    frame();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-end',
        gap: '0px',
        padding: '0 2px',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: N_BARS }, (_, i) => (
        <div
          key={i}
          style={{ flex: 1, minWidth: 1, height: '1px', background: 'white', borderRadius: '1px 1px 0 0' }}
        />
      ))}
    </div>
  );
}
