import * as THREE from 'three';

/**
 * Ce qui se passe dans le ciel quand on ne regarde pas les planètes.
 *
 * Trois choses, et le choix vient de ce que l'on verrait vraiment par un
 * hublot. Dans le vide, rien ne scintille — pas d'atmosphère pour agiter la
 * lumière : les étoiles sont des pointes fixes, et le spectacle est ailleurs.
 *
 *  - **Le rideau.** Une aurore n'existe pas dans l'espace interstellaire : il
 *    lui faut un champ magnétique et un gaz à exciter. Celle-ci est donc un
 *    voile de gaz ionisé pris dans le champ de la galaxie, qui brille comme
 *    brillent les nébuleuses en émission — l'oxygène doublement ionisé, vert
 *    bleuté à 500 nm, et l'hydrogène au-dessus, rouge sombre. Il dérive
 *    lentement : à ces distances, rien ne va vite.
 *  - **La tempête.** De loin en loin, le rideau s'embrase pendant une trentaine
 *    de secondes, puis retombe. C'est le seul moment où le ciel bouge
 *    franchement.
 *  - **Les passages.** Une traînée qui file, rare et brève. Et, beaucoup plus
 *    rarement, une lumière qui traverse en ligne droite à vitesse constante,
 *    en clignotant — la seule chose, dans tout ce ciel, dont la trajectoire ne
 *    s'explique par aucune gravité.
 *
 * Tout tient en trois objets et deux triangles pour la traînée : le budget de
 * rendu est le même qu'on les regarde ou non.
 */

/** Oxygène doublement ionisé — la raie verte des nébuleuses en émission. */
const OIII = new THREE.Color(0x2fd4a8);
/** Hydrogène alpha — le rouge profond du gaz excité. */
const H_ALPHA = new THREE.Color(0xd2405a);

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Le rideau.
 *
 * Aucun échantillonnage de texture : le motif sort d'un bruit calculé, trois
 * octaves, ce qui coûte quelques dizaines d'opérations par pixel et rien en
 * mémoire graphique. La transparence est additive — un voile de gaz ajoute sa
 * lumière à ce qu'il y a derrière, il ne la cache pas.
 */
const FRAGMENT = /* glsl */ `
  uniform float uTemps;
  uniform float uForce;
  uniform vec3  uBas;
  uniform vec3  uHaut;
  varying vec2 vUv;

  float alea(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float bruit(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(alea(i), alea(i + vec2(1.0, 0.0)), u.x),
      mix(alea(i + vec2(0.0, 1.0)), alea(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float nuees(vec2 p) {
    float v = 0.5 * bruit(p);
    v += 0.25 * bruit(p * 2.03);
    v += 0.125 * bruit(p * 4.01);
    return v / 0.875;
  }

  void main() {
    // La dérive : le rideau glisse le long de l'horizon, très lentement.
    vec2 p = vec2(vUv.x * 7.0 + uTemps * 0.012, vUv.y * 1.6 - uTemps * 0.02);
    float masse = nuees(p);

    // Les stries verticales, plus fines et plus rapides que la masse.
    float stries = nuees(vec2(vUv.x * 42.0 + masse * 3.0, uTemps * 0.09));

    // Le pied s'allume progressivement, le sommet s'éteint : un rideau n'a ni
    // bord bas ni bord haut, il se dissout dans le noir.
    float pied = smoothstep(0.0, 0.42, vUv.y);
    float sommet = 1.0 - smoothstep(0.5, 1.0, vUv.y);

    float a = pied * sommet * smoothstep(0.5, 0.95, masse) * (0.25 + 0.75 * stries);
    a *= uForce;

    gl_FragColor = vec4(mix(uBas, uHaut, vUv.y) * a, a);
  }
`;

export type Ciel = {
  objet: THREE.Group;
  /**
   * Fait vivre le ciel.
   *
   * `vivant` à faux fige tout et n'affiche plus rien : le réglage coupé, la
   * scène retrouve exactement ce qu'elle était.
   */
  update: (dt: number, vivant: boolean, mouvementReduit: boolean, camera: THREE.Camera) => void;
  dispose: () => void;
};

