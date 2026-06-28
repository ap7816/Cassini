import { useEffect, useRef } from 'react';

interface Star {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  baseOpacity: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

const N = 160;

function makeStars(w: number, h: number): Star[] {
  return Array.from({ length: N }, () => {
    const r = Math.random();
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      // Drift très lent — effet parallaxe spatial
      vx: (Math.random() - 0.5) * 0.04,
      vy: (Math.random() - 0.5) * 0.015,
      // Étoiles grandes = proches (brillantes), petites = lointaines (tenues)
      radius: r < 0.7 ? Math.random() * 0.6 + 0.2 : Math.random() * 1.4 + 0.6,
      baseOpacity: r < 0.7 ? Math.random() * 0.25 + 0.05 : Math.random() * 0.5 + 0.15,
      twinkleSpeed: Math.random() * 1.2 + 0.3,
      twinklePhase: Math.random() * Math.PI * 2,
    };
  });
}

export function MusicVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stars     = useRef<Star[]>([]);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (stars.current.length === 0) {
        stars.current = makeStars(canvas.width, canvas.height);
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

      const t = performance.now() / 1000;

      for (const s of stars.current) {
        s.x += s.vx;
        s.y += s.vy;

        if (s.x < -2) s.x = w + 2;
        if (s.x > w + 2) s.x = -2;
        if (s.y < -2) s.y = h + 2;
        if (s.y > h + 2) s.y = -2;

        // Scintillement sinusoïdal indépendant pour chaque étoile
        const twinkle = Math.sin(t * s.twinkleSpeed + s.twinklePhase) * 0.5 + 0.5;
        const opacity = s.baseOpacity * (0.5 + twinkle * 0.5);

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
        ctx.fill();
      }
    }

    frame();
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
