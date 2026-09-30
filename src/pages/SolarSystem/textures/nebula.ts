import * as THREE from 'three';
import { seededRng } from '../lib/random';

/**
 * Le fond du ciel : ce que l'on verrait par un hublot, peint une fois sur une
 * toile et enroulé autour de la scène.
 *
 * Ce qu'on y met vient de ce qu'on verrait vraiment, en plus contrasté :
 *
 *  - **La voie lactée**, une bande qui traverse tout le ciel. Elle n'est pas
 *    lumineuse comme un nuage : c'est de la lumière d'étoiles qu'on ne
 *    distingue plus une à une, donc du grain, et non un aplat.
 *  - **Les couloirs de poussière** qui la coupent en deux par endroits. Ce
 *    sont eux qui donnent son relief à la bande — sans eux, elle n'est qu'une
 *    trace floue. Ils sont plus sombres que le ciel autour : de la poussière
 *    froide qui masque ce qu'il y a derrière.
 *  - **Les nébuleuses en émission**, rouges d'hydrogène et vert bleuté
 *    d'oxygène, les deux raies qui dominent ce que l'on photographie du ciel
 *    profond. Elles se tiennent près de la bande, là où le gaz est.
 *  - **Les étoiles lointaines**, en pointes fixes. Rien ne scintille : il n'y
 *    a pas d'atmosphère pour agiter leur lumière.
 *
 * La teinte de la plateforme regardée reste la famille dominante — c'est elle
 * qui distingue un launcher d'un autre au premier coup d'œil. Le reste s'y
 * accorde sans la recouvrir.
 */
