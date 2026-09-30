import * as THREE from 'three';

/**
 * Le ciel de fond, calculé et non peint.
 *
 * Il l'était : une toile équirectangulaire de 2048 × 1024, étoiles et grain
 * compris. Tant qu'on regardait la galaxie de loin, cela tenait. Mais dès qu'on
 * s'approchait, chaque pixel de la toile devenait un carré d'une dizaine de
 * pixels à l'écran : les étoiles enflaient en pastilles molles, et leur
 * régularité dessinait une trame en travers du ciel. Une image a une
 * résolution ; un ciel n'en a pas.
 *
 * Tout est donc calculé par pixel de l'écran, à la demande :
 *
 *  - **Les étoiles** naissent d'une grille hachée sur la direction du regard.
 *    Leur rayon est fixé en pixels, par la dérivée de cette grille à l'écran :
 *    elles gardent donc la même finesse qu'on soit loin ou qu'on ait le nez
 *    dessus, comme de vraies étoiles, dont l'éloignement ne change pas le
 *    diamètre apparent — il n'y a que leur nombre qui augmente.
 *  - **La voie lactée** n'est pas un nuage peint par-dessus : c'est une
 *    concentration d'étoiles près du plan galactique, plus un halo de celles
 *    qu'on ne sépare plus. C'est ce qu'elle est vraiment.
 *  - **Les couloirs de poussière** retirent de la lumière là où le gaz froid
 *    masque ce qu'il y a derrière, étoiles comprises.
 *  - **Les nébuleuses en émission** teintent le gaz chaud : rouge de
 *    l'hydrogène, vert bleuté de l'oxygène, les deux raies qui dominent le ciel
 *    profond.
 *
 * Le prix est une passe de remplissage sur le fond de l'image, sans texture ni
 * mémoire graphique : quelques dizaines d'opérations par pixel, là où la toile
 * demandait 8 Mo et une seconde de dessin au démarrage.
 */

/** Hydrogène alpha : le rouge du gaz excité. */
const H_ALPHA = new THREE.Color(0xc4384f);
/** Oxygène doublement ionisé : le vert bleuté des nébuleuses. */
const OIII = new THREE.Color(0x2bbf9a);

/**
 * Normale du plan galactique.
 *
 * Inclinée d'une quinzaine de degrés : les systèmes sont posés dans le plan
 * horizontal, une voie lactée exactement parallèle à eux aurait l'air d'un
 * décor de théâtre.
 */
const NORMALE_GALACTIQUE = new THREE.Vector3(0.24, 0.95, -0.2).normalize();

const VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    // La direction depuis le centre de la sphère suffit : le fond est à
    // l'infini, seule l'orientation du regard compte.
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uTeinte;
  uniform vec3 uHAlpha;
  uniform vec3 uOIII;
  uniform vec3 uNormale;
  varying vec3 vDirection;

  // ── Aléas ────────────────────────────────────────────────────────────────
  // Haché sans sinus.
  //
  // Le sinus est la fonction la plus chère de ce fichier, et il y en avait un
  // par valeur tirée : quelque cent cinquante par pixel dans la bande. Ce
  // brassage-ci ne fait que des multiplications et des parties fractionnaires,
  // pour un désordre tout aussi bon à l'œil.
  float alea(vec3 p) {
    vec3 q = fract(p * 0.1031);
    q += dot(q, q.zyx + 31.32);
    return fract((q.x + q.y) * q.z);
  }

  vec3 alea3(vec3 p) {
    vec3 q = fract(p * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.xxy + q.yxx) * q.zyx);
  }

  float bruit(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = alea(i);
    float n100 = alea(i + vec3(1.0, 0.0, 0.0));
    float n010 = alea(i + vec3(0.0, 1.0, 0.0));
    float n110 = alea(i + vec3(1.0, 1.0, 0.0));
    float n001 = alea(i + vec3(0.0, 0.0, 1.0));
    float n101 = alea(i + vec3(1.0, 0.0, 1.0));
    float n011 = alea(i + vec3(0.0, 1.0, 1.0));
    float n111 = alea(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z
    );
  }

  /** Bruit à plusieurs échelles : c'est ce qui donne aux nuages leur découpe. */
  float nuees(vec3 p) {
    float v = 0.5 * bruit(p);
    v += 0.25 * bruit(p * 2.07);
    v += 0.125 * bruit(p * 4.13);
    return v / 0.875;
  }

  /**
   * Une couche d'étoiles.
   *
   * La direction est découpée en cellules ; chacune porte au plus une étoile,
   * dont la position et l'éclat sortent du haché de la cellule. Le rayon est
   * donné en pixels d'écran par «fwidth» : c'est ce qui les garde fines quel
   * que soit le zoom, au lieu de les faire enfler comme les pastilles d'une
   * texture agrandie.
   */
  vec3 couche(vec3 d, float densite, float proportion, float eclatMax, float chaleur) {
    vec3 p = d * densite;
    vec3 cellule = floor(p);
    vec3 dans = fract(p);

    // La dérivée se calcule avant tout branchement : elle compare des pixels
    // voisins, et n'a plus de sens si certains d'entre eux ont pris une autre
    // route que celui-ci.
    float pixel = max(fwidth(p.x), fwidth(p.y));

    // Une couche dont les cellules deviennent plus petites qu'un pixel ne peut
    // plus être dessinée : chaque pixel en contiendrait plusieurs, et leurs
    // étoiles se fondraient en un voile laiteux. Elle s'efface donc, comme le
    // ferait le niveau de détail d'une texture. C'est ce voile-là qui lavait
    // le ciel entier.
    float visibilite = smoothstep(2.2, 0.7, pixel);
    if (visibilite <= 0.0) return vec3(0.0);

    // Un seul brassage par cellule : la position sort du triplet, et le reste
    // s'en déduit par des mélanges gratuits. Six hachés par étoile et par
    // couche, c'était six fois trop.
    vec3 h = alea3(cellule);
    float presence = fract(h.x * 137.13 + h.y * 31.71);
    if (presence > proportion) return vec3(0.0);

    // Taille apparente : environ un pixel, quelle que soit la distance.
    float rayon = clamp(pixel * 0.8, 0.02, 0.45);

    float dist = length(dans - h);
    float forme = smoothstep(rayon, 0.0, dist);
    if (forme <= 0.0) return vec3(0.0);

    // Magnitude : beaucoup de faibles, très peu de vives. La puissance
    // reproduit grossièrement la distribution réelle des éclats.
    float magnitude = pow(fract(h.y * 71.37 + h.z * 17.11), 3.0) * eclatMax;

    // Couleur : la température de l'étoile. Les rouges dominent en nombre, les
    // bleues en éclat.
    float type = fract(h.z * 53.19 + h.x * 91.73);
    vec3 couleur = type < 0.72
      ? vec3(1.0, 0.76, 0.58)
      : type < 0.88
        ? vec3(1.0, 0.93, 0.82)
        : type < 0.96
          ? vec3(1.0, 1.0, 1.0)
          : vec3(0.74, 0.84, 1.0);

    // Vers le plan galactique, la poussière rougit ce qui la traverse.
    couleur = mix(couleur, couleur * vec3(1.12, 0.98, 0.84), chaleur);

    return couleur * forme * magnitude * visibilite;
  }

  void main() {
    vec3 d = normalize(vDirection);

    // Distance angulaire au plan galactique : 0 sur le plan, 1 aux pôles.
    float horsPlan = abs(dot(d, uNormale));

    // Le disque, avec ses irrégularités : une bande parfaitement régulière ne
    // ressemble à aucun ciel.
    float sinuosite = nuees(d * 1.6) - 0.5;
    float proximite = 1.0 - smoothstep(0.0, 0.2, abs(horsPlan + sinuosite * 0.09));

    // ── Les étoiles ────────────────────────────────────────────────────────
    //
    // Trois couches : les rares et vives, les moyennes, et la poussière
    // d'étoiles qui ne se sépare qu'en s'approchant — celle-là se concentre
    // dans le disque, comme dans le ciel.
    vec3 lumiere = vec3(0.0);
    lumiere += couche(d, 140.0, 0.16, 1.7, proximite * 0.6);
    lumiere += couche(d, 380.0, 0.1 + 0.18 * proximite, 0.9, proximite * 0.6);
    lumiere += couche(d, 900.0, 0.04 + 0.55 * proximite, 0.55, proximite * 0.8);

    // Et la foule du disque : celle qu'on ne sépare qu'en s'approchant. C'est
    // elle qui fait la voie lactée — une bande qui brille sans grouiller n'est
    // qu'une fumée. Sous-échantillonnée de loin, la couche s'efface d'elle-même
    // et ne laisse que le halo ; on la voit apparaître en s'avançant.
    //
    // Hors du disque, elle ne sèmerait que deux étoiles pour cent cellules : le
    // ciel profond n'y perd rien, et la couche entière est sautée.
    if (proximite > 0.02) {
      lumiere += couche(d, 2100.0, 0.6 * proximite, 0.4, proximite);
    }

    // ── Le halo du disque ──────────────────────────────────────────────────
    //
    // Ce que les étoiles trop lointaines laissent : une lueur continue, tramée
    // par le bruit. Chaude au cœur, froide aux bords.
    //
    // Tout ce bloc ne concerne que le disque : hors de lui, il n'y a ni halo,
    // ni gaz, ni poussière, et trois bruits à plusieurs échelles se calculaient
    // pour rendre zéro. Le branchement suit la bande, donc des pixels voisins
    // prennent presque toujours la même route — c'est le seul cas où une carte
    // graphique y gagne vraiment.
    if (proximite > 0.002) {
    float grumeaux = nuees(d * 3.4);
    // Au cube, et non au carré : le halo doit s'éteindre vite en s'éloignant du
    // plan. Trop étalé, ce n'est plus une voie lactée mais de la fumée — et
    // c'est la lumière des étoiles qui doit faire la bande, pas la nappe.
    float halo = proximite * proximite * proximite * (0.3 + 0.7 * grumeaux);
    vec3 couleurHalo = mix(vec3(0.34, 0.42, 0.6), vec3(0.88, 0.74, 0.52), proximite * 0.9);
    lumiere += couleurHalo * halo * 0.11;

    // ── Les nébuleuses en émission ─────────────────────────────────────────
    //
    // Gaz, poussière et choix de la raie sortent tous du même bruit, lu à des
    // tranches différentes : ce sont trois aspects d'une seule matière, et rien
    // n'obligeait à en calculer trois. Trois bruits multi-échelles par pixel de
    // bande économisés.
    float matiere = nuees(d * 4.6 + 13.0);

    // Rare, structuré, et discret.
    //
    // Un seuil trop bas donnait de larges plaques d'un seul tenant — des taches
    // vertes posées sur le ciel, sans rapport avec ce qu'est une nébuleuse : du
    // gaz ténu, visible seulement là où il est dense, et troué partout. Le
    // grain du halo le perce, et l'oxygène ne prend le pas sur l'hydrogène que
    // dans les régions les plus chaudes — dans le ciel, le rouge domine.
    float gaz = smoothstep(0.74, 0.97, 1.0 - matiere) * proximite * proximite;
    gaz *= 0.35 + 0.65 * grumeaux;
    float part = fract(matiere * 3.73);
    lumiere += mix(uHAlpha, uOIII, smoothstep(0.62, 0.9, part)) * gaz * 0.14;

    // ── La poussière ───────────────────────────────────────────────────────
    //
    // Elle masque : elle retire de la lumière, étoiles comprises, au lieu d'en
    // ajouter de la sombre. C'est pour cela qu'elle s'applique en dernier, et
    // qu'elle ne peut jamais descendre sous le noir du ciel.
    float poussiere = smoothstep(0.48, 0.84, matiere) * proximite * proximite;
    lumiere *= 1.0 - poussiere * 0.85;
    }

    // ── La teinte de la plateforme ─────────────────────────────────────────
    //
    // Discrète : elle distingue un launcher d'un autre au premier regard, sans
    // repeindre le ciel entier.
    lumiere = mix(lumiere, lumiere * uTeinte * 1.7, 0.2);

    // Le fond : le noir du vide, et rien d'autre.
    //
    // Il était quatre fois plus clair, et c'est tout ce qu'on voyait : un
    // aplat bleu-gris sur lequel ni les étoiles ni la bande ne pouvaient
    // ressortir. Entre deux étoiles, il n'y a pas de lumière.
    vec3 fond = vec3(0.004, 0.006, 0.012) + uTeinte * 0.004;

    gl_FragColor = vec4(fond + lumiere, 1.0);
  }
