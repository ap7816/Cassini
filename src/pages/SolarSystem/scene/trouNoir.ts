import * as THREE from 'three';

/**
 * Le trou noir : un objet énorme qui paraît dans la galaxie, et rien de plus.
 *
 * Il n'avale rien, ne déforme rien, ne touche à aucune autre partie de
 * l'application. C'est un événement à regarder — le plus gros, le plus rare,
 * et celui qui fait qu'on appelle quelqu'un pour venir voir.
 *
 * **Il est en volume, et pas peint sur une vignette.** La différence ne se
 * discute pas, elle se voit dès qu'on bouge : le disque est un vrai anneau posé
 * dans un plan, l'horizon une vraie sphère, et c'est la profondeur qui décide
 * de ce qui passe derrière. Sa moitié lointaine disparaît derrière la sphère et
 * ressort de l'autre côté ; en se déplaçant dans la galaxie, on change l'angle
 * sous lequel on le prend et son disque s'ouvre ou se referme. Aucune image
 * plate ne fait cela.
 *
 * Sa place, elle, est celle du ciel : `ciel.ts` le rapporte sur la sphère des
 * événements, dans la direction où il se trouve vraiment, pour qu'il se voie de
 * n'importe où. Son orientation reste celle du monde — le groupe n'est jamais
 * tourné vers l'œil, seuls deux de ses cercles le sont, et pour une raison qui
 * leur est propre.
 *
 * Quatre pièces, et chacune a sa raison d'être là :
 *
 * 1. **L'horizon** — une sphère noire. Elle n'éclaire rien ; tout son travail
 *    est d'écrire la profondeur, donc de cacher ce qui est derrière elle.
 * 2. **Le disque** — un anneau dans son plan, qui tourne. C'est la pièce qui
 *    donne le volume : vu de biais il est une ellipse, vu par la tranche un
 *    trait, et sa moitié arrière passe derrière la sphère.
 * 3. **L'anneau de photons** — un cercle mince tourné vers l'œil. Un billboard,
 *    et c'est exact : la lumière qui a fait le tour de l'objet ressort en
 *    cercle autour de l'ombre quel que soit l'endroit d'où on la regarde.
 * 4. **La couronne** — l'image que la masse relève du disque passant derrière
 *    elle. Tournée vers l'œil elle aussi, pour la même raison, et plus vive en
 *    haut et en bas, là où cette lumière s'accumule.
 *
 * Ce qu'on ne fait pas : suivre les rayons lumineux. Un vrai calcul de courbure
 * coûterait cher pour un objet de cette taille à l'écran, et rendrait tout le
 * reste de la scène tributaire de lui — ce qui a déjà été essayé et retiré
 * (voir `notes.md`).
 */

export type TrouNoirCiel = {
  objet: THREE.Object3D;
  /** Oriente ce qui doit l'être et règle l'éclat. */
  regler: (eclat: number, temps: number, camera: THREE.Camera) => void;
  dispose: () => void;
};

/** Bruit de gaz, partagé par le disque et la couronne. */
const BRUIT = /* glsl */ `
  float alea(vec2 p) {
    return fract(sin(dot(p, vec2(37.1, 61.7))) * 43758.5453);
  }
  float bruit(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(alea(i), alea(i + vec2(1.0, 0.0)), f.x),
      mix(alea(i + vec2(0.0, 1.0)), alea(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
`;

/**
 * Ce qui tient les grandes surfaces sous le seuil du débordement lumineux.
 *
 * Ce seuil vaut 0,85 dans la scène : au-delà, la passe de débordement reprend
 * le pixel, l'étale et le rajoute par-dessus. Un objet de cette taille peint à
 * deux ou trois noie l'écran entier dans du blanc — c'est arrivé. Les grandes
 * surfaces restent donc en dessous et gardent leur couleur ; seul l'anneau de
 * photons, qui est mince, a le droit de le franchir.
 */
const SOUS_LE_SEUIL = 0.5;