export function makeNebulaTexture(tint: number): THREE.CanvasTexture {
  const w = 2048, h = 1024;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;

  const NOIR = '#04060d';
  c.fillStyle = NOIR;
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
  function blob(x: number, y: number, r: number, col: string, force = 1) {
    const a = (v: number) => Math.round(Math.min(255, v * force)).toString(16).padStart(2, '0');
    for (const ox of [-w, 0, w]) {
      const cx = x + ox;
      if (cx + r < 0 || cx - r > w) continue;
      const g = c.createRadialGradient(cx, y, 0, cx, y, r);
      g.addColorStop(0, col + a(0x2a));
      g.addColorStop(0.4, col + a(0x12));
      g.addColorStop(1, col + '00');
      c.fillStyle = g;
      c.fillRect(cx - r, y - r, r * 2, r * 2);
    }
  }

  for (let i = 0; i < 40; i++) {
    blob(
      rng() * w,
      h * 0.25 + rng() * h * 0.5,
      100 + rng() * 320,
      clouds[Math.floor(rng() * clouds.length)],
    );
  }

  // ── La voie lactée ───────────────────────────────────────────────────────
  //
  // Une bande inclinée, ondulée deux fois sur la largeur : projetée sur la
  // sphère, une ligne droite dans cette image deviendrait un cercle parfait,
  // qu'aucun ciel n'a jamais montré.
  const inclinaison = h * 0.1;
  const bande = (x: number) =>
    h * 0.5
    + Math.sin((x / w) * Math.PI * 2) * inclinaison
    + Math.sin((x / w) * Math.PI * 4 + 1.2) * inclinaison * 0.35;
  const epaisseur = h * 0.16;

  // Le halo de la bande, en larges taches le long de son tracé.
  //
  // Très en dessous de ce que l'œil attend d'un « nuage » : le ciel doit rester
  // noir. Une voie lactée qui se voit franchement est une voie lactée qui lave
  // le fond en gris et rend les orbites illisibles — essayé, et repris.
  for (let i = 0; i < 70; i++) {
    const x = rng() * w;
    const y = bande(x) + (rng() - 0.5) * epaisseur * 1.3;
    blob(x, y, 80 + rng() * 190, '#9fb4d8', 0.24);
  }

  // Les nébuleuses en émission, posées près de la bande : hydrogène rouge,
  // oxygène vert bleuté, et rien ailleurs — le gaz est là où sont les étoiles.
  for (let i = 0; i < 14; i++) {
    const x = rng() * w;
    const y = bande(x) + (rng() - 0.5) * epaisseur * 1.2;
    blob(x, y, 60 + rng() * 130, rng() < 0.6 ? '#d2405a' : '#2fd4a8', 0.3);
  }

  // Les couloirs de poussière, par-dessus : ils masquent, donc ils s'écrivent
  // après tout ce qu'ils doivent cacher.
  //
  // De la couleur du ciel vide, et non d'un noir plus noir. Un nuage de
  // poussière froide ne creuse pas un trou dans l'espace : il arrête la lumière
  // qui vient de derrière, et ce qu'on voit à sa place est le fond, rien de
  // plus. Peints en plus sombre que le vide, ils dessinaient une rivière noire
  // en travers du ciel — l'inverse exact de ce qu'ils doivent faire, qui est de
  // donner du relief à la voie lactée sans jamais se remarquer eux-mêmes.
  //
  // Plus étroits aussi : un couloir plus large que la bande qu'il coupe déborde
  // dans le vide, où il n'y a plus rien à masquer.
  for (let i = 0; i < 22; i++) {
    const x = rng() * w;
    const y = bande(x) + (rng() - 0.5) * epaisseur * 0.7;
    const rx = 70 + rng() * 150;
    const ry = (10 + rng() * 26) * (rng() < 0.5 ? 1 : 1.7);
    // L'inclinaison est tirée ici, et non dans la boucle des trois copies.
    //
    // Tirée dedans, chaque copie prenait la sienne : le couloir qui traverse la
    // couture de la texture ne retombait pas sur lui-même, et cela se voyait
    // comme une arête verticale nette en travers du ciel.
    const inclinaisonCouloir = (rng() - 0.5) * 0.5;
    for (const ox of [-w, 0, w]) {
      const cx = x + ox;
      if (cx + rx < 0 || cx - rx > w) continue;
      c.save();
      c.translate(cx, y);
      c.rotate(inclinaisonCouloir);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, NOIR + 'cc');
      g.addColorStop(0.5, NOIR + '66');
      g.addColorStop(1, NOIR + '00');
      c.fillStyle = g;
      c.scale(1, ry / rx);
      c.fillRect(-rx, -rx, rx * 2, rx * 2);
      c.restore();
    }
  }

  // Le grain : la bande n'est pas un voile, c'est une foule d'étoiles qu'on ne
  // sépare plus. Elles se serrent au centre du tracé et se raréfient aux bords.
  for (let i = 0; i < 9000; i++) {
    const x = rng() * w;
    const ecart = (rng() + rng() + rng() - 1.5) / 1.5; // ~gaussienne, bornée
    const y = bande(x) + ecart * epaisseur;
    if (y < 0 || y >= h) continue;
    const b = 130 + Math.floor(rng() * 80);
    c.fillStyle = `rgba(${b},${b + 6},${Math.min(255, b + 26)},${0.05 + rng() * 0.14})`;
    c.fillRect(x, y, 1, 1);
  }

  // Le mapping équirectangulaire écrase les rangées du haut et du bas en un
  // point : toute variation y devient une étoile de rayons. On rabat donc les
  // pôles sur une couleur plate avant de semer les étoiles.
  const poleH = h * 0.3;
  const gTop = c.createLinearGradient(0, 0, 0, poleH);
  gTop.addColorStop(0, NOIR);
  gTop.addColorStop(1, '#04060d00');
  c.fillStyle = gTop;
  c.fillRect(0, 0, w, poleH);

  const gBot = c.createLinearGradient(0, h, 0, h - poleH);
  gBot.addColorStop(0, NOIR);
  gBot.addColorStop(1, '#04060d00');
  c.fillStyle = gBot;
  c.fillRect(0, h - poleH, w, poleH);

  // Champ d'étoiles lointaines — la densité décroît vers les pôles, la
  // pondération en sinus correspondant à la surface réelle sur la sphère.
  //
  // Et elles ont chacune leur couleur : une étoile n'est pas blanche, elle est
  // de la couleur de sa température. Les naines rouges sont l'écrasante
  // majorité du ciel, les bleues se comptent — mais ce sont elles qu'on
  // remarque, parce qu'elles brillent le plus.
  for (let i = 0; i < 3200; i++) {
    const x = rng() * w;
    const y = rng() * h;
    if (rng() > Math.sin((y / h) * Math.PI)) continue;

    const type = rng();
    const [r, v, b] = type < 0.74
      ? [1, 0.82, 0.66]   // naines orangées et rouges
      : type < 0.9
        ? [1, 0.96, 0.86] // jaunes, comme le Soleil
        : type < 0.97
          ? [1, 1, 1]     // blanches
          : [0.78, 0.86, 1]; // bleues, les plus chaudes

    const luminosite = type < 0.74 ? 0.62 : type < 0.9 ? 0.85 : type < 0.97 ? 1 : 1.1;
    const eclat = Math.min(255, (150 + Math.floor(rng() * 85)) * luminosite);
    const sz = rng() < 0.92 ? 1 : 2;
    c.fillStyle = `rgba(${Math.round(eclat * r)},${Math.round(eclat * v)},${Math.round(eclat * b)},${0.25 + rng() * 0.75})`;
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
