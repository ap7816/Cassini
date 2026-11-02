import * as THREE from 'three';
import { seededRng } from '../lib/random';

/**
 * Réglages de dessin d'un anneau, imposés par sa famille.
 *
 * Ce sont ces valeurs, et non la seule graine, qui font qu'un anneau se
 * reconnaît de loin : la graine ne changeait que des détails — fréquences de
 * rubanage, position de la division — sous une silhouette toujours identique.
 */
export type ProfilAnneau = {
  /** Nombre de vides nets creusés dans la largeur. */
  divisions: number;
  /** Force du rubanage. 0 rend une nappe unie, 1 le contraste d'origine. */
  contraste: number;
  /** Exposant d'atténuation aux bords. Bas = bords francs, haut = fondus. */
  douceur: number;
  /** Opacité d'ensemble de la nappe. */
  eclat: number;
  /** Facteur appliqué à la saturation de la teinte de base. */
  saturation: number;
};

/** Profil historique, conservé comme référence et valeur par défaut. */
export const PROFIL_DEFAUT: ProfilAnneau = {
  divisions: 1,
  contraste: 1,
  douceur: 0.55,
  eclat: 0.85,
  saturation: 1,
};

/**
 * Texture d'anneau planétaire : une bande 1-D échantillonnée radialement.
 * Encode le rubanage, les divisions type Cassini et des bords fondus dans le
 * canal alpha.
 */
export function makeRingTexture(
  seed: number,
  base: THREE.Color,
  profil: ProfilAnneau = PROFIL_DEFAUT,
): THREE.CanvasTexture {
  const w = 1024,
    h = 1;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(w, h);

  const rng = seededRng(seed);
  const p1 = rng() * 6.28,
    p2 = rng() * 6.28,
    p3 = rng() * 6.28;
  const f1 = 42 + rng() * 46; // fréquence de rubanage fin
  const f2 = 11 + rng() * 12; // fréquence de rubanage large

  // Divisions réparties sur la largeur utile, à distance des deux bords où
  // l'atténuation les rendrait invisibles. Une seule division retombe au
  // milieu, là où se trouvait la division de Cassini d'origine.
  const n = Math.max(0, Math.round(profil.divisions));
  const vides = Array.from({ length: n }, (_, i) => ({
    pos: 0.28 + ((i + 0.5) / n) * 0.46 + (rng() - 0.5) * 0.08,
    largeur: 0.03 + rng() * 0.04,
  }));

  // Variation de luminosité par bande, quantifiée pour que les anneaux se
  // lisent comme des cercles distincts
  const bands = 160;
  const ampJitter = 0.5 * profil.contraste;
  const jitter = Array.from({ length: bands }, () => 1 - ampJitter / 2 + rng() * ampJitter);

  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  // Une seule instance réutilisée : en créer une par pixel allouait 1024
  // objets Color par anneau pour rien.
  const col = new THREE.Color();

  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);

    // Atténuation douce aux bords intérieur et extérieur
    let a = Math.pow(Math.sin(Math.PI * t), profil.douceur);
    // Deux fréquences de rubanage superposées, d'autant plus marquées que le
    // profil est contrasté — à contraste nul les deux facteurs valent 1.
    a *=
      1 - 0.55 * profil.contraste + 0.55 * profil.contraste * (0.5 + 0.5 * Math.sin(t * f1 + p1));
    a *=
      1 - 0.38 * profil.contraste + 0.38 * profil.contraste * (0.5 + 0.5 * Math.sin(t * f2 + p2));
    // Variation discrète par bande
    a *= jitter[Math.min(bands - 1, Math.floor(t * bands))];

    // Divisions type Cassini : des vides nets creusés dans l'anneau
    for (const v of vides) {
      const d = Math.abs(t - v.pos);
      if (d < v.largeur) a *= Math.pow(d / v.largeur, 1.6);
    }

    a = Math.max(0, Math.min(1, a)) * profil.eclat;

    // Plus glacé vers l'extérieur, plus poussiéreux vers la planète
    col.setHSL(
      hsl.h,
      hsl.s * profil.saturation * (0.35 + 0.3 * (1 - t)),
      0.55 + 0.28 * t + 0.08 * Math.sin(t * f1 * 0.5 + p3),
    );

    const o = x * 4;
    img.data[o] = Math.round(col.r * 255);
    img.data[o + 1] = Math.round(col.g * 255);
    img.data[o + 2] = Math.round(col.b * 255);
    img.data[o + 3] = Math.round(a * 255);
  }

  c.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  // Mipmaps, et non un simple filtrage linéaire.
  //
  // Une bande de 1024 texels tient parfois dans une dizaine de pixels à
  // l'écran : un anneau étroit vu de loin, ou n'importe quel anneau vu par la
  // tranche. Sans niveaux réduits, un texel sur cent est échantillonné et le
  // rubanage se change en pointillés qui grouillent dès que la planète tourne.
  // Les niveaux moyennent ce qu'on n'a pas la place de dessiner.
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  // La compression est bien plus forte radialement qu'en longueur d'anneau :
  // c'est exactement ce que corrige le filtrage anisotrope. La valeur est
  // ramenée au maximum de la machine au moment du téléversement.
  tex.anisotropy = 8;
  return tex;
}

/**
 * Les UV par défaut de `RingGeometry` sont mappées en carré, ce qui est
 * inutilisable pour un rubanage radial. On les réécrit pour que `u` aille de 0
 * (bord intérieur) à 1 (bord extérieur).
 *
 * `thetaStart` et `thetaLength` permettent de ne dessiner qu'un secteur : c'est
 * ainsi que se font les arcs, sans rien changer à la texture. Un anneau
 * incomplet coûte alors moins cher qu'un anneau entier, là où le même effet
 * obtenu par le canal alpha aurait demandé une texture à deux dimensions.
 */
export function radialRingGeometry(
  inner: number,
  outer: number,
  segments: number,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
): THREE.RingGeometry {
  const geo = new THREE.RingGeometry(inner, outer, segments, 1, thetaStart, thetaLength);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Secteur d'anneau dont les deux extrémités s'éteignent en fondu.
 *
 * Un secteur découpé net se lit comme un éclat de coquille posé à côté de la
 * planète, pas comme la portion dense d'un anneau : ce sont ses bouts carrés
 * qui trahissent la géométrie. Le fondu est porté par la couleur des sommets —
 * dont le canal alpha multiplie celui de la texture — plutôt que par une
 * seconde dimension de texture : la bande reste à une dimension, et le dégradé
 * ne coûte qu'un attribut.
 */
export function arcRingGeometry(
  inner: number,
  outer: number,
  segments: number,
  thetaStart: number,
  thetaLength: number,
): THREE.RingGeometry {
  const geo = radialRingGeometry(inner, outer, segments, thetaStart, thetaLength);
  const pos = geo.attributes.position;
  const couleurs = new Float32Array(pos.count * 4);
  const deuxPi = Math.PI * 2;

  for (let i = 0; i < pos.count; i++) {
    // Angle du sommet ramené dans le secteur. Le modulo évite que le passage
    // par ±π d'`atan2` ne coupe l'arc en deux.
    let rel = (Math.atan2(pos.getY(i), pos.getX(i)) - thetaStart) % deuxPi;
    if (rel < 0) rel += deuxPi;
    const t = Math.min(1, Math.max(0, rel / thetaLength));

    const o = i * 4;
    couleurs[o] = couleurs[o + 1] = couleurs[o + 2] = 1;
    couleurs[o + 3] = Math.pow(Math.sin(Math.PI * t), 0.6);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(couleurs, 4));
  return geo;
}