export function createTrouNoir(rayon: number): TrouNoirCiel {
  const groupe = new THREE.Group();
  groupe.name = 'trouNoir';
  groupe.visible = false;

  // ── 1. L'horizon ─────────────────────────────────────────────────────────
  //
  // Elle n'éclaire rien et n'est pas vraiment noire : elle est le trou dans
  // l'image. Tout son travail est d'écrire la profondeur.
  //
  // Elle vient presque toucher l'anneau de photons, et c'est juste : l'ombre
  // d'un trou noir se voit bien plus grande que son horizon, parce que la masse
  // rabat vers nous la lumière qui passait à côté. À la taille de l'horizon
  // seul, elle n'était qu'une bille perdue au milieu d'un grand cercle blanc.
  const geoHorizon = new THREE.SphereGeometry(rayon * 1.32, 48, 32);
  const matHorizon = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  const horizon = new THREE.Mesh(geoHorizon, matHorizon);
  horizon.renderOrder = 0;
  groupe.add(horizon);

  // ── 2. Le disque ─────────────────────────────────────────────────────────
  const INT = rayon * 2.2;
  const EXT = rayon * 7.0;
  const geoDisque = new THREE.RingGeometry(INT, EXT, 192, 1);
  const matDisque = new THREE.ShaderMaterial({
    uniforms: {
      uEclat: { value: 0 },
      uTemps: { value: 0 },
      /** Direction de l'œil, dans le repère du disque : sert à l'effet Doppler. */
      uVersOeil: { value: new THREE.Vector3(0, 0, 1) },
      uInt: { value: INT },
      uExt: { value: EXT },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform float uTemps;
      uniform vec3 uVersOeil;
      uniform float uInt;
      uniform float uExt;
      varying vec3 vLocal;
      ${BRUIT}

      void main() {
        float r = length(vLocal.xy);
        float ang = atan(vLocal.y, vLocal.x);
        float t = (r - uInt) / (uExt - uInt);
        if (t < 0.0 || t > 1.0) discard;

        // Il tourne, et plus vite au-dedans qu'au-dehors : c'est ce qui étire
        // les filaments en spirale au lieu de les faire tourner en bloc.
        // Le bruit est pris sur une **direction**, et non sur l'angle.
        //
        // L'angle saute de +pi à -pi quelque part sur le tour : un bruit nourri
        // de ce nombre y est discontinu, et la discontinuité se voit comme une
        // droite tirée du centre vers le bord — la couture de l'anneau. Le
        // couple (cosinus, sinus) dit la même chose sans jamais sauter.
        //
        // Deux octaves : une pour les grands bras, une pour le grain. À une
        // seule, et à basse fréquence, le gaz n'est qu'un voile laiteux.
        float tour = ang + uTemps * (0.5 / (0.3 + t * 2.2));
        vec2 dir = vec2(cos(tour), sin(tour));
        float fil = 0.35 + 0.75 * bruit(dir * 4.0 + vec2(0.0, t * 16.0))
          + 0.3 * bruit(dir * 9.5 + vec2(t * 42.0, 0.0));

        // Blanc au bord interne, où le gaz tombe le plus vite, rouge sombre au
        // loin : c'est sa température.
        vec3 teinte = mix(vec3(1.0, 0.86, 0.62), vec3(0.8, 0.22, 0.05), pow(t, 0.6));

        // Il naît au bord interne et s'éteint au large.
        // Serré au bord interne, et qui s'éteint vite : c'est là que tout se
        // passe. Étalé, il ne donne qu'une nappe.
        float dens = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.08, 0.72, t));

        // L'effet Doppler : le gaz qui vient vers nous est vu plus clair, celui
        // qui s'en va plus sombre. C'est ce qui fait qu'un côté du disque brûle
        // et l'autre s'efface — et c'est, dans l'image, ce qui dit qu'il tourne.
        vec3 vitesse = normalize(vec3(-vLocal.y, vLocal.x, 0.0));
        float doppler = 1.0 + 0.6 * dot(vitesse, normalize(uVersOeil));

        // Borné à un : le mélange additif multiplie déjà la couleur par
        // l'opacité, et laisser filer les deux revient à peindre au carré.
        float alpha = min(1.0, dens * fil * max(doppler, 0.15)) * uEclat * 0.8;
        gl_FragColor = vec4(teinte * ${SOUS_LE_SEUIL.toFixed(2)}, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const disque = new THREE.Mesh(geoDisque, matDisque);
  // À plat : l'anneau de Three.js naît dans le plan XY, on le couche.
  disque.rotation.x = -Math.PI / 2;
  disque.renderOrder = 1;
  groupe.add(disque);

  // ── 3. L'anneau de photons ───────────────────────────────────────────────
  const PHOTON_INT = rayon * 1.42;
  const PHOTON_LARGE = rayon * 0.2;
  const geoPhotons = new THREE.RingGeometry(PHOTON_INT, PHOTON_INT + PHOTON_LARGE, 128);
  const matPhotons = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vLocal;
      void main() {
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      varying vec2 vLocal;
      void main() {
        // Un seul trait, net au milieu de l'anneau et éteint à ses deux bords.
        float t = (length(vLocal) - ${PHOTON_INT.toFixed(2)}) / ${PHOTON_LARGE.toFixed(2)};
        float a = exp(-pow((t - 0.5) / 0.22, 2.0)) * uEclat;
        // Le seul endroit de l'objet qui ait le droit de déborder.
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * 1.35, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const photons = new THREE.Mesh(geoPhotons, matPhotons);
  photons.renderOrder = 3;
  groupe.add(photons);

  // ── 4. La couronne ───────────────────────────────────────────────────────
  //
  // L'image du disque que la masse relève par-dessus l'horizon et rabat par-
  // dessous. Elle entoure l'ombre quel que soit l'angle : un cercle tourné vers
  // l'œil est donc la bonne forme, et non une pièce du volume.
  const COURONNE_INT = rayon * 1.5;
  const COURONNE_LARGE = rayon * 1.6;
  const geoCouronne = new THREE.RingGeometry(COURONNE_INT, COURONNE_INT + COURONNE_LARGE, 128);
  const matCouronne = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 }, uTemps: { value: 0 }, uTranche: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vLocal;
      void main() {
        vLocal = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform float uTemps;
      /** 1 quand le disque est vu par la tranche, 0 quand il est vu de face. */
      uniform float uTranche;
      varying vec2 vLocal;
      ${BRUIT}

      void main() {
        float t = (length(vLocal) - ${COURONNE_INT.toFixed(2)}) / ${COURONNE_LARGE.toFixed(2)};
        if (t < 0.0 || t > 1.0) discard;

        float ang = atan(vLocal.y, vLocal.x);
        // Même précaution que pour le disque : sur une direction, pas sur
        // l'angle, qui saute une fois par tour.
        vec2 dir = vec2(cos(ang + uTemps * 0.35), sin(ang + uTemps * 0.35));
        float fil = 0.6 + 0.8 * bruit(dir * 2.6 + vec2(0.0, t * 7.0));
        float bande = exp(-pow((t - 0.2) / 0.28, 2.0));

        // Plus vive en haut et en bas : c'est là que la lumière relevée
        // s'accumule. Et elle ne se montre que si le disque est vu de biais —
        // vu de face, il n'y a rien derrière l'ombre à relever.
        float vertical = 0.25 + 0.95 * pow(abs(sin(ang)), 0.6);

        float alpha = min(1.0, bande * fil * vertical) * uTranche * uEclat;
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * ${SOUS_LE_SEUIL.toFixed(2)}, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const couronne = new THREE.Mesh(geoCouronne, matCouronne);
  couronne.renderOrder = 2;
  groupe.add(couronne);

  /** Marche douce de 0 à 1, dérivée nulle aux deux bouts. */
  function lisser(x: number): number {
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  }

  const versOeil = new THREE.Vector3();
  const normaleDisque = new THREE.Vector3();
  const sensInverse = new THREE.Quaternion();

  return {
    objet: groupe,
    regler(eclat, temps, camera) {
      // L'objet ne s'allume pas d'un bloc.
      //
      // Un même nombre monté en droite ligne sur toutes les pièces à la fois se
      // lit comme un variateur qu'on tourne, pas comme quelque chose qui
      // arrive. Alors chacune a son heure : l'ombre et son anneau de photons
      // d'abord — ils sont l'objet, et ils sont là avant le reste —, puis le
      // disque, le temps que le gaz tombe et chauffe. Au départ, le même ordre
      // à l'envers : le disque s'éteint en premier, la silhouette reste.
      //
      // Et chaque montée est adoucie à ses deux bouts, de sorte qu'aucune
      // n'ait de début ni de fin visibles.
      const tot = lisser(eclat / 0.45);
      const tard = lisser((eclat - 0.25) / 0.75);
      matDisque.uniforms.uEclat.value = tard;
      matDisque.uniforms.uTemps.value = temps;
      matPhotons.uniforms.uEclat.value = tot;
      matCouronne.uniforms.uEclat.value = tard;
      matCouronne.uniforms.uTemps.value = temps;

      // Il **grandit** en paraissant, et rapetisse en s'en allant.
      //
      // C'est la moitié de l'effet : une masse pareille ne s'allume pas sur
      // place, elle vient. Du cinquième de sa taille au plein, puis l'inverse
      // — et comme le départ traîne (voir `SORTIE_TROU`), il s'éloigne
      // longuement au lieu de s'éteindre d'un coup.
      //
      // La taille suit sa propre courbe, un peu en avance sur l'éclat : on voit
      // d'abord quelque chose d'assez grand mais sombre, puis cela s'allume.
      // L'ordre inverse donnerait un point brillant qui enfle, ce qui ressemble
      // à une explosion et non à une arrivée.
      groupe.scale.setScalar(0.2 + 0.8 * lisser(eclat * 1.25));

      // La direction de l'œil, ramenée dans le repère du disque : c'est elle
      // qui dit quel côté vient vers nous, donc lequel brûle.
      versOeil.copy(camera.position).sub(groupe.position).normalize();
      disque.getWorldQuaternion(sensInverse).invert();
      matDisque.uniforms.uVersOeil.value.copy(versOeil).applyQuaternion(sensInverse);

      // Et de combien on le voit par la tranche : la couronne n'a de sens que
      // dans ce cas, puisqu'il faut du disque derrière l'ombre pour qu'il y ait
      // quelque chose à relever.
      normaleDisque.set(0, 1, 0).applyQuaternion(groupe.quaternion);
      matCouronne.uniforms.uTranche.value = 1 - Math.abs(versOeil.dot(normaleDisque));

      // Les deux cercles regardent l'œil.
      photons.quaternion.copy(camera.quaternion);
      couronne.quaternion.copy(camera.quaternion);
    },
    dispose() {
      geoHorizon.dispose();
      matHorizon.dispose();
      geoDisque.dispose();
      matDisque.dispose();
      geoPhotons.dispose();
      matPhotons.dispose();
      geoCouronne.dispose();
      matCouronne.dispose();
    },
  };
}
