import { useEffect, useRef } from 'react';

const N = 120;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  baseOpacity: number;
  phase: number;
  phaseSpeed: number;
}

function makeParticles(w: number, h: number): Particle[] {
  return Array.from({ length: N }, () => {
    const speed = Math.random() * 0.6 + 0.1;
    const angle = Math.random() * Math.PI * 2;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.random() * 2.2 + 0.6,
      baseOpacity: Math.random() * 0.35 + 0.15,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: Math.random() * 1.5 + 0.4,
    };
  });
}

export function MusicSnowVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      particles.current = makeParticles(canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function frame() {
      rafRef.current = requestAnimationFrame(frame);
      const w = canvas!.width;
      const h = canvas!.height;
      if (!w || !h) return;

      const t = performance.now() / 1000;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0)  { p.x = 0; p.vx =  Math.abs(p.vx); }
        if (p.x > w)  { p.x = w; p.vx = -Math.abs(p.vx); }
        if (p.y < 0)  { p.y = 0; p.vy =  Math.abs(p.vy); }
        if (p.y > h)  { p.y = h; p.vy = -Math.abs(p.vy); }

        const twinkle = Math.sin(t * p.phaseSpeed + p.phase) * 0.5 + 0.5;
        const opacity = p.baseOpacity * (0.5 + twinkle * 0.5);

        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.radius), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
        ctx.fill();
      }
    }

    frame();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        borderRadius: 'inherit',
      }}
    />
  );
}
