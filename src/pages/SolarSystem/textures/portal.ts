import * as THREE from 'three';

/**
 * Halo du portail : un anneau incandescent au bord intérieur net, qui se
 * dissipe vers l'extérieur en filaments.
 *
 * Le centre est laissé **transparent** : c'est la sphère sombre placée derrière
 * qui l'occupe. Peindre un cœur noir ici ne marcherait pas, le halo étant rendu
 * en fondu additif — le noir y est neutre, donc invisible.
 *
 * Dessinée sur canvas plutôt qu'en shader : la scène n'utilise que des
 * matériaux standard de three.js, introduire un `ShaderMaterial` pour un seul
 * objet ajouterait une compilation GLSL et un chemin de rendu à part.
 */
export function makePortalTexture(color: THREE.Color, size = 512): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const c = size / 2;

  const rgb = (a: number) =>
    `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${a})`;

  // Rayons repères, en fraction du demi-côté :
  //   0.30 → bord intérieur, là où commence la lumière
  //   0.36 → crête de l'anneau, presque blanche
  //   1.00 → extinction complète
  const anneau = ctx.createRadialGradient(c, c, c * 0.26, c, c, c);
  anneau.addColorStop(0, 'rgba(255,255,255,0)');
  anneau.addColorStop(0.11, 'rgba(255,255,255,0.98)');
  anneau.addColorStop(0.2, rgb(0.9));
  anneau.addColorStop(0.42, rgb(0.34));
  anneau.addColorStop(0.72, rgb(0.1));
  anneau.addColorStop(1, rgb(0));
  ctx.fillStyle = anneau;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  // Filaments : des traits radiaux irréguliers qui débordent de l'anneau et
  // cassent sa régularité. Sans eux le portail ressemble à un cercle dessiné.
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.05;
    const r0 = c * (0.3 + Math.abs(Math.sin(i * 78.233)) * 0.04);
    const r1 = r0 + c * (0.08 + Math.abs(Math.sin(i * 43.11)) * 0.42);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.strokeStyle = rgb(0.05 + Math.abs(Math.sin(i * 91.7)) * 0.09);
    ctx.lineWidth = size * (0.004 + Math.abs(Math.sin(i * 27.3)) * 0.009);
    ctx.stroke();
  }

  // Liseré intérieur très lumineux, qui donne la découpe nette du bord
  ctx.beginPath();
  ctx.arc(c, c, c * 0.295, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = size * 0.006;
  ctx.stroke();

  // Extinction franche au bord du canvas : sans elle, le halo garde un carré
  // faiblement lumineux aux coins, très visible en fondu additif.
  ctx.globalCompositeOperation = 'destination-in';
  const masque = ctx.createRadialGradient(c, c, c * 0.7, c, c, c);
  masque.addColorStop(0, 'rgba(0,0,0,1)');
  masque.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = masque;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
