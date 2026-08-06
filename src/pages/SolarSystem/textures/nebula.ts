import * as THREE from 'three';
import { seededRng } from '../lib/random';

/**
 * Fond de galaxie : nébuleuse équirectangulaire peinte sur canvas, teintée
 * selon la couleur de la plateforme.
 */
export function makeNebulaTexture(tint: number): THREE.CanvasTexture {
  const w = 2048, h = 1024;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;

  c.fillStyle = '#04060d';
  c.fillRect(0, 0, w, h);

  const rng = seededRng(tint);
  const base = new THREE.Color(tint);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  // Quelques couleurs de nuage dérivées de la teinte de la plateforme.
  // Le décalage de teinte reste étroit pour que la nébuleuse garde une seule
  // famille chromatique — plus large, le bleu Steam virait au vert.
  const clouds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const shifted = new THREE.Color().setHSL(
      (hsl.h + (i - 2) * 0.035 + 1) % 1,
      Math.min(1, hsl.s * 0.85),
      0.09 + i * 0.025,
    );
    clouds.push('#' + shifted.getHexString());
  }

  // Nuages diffus, volontairement discrets pour que planètes et orbites
  // restent lisibles. Chaque tache est dessinée trois fois (x-w, x, x+w) afin
  // de traverser la couture de la texture au lieu d'y être coupée net.
  function blob(x: number, y: number, r: number, col: string) {
    for (const ox of [-w, 0, w]) {
      const cx = x + ox;
      if (cx + r < 0 || cx - r > w) continue;
      const g = c.createRadialGradient(cx, y, 0, cx, y, r);
      g.addColorStop(0, col + '2a');
      g.addColorStop(0.4, col + '12');
      g.addColorStop(1, col + '00');
      c.fillStyle = g;
      c.fillRect(cx - r, y - r, r * 2, r * 2);
    }
  }

  for (let i = 0; i < 54; i++) {
    blob(
      rng() * w,
      h * 0.25 + rng() * h * 0.5,
      100 + rng() * 320,
      clouds[Math.floor(rng() * clouds.length)],
    );
  }

  // Le mapping équirectangulaire écrase les rangées du haut et du bas en un
  // point : toute variation y devient une étoile de rayons. On rabat donc les
  // pôles sur une couleur plate avant de semer les étoiles.
  const poleH = h * 0.3;
  const gTop = c.createLinearGradient(0, 0, 0, poleH);
  gTop.addColorStop(0, '#04060d');
  gTop.addColorStop(1, '#04060d00');
  c.fillStyle = gTop;
  c.fillRect(0, 0, w, poleH);

  const gBot = c.createLinearGradient(0, h, 0, h - poleH);
  gBot.addColorStop(0, '#04060d');
  gBot.addColorStop(1, '#04060d00');
  c.fillStyle = gBot;
  c.fillRect(0, h - poleH, w, poleH);

  // Champ d'étoiles lointaines — la densité décroît vers les pôles, la
  // pondération en sinus correspondant à la surface réelle sur la sphère.
  for (let i = 0; i < 3200; i++) {
    const x = rng() * w;
    const y = rng() * h;
    if (rng() > Math.sin((y / h) * Math.PI)) continue;
    const b = 170 + Math.floor(rng() * 85);
    const sz = rng() < 0.92 ? 1 : 2;
    c.fillStyle = `rgba(${b},${b},${Math.min(255, b + 30)},${0.25 + rng() * 0.75})`;
    c.fillRect(x, y, sz, sz);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  // Enroulement horizontal : l'échantillonnage à travers la couture interpole
  // au lieu de clamper sur le dernier pixel
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