`;

export type FondCiel = {
  objet: THREE.Mesh;
  dispose: () => void;
};

/**
 * Compose le ciel de fond autour de la galaxie.
 *
 * «teinte» est la couleur de la plateforme regardée. La sphère est posée loin,
 * et ne s'écrit jamais dans le tampon de profondeur : tout le reste passe
 * devant elle.
 */
export function createFondCiel(teinte: THREE.Color): FondCiel {
  // Un rayon modeste, et sans rapport avec la taille de la galaxie.
  //
  // Il valait neuf fois celle-ci : sur une grande bibliothèque, la sphère
  // passait derrière le plan lointain de la caméra et se faisait découper en
  // entier — il ne restait que la couleur d'effacement du moteur, ce bleu-gris
  // uniforme qu'on prenait pour le ciel. Comme elle ne se compare à aucune
  // profondeur et se dessine avant tout le reste, sa taille n'a aucune
  // importance : elle doit seulement tenir dans le tronc de vue.
  const geometrie = new THREE.SphereGeometry(800, 48, 32);

  const materiau = new THREE.ShaderMaterial({
    uniforms: {
      uTeinte: { value: teinte.clone() },
      uHAlpha: { value: H_ALPHA.clone() },
      uOIII: { value: OIII.clone() },
      uNormale: { value: NORMALE_GALACTIQUE.clone() },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    // Le fond ne se compare à rien : il est derrière tout, par construction.
    depthTest: false,
    fog: false,
  });

  const ciel = new THREE.Mesh(geometrie, materiau);
  // Avant tout le reste, y compris le rideau d'aurore.
  ciel.renderOrder = -10;
  // La sphère suit la caméra : sans cela, s'éloigner du centre de la galaxie
  // finirait par en sortir, et le ciel se refermerait devant nous.
  ciel.frustumCulled = false;

  return {
    objet: ciel,
    dispose() {
      geometrie.dispose();
      materiau.dispose();
    },
  };
}