/**
 * Compose le ciel autour d'une galaxie de ce rayon.
 *
 * `teinte` est la couleur de la plateforme regardée : le rideau s'y accorde
 * sans la copier, faute de quoi le ciel entier prendrait la couleur d'un
 * launcher.
 */
const AXE_HAUT = new THREE.Vector3(0, 1, 0);

export function createCiel(rayon: number, teinte: THREE.Color): Ciel {
  const groupe = new THREE.Group();
  // Hors de la brume : elle est réglée à l'échelle d'un système, tout ceci se
  // tient bien au-delà.
  groupe.userData.brume = false;

  const distance = Math.max(1400, rayon * 3.2);

  // ── Le rideau ────────────────────────────────────────────────────────────
  //
  // Un cylindre ouvert, vu de l'intérieur, dont un tiers seulement porte le
  // rideau : une aurore occupe une région du ciel, pas le ciel entier — et ce
  // qu'on ne peint pas ne coûte rien à remplir.
  const geoRideau = new THREE.CylinderGeometry(
    distance, distance, distance * 1.1, 48, 1, true,
    // Arc de 120°, orienté pour tomber en travers du champ au premier regard.
    -Math.PI * 0.25, Math.PI * 0.66,
  );

  const bas = OIII.clone().lerp(teinte, 0.25);
  const haut = H_ALPHA.clone().lerp(teinte, 0.15);

  const matRideau = new THREE.ShaderMaterial({
    uniforms: {
      uTemps: { value: 0 },
      uForce: { value: 0 },
      uBas: { value: bas },
      uHaut: { value: haut },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    fog: false,
  });

  const rideau = new THREE.Mesh(geoRideau, matRideau);
  // Derrière tout le reste : le ciel ne doit jamais passer devant une planète.
  rideau.renderOrder = -1;
  groupe.add(rideau);

  // ── La traînée ───────────────────────────────────────────────────────────
  //
  // Deux triangles, une seule fois pour toute la session : on les déplace et
  // on les rallume, au lieu d'en créer à chaque passage.
  const longueur = distance * 0.5;
  const geoTrainee = new THREE.PlaneGeometry(longueur, longueur * 0.045);
  const matTrainee = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 }, uTeinte: { value: new THREE.Color(0xbfd8ff) } },
    vertexShader: VERTEX,
    // La tête est vive, la queue s'efface : c'est ce qui fait lire le sens de
    // la course. Le carré du fondu resserre la tête.
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform vec3 uTeinte;
      varying vec2 vUv;
      void main() {
        // vUv.x : 0 au bout de la queue, 1 à la tête.
        float epaisseur = 1.0 - abs(vUv.y - 0.5) * 2.0;

        // La queue s'effile deux fois : en longueur, et en largeur à mesure
        // qu'elle s'éloigne de la tête. Sans cela, c'est un trait d'égale
        // épaisseur — une rayure sur l'écran, pas une chute.
        float fuseau = smoothstep(0.0, 1.0, epaisseur * (0.25 + 0.75 * vUv.x));
        float queue = pow(vUv.x, 4.0) * pow(fuseau, 2.0);

        // La tête concentre la lumière : c'est elle que le débordement lumineux
        // attrapera, et c'est elle qui donne le sens de la course.
        float tete = smoothstep(0.9, 1.0, vUv.x) * pow(fuseau, 1.2) * 2.2;

        float a = (queue + tete) * uEclat;
        gl_FragColor = vec4(uTeinte * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const trainee = new THREE.Mesh(geoTrainee, matTrainee);
  trainee.renderOrder = -1;
  trainee.visible = false;
  groupe.add(trainee);

  // ── Le passage ───────────────────────────────────────────────────────────
  //
  // Un seul point, loin, qui traverse en ligne droite et clignote. Rien de
  // plus : à cette distance, une forme de vaisseau ne serait qu'un pâté.
  const geoVaisseau = new THREE.BufferGeometry();
  geoVaisseau.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const matVaisseau = new THREE.PointsMaterial({
    size: Math.max(3, distance * 0.004),
    color: 0xfff0c4,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
    fog: false,
  });
  const vaisseau = new THREE.Points(geoVaisseau, matVaisseau);
  vaisseau.renderOrder = -1;
  vaisseau.visible = false;
  groupe.add(vaisseau);

  // ── L'horloge des événements ─────────────────────────────────────────────
  let temps = 0;

  // Tempête : au repos le rideau respire à peine ; elle le porte au comble en
  // une vingtaine de secondes, le tient, puis le laisse retomber.
  const FORCE_REPOS = 0.22;
  let tempete = 0;
  let prochaineTempete = 95 + Math.random() * 130;

  /** Une chute dure ce qu'elle dure : le temps de la suivre des yeux. */
  const DUREE_TRAINEE = 1.4;
  let trainéeRestante = 0;
  let prochaineTrainee = 18 + Math.random() * 45;
  const departTrainee = new THREE.Vector3();
  const finTrainee = new THREE.Vector3();

  let vaisseauRestant = 0;
  let prochainVaisseau = 200 + Math.random() * 320;
  const departVaisseau = new THREE.Vector3();
  const finVaisseau = new THREE.Vector3();
  const DUREE_VAISSEAU = 42;

  /**
   * Un point du ciel dans le champ de la caméra.
   *
   * Tiré au hasard sur toute la sphère, l'événement se produisait presque
   * toujours dans le dos : un ciel de soixante degrés sur trois cent soixante,
   * c'est une chance sur six d'être vu. Une étoile filante que personne ne voit
   * n'est pas une étoile filante. Elle naît donc dans un cône ouvert autour de
   * la direction du regard — assez large pour qu'elle reste une surprise, assez
   * étroit pour qu'elle tombe dans l'image.
   */
  function devantLaCamera(cible: THREE.Vector3, camera: THREE.Camera, rayonCiel: number, ouverture: number): THREE.Vector3 {
    const avant = new THREE.Vector3();
    camera.getWorldDirection(avant);
    const droite = new THREE.Vector3().crossVectors(avant, AXE_HAUT).normalize();
    const haut = new THREE.Vector3().crossVectors(droite, avant).normalize();

    const angle = Math.random() * Math.PI * 2;
    const ecart = Math.tan(ouverture) * Math.sqrt(Math.random());
    return cible
      .copy(avant)
      .addScaledVector(droite, Math.cos(angle) * ecart)
      .addScaledVector(haut, Math.sin(angle) * ecart)
      .normalize()
      .multiplyScalar(rayonCiel)
      .add(camera.position);
  }

  function lancerTrainee(camera: THREE.Camera): void {
    devantLaCamera(departTrainee, camera, distance * 0.8, 0.5);
    // L'arrivée est proche du départ : une traînée file, elle ne fait pas le
    // tour du ciel.
    devantLaCamera(finTrainee, camera, distance * 0.8, 0.5);
    finTrainee.lerp(departTrainee, 0.55);

    trainee.position.copy(departTrainee);
    orienter(trainee, finTrainee.clone().sub(departTrainee).normalize(), camera);
    trainee.visible = true;
    trainéeRestante = DUREE_TRAINEE;
  }

  /**
   * Tourne le rectangle de la traînée : sa longueur suit la course, sa face
   * regarde la caméra.
   *
   * Sans cette seconde condition, il suffisait que la course s'éloigne de nous
   * pour que le rectangle soit vu par la tranche — c'est-à-dire pas vu du tout.
   */
  function orienter(objet: THREE.Object3D, sens: THREE.Vector3, camera: THREE.Camera): void {
    const versCamera = new THREE.Vector3().subVectors(camera.position, objet.position).normalize();
    const x = sens.clone();
    // Redresse la course pour qu'elle reste perpendiculaire à l'axe du regard.
    x.addScaledVector(versCamera, -x.dot(versCamera)).normalize();
    const y = new THREE.Vector3().crossVectors(versCamera, x).normalize();
    objet.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, versCamera));
  }

  function lancerVaisseau(camera: THREE.Camera): void {
    devantLaCamera(departVaisseau, camera, distance * 0.7, 0.75);
    devantLaCamera(finVaisseau, camera, distance * 0.7, 0.75);
    vaisseau.visible = true;
    vaisseauRestant = DUREE_VAISSEAU;
  }

  const position = geoVaisseau.attributes.position as THREE.BufferAttribute;

  function update(dt: number, vivant: boolean, mouvementReduit: boolean, camera: THREE.Camera): void {
    if (!vivant) {
      if (groupe.visible) {
        groupe.visible = false;
        trainee.visible = false;
        vaisseau.visible = false;
      }
      return;
    }
    groupe.visible = true;
    temps += dt;
    matRideau.uniforms.uTemps.value = temps;

    // Mouvement réduit : le rideau reste, immobile et constant. Ce qui traverse
    // l'écran, en revanche, ne traverse plus.
    if (mouvementReduit) {
      matRideau.uniforms.uTemps.value = 0;
      matRideau.uniforms.uForce.value = FORCE_REPOS;
      return;
    }

    // ── Tempête ────────────────────────────────────────────────────────────
    prochaineTempete -= dt;
    if (prochaineTempete <= 0 && tempete <= 0) {
      tempete = 30;
      prochaineTempete = 150 + Math.random() * 240;
    }
    if (tempete > 0) {
      tempete -= dt;
      // Montée et descente en cloche, sans marche d'escalier.
      const avancement = 1 - Math.abs(tempete / 15 - 1);
      matRideau.uniforms.uForce.value = FORCE_REPOS + Math.max(0, avancement) * 0.75;
    } else {
      // Au repos, une respiration lente, à peine perceptible.
      matRideau.uniforms.uForce.value = FORCE_REPOS * (0.85 + 0.15 * Math.sin(temps * 0.18));
    }

    // ── Traînée ────────────────────────────────────────────────────────────
    if (trainéeRestante > 0) {
      trainéeRestante -= dt;
      const t = 1 - trainéeRestante / DUREE_TRAINEE;
      trainee.position.lerpVectors(departTrainee, finTrainee, t);
      // S'allume net, s'éteint doucement.
      matTrainee.uniforms.uEclat.value = Math.max(0, Math.sin(Math.min(1, t) * Math.PI) ** 0.55);
      if (trainéeRestante <= 0) trainee.visible = false;
    } else {
      prochaineTrainee -= dt;
      if (prochaineTrainee <= 0) {
        lancerTrainee(camera);
        prochaineTrainee = 25 + Math.random() * 70;
      }
    }

    // ── Passage ────────────────────────────────────────────────────────────
    if (vaisseauRestant > 0) {
      vaisseauRestant -= dt;
      const t = 1 - vaisseauRestant / DUREE_VAISSEAU;
      const p = departVaisseau.clone().lerp(finVaisseau, t);
      position.setXYZ(0, p.x, p.y, p.z);
      position.needsUpdate = true;
      // Clignotement lent, et extinction aux deux bouts de la course pour
      // qu'il n'apparaisse ni ne disparaisse d'un coup.
      const bords = Math.sin(t * Math.PI);
      matVaisseau.opacity = bords * (0.55 + 0.45 * Math.sin(temps * 2.4));
      if (vaisseauRestant <= 0) vaisseau.visible = false;
    } else {
      prochainVaisseau -= dt;
      if (prochainVaisseau <= 0) {
        lancerVaisseau(camera);
        prochainVaisseau = 260 + Math.random() * 420;
      }
    }
  }

  return {
    objet: groupe,
    update,
    dispose() {
      geoRideau.dispose();
      matRideau.dispose();
      geoTrainee.dispose();
      matTrainee.dispose();
      geoVaisseau.dispose();
      matVaisseau.dispose();
    },
  };
}
