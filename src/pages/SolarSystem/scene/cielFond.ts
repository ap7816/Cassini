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
  varying vec2 vNdc;
  void main() {
    // Un rectangle qui couvre l'écran, posé tel quel : ni caméra, ni
    // projection. Le ciel n'a pas de géométrie — il n'a qu'une direction par
    // pixel, et c'est le fragment qui la reconstruira.
    //
    // C'était une sphère, et ses quadrilatères se voyaient : la direction,
    // interpolée à plat sur chaque triangle, laissait des marches le long de la
    // triangulation. Un rectangle n'a pas d'arêtes intérieures.
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3 uTeinte;
  uniform vec3 uHAlpha;
  uniform vec3 uOIII;
  uniform vec3 uNormale;
  uniform vec3 uSoleil;
  uniform float uPixel;
  uniform vec3 uCouleurSoleil;
  uniform mat4 uProjectionInverse;
  uniform mat4 uCameraMonde;
  varying vec2 vNdc;

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

    // Combien de cellules tient un pixel ?
    //
    // La question se posait à fwidth, qui compare deux pixels voisins. Mais
    // la direction est interpolée à plat sur chaque triangle de la sphère :
    // sa dérivée saute à chaque arête, et ces sauts se voyaient comme des
    // marches d'escalier en travers du ciel, exactement le long de la
    // triangulation.
    //
    // L'angle que couvre un pixel ne dépend pourtant ni de la sphère ni du
    // triangle : il se déduit de l'ouverture de l'objectif et de la hauteur de
    // l'image. Calculé une fois par image, il est juste partout.
    float pixel = densite * uPixel;

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

    vec3 ecart = dans - h;
    float dist = length(ecart);
    float forme = smoothstep(rayon, 0.0, dist);

    // Les aigrettes.
    //
    // Les quatre branches qu'on voit autour des étoiles vives sur toutes les
    // photographies du ciel. Elles ne sont pas dans le ciel : elles naissent
    // dans l'instrument, sur les bras qui tiennent le miroir secondaire. Mais
    // l'œil les a tant vues qu'il lit « étoile brillante » avant même d'y
    // penser — et sans elles, une étoile vive n'est qu'un point un peu plus
    // gros.
    float croix = max(
      smoothstep(rayon * 5.0, 0.0, abs(ecart.x)) * smoothstep(rayon * 0.9, 0.0, abs(ecart.y)),
      smoothstep(rayon * 0.9, 0.0, abs(ecart.x)) * smoothstep(rayon * 5.0, 0.0, abs(ecart.y))
    );
    forme += croix * 0.14;

    if (forme <= 0.0) return vec3(0.0);

    // Magnitude : beaucoup de faibles, très peu de vives. La puissance
    // reproduit grossièrement la distribution réelle des éclats.
    float magnitude = pow(fract(h.y * 71.37 + h.z * 17.11), 3.0) * eclatMax;
    // Seules les plus vives portent des aigrettes : sur une étoile faible,
    // l'instrument n'en tire rien.
    forme = mix(smoothstep(rayon, 0.0, dist), forme, smoothstep(0.78, 0.97, magnitude / max(eclatMax, 0.001)));

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

  /**
   * Les amas.
   *
   * Les étoiles ne sont pas semées au hasard : elles naissent par groupes, dans
   * le même nuage, et restent ensemble quelques centaines de millions d'années
   * — les Pléiades en sont. Une grille large désigne ces régions, et la densité
   * des couches y monte. Sans elles, le semis est d'une régularité qu'aucun
   * ciel n'a.
   */
  float amas(vec3 d) {
    vec3 p = d * 9.0;
    vec3 cellule = floor(p);
    vec3 h = alea3(cellule);
    if (fract(h.x * 57.31 + h.z * 13.7) > 0.09) return 0.0;
    return smoothstep(0.42, 0.0, length(fract(p) - h));
  }

  void main() {
    // Du pixel vers le monde : on remonte la projection, puis l'orientation de
    // la caméra. Exact à chaque pixel, sans surface intermédiaire.
    vec4 vue = uProjectionInverse * vec4(vNdc, -1.0, 1.0);
    vec3 d = normalize((uCameraMonde * vec4(normalize(vue.xyz / vue.w), 0.0)).xyz);

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
    float groupe = amas(d);

    vec3 lumiere = vec3(0.0);
    lumiere += couche(d, 140.0, 0.16 + 0.1 * groupe, 1.7, proximite * 0.6);
    lumiere += couche(d, 380.0, 0.1 + 0.18 * proximite + 0.3 * groupe, 0.9, proximite * 0.6);
    lumiere += couche(d, 900.0, 0.04 + 0.55 * proximite + 0.4 * groupe, 0.55, proximite * 0.8);

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

    // ── La lumière zodiacale ───────────────────────────────────────────────
    //
    // La poussière du système, celle qui traîne dans le plan des orbites,
    // renvoie la lumière de l'étoile. Cela fait un cône pâle le long de ce
    // plan, plus large et plus clair près du soleil, qui s'efface à mesure
    // qu'on s'en éloigne — la première chose qu'on remarque depuis l'espace,
    // et celle qu'aucune image de galaxie ne montre jamais.
    //
    // Rien à voir avec la voie lactée : ce plan-ci est celui des orbites, à
    // quinze degrés de l'autre, et c'est ce décalage qui rend les deux lisibles
    // en même temps.
    float dansLePlan = 1.0 - smoothstep(0.0, 0.30, abs(d.y));
    float versLeSoleil = max(0.0, dot(d, uSoleil));
    float zodiacale = dansLePlan * pow(versLeSoleil, 2.2);
    lumiere += mix(vec3(1.0, 0.94, 0.84), uCouleurSoleil, 0.35) * zodiacale * 0.06;

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
  /**
   * Suit l'œil et l'étoile regardée.
   *
   * La sphère se recentre sur la caméra — le fond est à l'infini, il ne doit
   * jamais se refermer devant nous — et la lumière zodiacale a besoin de savoir
   * d'où vient la lumière.
   */
  update: (
    camera: THREE.PerspectiveCamera,
    soleil: THREE.Vector3,
    couleur: THREE.Color,
    hauteurPixels: number,
  ) => void;
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
  // Deux triangles, et rien d'autre.
  //
  // Le ciel ne se compare à aucune profondeur et se dessine avant tout le
  // reste : il n'a besoin d'aucune forme dans l'espace. Une sphère coûtait
  // trois mille triangles et laissait voir ses arêtes.
  const geometrie = new THREE.PlaneGeometry(2, 2);

  const materiau = new THREE.ShaderMaterial({
    uniforms: {
      uTeinte: { value: teinte.clone() },
      uHAlpha: { value: H_ALPHA.clone() },
      uOIII: { value: OIII.clone() },
      uNormale: { value: NORMALE_GALACTIQUE.clone() },
      uSoleil: { value: new THREE.Vector3(0, 0, 1) },
      uPixel: { value: 0.001 },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uCameraMonde: { value: new THREE.Matrix4() },
      uCouleurSoleil: { value: new THREE.Color(0xfff2d8) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    // Le rectangle est posé face à nous : il n'a pas d'envers à montrer.
    // Hérité de la sphère, qu'on regardait de l'intérieur, ce réglage le
    // faisait disparaître entièrement.
    side: THREE.DoubleSide,
    depthWrite: false,
    // Le fond ne se compare à rien : il est derrière tout, par construction.
    depthTest: false,
    fog: false,
  });

  const ciel = new THREE.Mesh(geometrie, materiau);
  // Avant tout le reste, y compris le rideau d'aurore.
  ciel.renderOrder = -10;
  // Posé hors de l'espace : aucun tronc de vue ne le contient, et il ne doit
  // jamais être écarté pour cette raison.
  ciel.frustumCulled = false;

  const versSoleil = new THREE.Vector3();

  return {
    objet: ciel,
    update(camera, soleil, couleur, hauteurPixels) {
      materiau.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
      materiau.uniforms.uCameraMonde.value.copy(camera.matrixWorld);
      // Angle couvert par un pixel, au centre de l'image.
      materiau.uniforms.uPixel.value =
        (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, hauteurPixels);
      versSoleil.subVectors(soleil, camera.position);
      // Caméra posée sur l'étoile : la direction n'a plus de sens, on garde la
      // précédente plutôt que de renvoyer un vecteur nul.
      if (versSoleil.lengthSq() > 1e-6) {
        materiau.uniforms.uSoleil.value.copy(versSoleil.normalize());
      }
      materiau.uniforms.uCouleurSoleil.value.copy(couleur);
    },
    dispose() {
      geometrie.dispose();
      materiau.dispose();
    },
  };
}
