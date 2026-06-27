import { useEffect, useRef } from 'react';
import { useMusicPlayer } from './MusicContext';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  baseSize: number;
  baseOpacity: number;
  layer: number; // 0=basse, 1=médium, 2=aigu
}

const N = 130;

function makeParticles(w: number, h: number): Particle[] {
  return Array.from({ length: N }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.25,
    vy: Math.random() * 0.35 + 0.08,
    baseSize: Math.random() * 1.4 + 0.3,
    baseOpacity: Math.random() * 0.05 + 0.02,
    layer: Math.floor(Math.random() * 3),
  }));
}

// Simulation de fréquences musicales — trois "couches" à des rythmes différents.
// N'utilise pas la Web Audio API pour éviter de reroutager l'élément audio.
function getBeatEnergy(layer: number, t: number): number {
  const bpm = 2.1; // ~126 BPM en Hz
  const kick  = Math.pow(Math.max(0, Math.sin(t * bpm * Math.PI)), 6);
  const snare = Math.pow(Math.max(0, Math.sin(t * bpm * Math.PI + Math.PI)), 8) * 0.65;
  const hihat = Math.pow(Math.max(0, Math.sin(t * bpm * 4 * Math.PI)), 14) * 0.3;
  if (layer === 0) return kick + snare * 0.15;
  if (layer === 1) return snare + kick * 0.2;
  return hihat + Math.random() * 0.06;
}

export function MusicVisualizer() {
  const { isPlaying } = useMusicPlayer();
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const particles   = useRef<Particle[]>([]);
  const rafRef      = useRef<number>(0);
  const playingRef  = useRef(isPlaying);

  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (particles.current.length === 0) {
        particles.current = makeParticles(canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    function frame() {
      rafRef.current = requestAnimationFrame(frame);
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const playing = playingRef.current;
      const t = performance.now() / 1000;
      const bassEnergy = playing ? getBeatEnergy(0, t) : 0;

      for (const p of particles.current) {
        const energy = playing ? getBeatEnergy(p.layer, t) : 0;

        p.x += p.vx + (Math.random() - 0.5) * 0.12 * (1 + energy * 4);
        p.y += p.vy * (1 + bassEnergy * 2.5);

        if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; }
        if (p.x < 0)      p.x = w;
        if (p.x > w)      p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.baseSize + energy * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, p.baseOpacity + energy * 0.78)})`;
        ctx.fill();
      }
    }

    frame();
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9 }}
    />
  );
}
