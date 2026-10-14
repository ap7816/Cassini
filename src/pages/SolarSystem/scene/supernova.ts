import * as THREE from 'three';

/**
 * La supernova : une étoile qui explose, et pas une lampe qu'on allume.
 *
 * La distinction est tout le sujet. Un point lumineux au loin, si brillant
 * soit-il, se lit comme une étoile de plus — il ne se passe rien, il y a
 * seulement quelque chose de clair. Ce qu'on reconnaît d'une explosion, c'est
 * qu'une matière **part** : un éclair d'abord, puis une coquille qui s'ouvre et
 * grandit, se déchire, se refroidit et se perd. C'est cela qui est construit
 * ici, et c'est pour cela que la chose est en volume.
 *
 * Trois pièces :
 *
 * 1. **L'éclair** — un carré tourné vers l'œil : le cœur, son halo, et quatre
 *    aigrettes. C'est la réponse de l'instrument à une source ponctuelle qui le
 *    sature, et c'est ce qui dit « ceci est trop brillant pour être regardé ».
 *    Il domine la première seconde et décline ensuite plus vite que le reste :
 *    le point s'éteint, ce qui en est sorti continue.
 * 2. **L'onde de choc** — une sphère qui enfle. On n'en voit que le bord, parce
 *    qu'au bord le regard traverse la coquille en biais et rencontre bien plus
 *    de matière qu'en son milieu : c'est ce qui en fait une bulle et non une
 *    boule, et c'est vrai des vrais rémanents.
 * 3. **Les débris** — une seconde coquille, plus lente et plus grumeleuse,
 *    derrière la première. L'explosion n'est pas propre : des paquets partent
 *    plus vite que d'autres, et c'est ce qui donne les filaments.
 *
 * La coquille grandit comme la racine cinquième du temps au carré — la loi de
 * Sedov et Taylor, celle d'un souffle qui pousse le milieu autour de lui.
 * Autrement dit : très vite au début, de plus en plus lentement ensuite. Une
 * croissance régulière donnerait un ballon qu'on gonfle ; celle-ci donne un
 * coup.
 *
 * Sa place est celle du ciel : `ciel.ts` la rapporte sur la sphère des
 * événements, pour qu'elle se voie depuis n'importe quel bout de la galaxie.
 */

export type SupernovaCiel = {
  objet: THREE.Object3D;
  /**
   * `eclat` est l'enveloppe lumineuse, `age` l'avancement de 0 à 1 — c'est lui
   * qui décide de la taille de la coquille et de sa couleur.
   */
  regler: (eclat: number, age: number, temps: number, camera: THREE.Camera) => void;
  dispose: () => void;
};

/** Bruit en volume : les coquilles sont déchirées dans les trois dimensions. */
const BRUIT = /* glsl */ `
  float alea(vec3 p) {
    return fract(sin(dot(p, vec3(37.1, 61.7, 17.3))) * 43758.5453);
  }
  float bruit(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(alea(i), alea(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(alea(i + vec3(0.0, 1.0, 0.0)), alea(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(alea(i + vec3(0.0, 0.0, 1.0)), alea(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(alea(i + vec3(0.0, 1.0, 1.0)), alea(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }
`;

/**
 * Ce qui tient les grandes surfaces sous le seuil du débordement lumineux.
 *
 * Même raison qu'au trou noir : au-delà de 0,85 la passe de débordement reprend
 * le pixel et l'étale, et une coquille de cette taille peinte à deux noie
 * l'écran. Seul l'éclair, qui est un point, a le droit de franchir ce seuil —
 * c'est même tout son intérêt.
 */
const SOUS_LE_SEUIL = 0.5;

/**
 * Une coquille : une sphère dont on ne voit que le bord.
 *
 * Les deux en ont besoin, avec des réglages différents — l'onde de choc est
 * mince et vive, les débris épais et grumeleux.
 */
function creerCoquille(opts: {
  rayon: number;
  /** Plus il est grand, plus la coquille est mince au bord. */
  finesse: number;
  /** Taille des déchirures : petit pour de grands paquets. */
  grain: number;
  chaude: THREE.Color;
  froide: THREE.Color;
  force: number;
}): { maillage: THREE.Mesh; materiau: THREE.ShaderMaterial; geometrie: THREE.SphereGeometry } {
  const geometrie = new THREE.SphereGeometry(opts.rayon, 64, 48);
  const materiau = new THREE.ShaderMaterial({
    uniforms: {
      uEclat: { value: 0 },
      uAge: { value: 0 },
      uTemps: { value: 0 },
      uChaude: { value: opts.chaude },
      uFroide: { value: opts.froide },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      varying vec3 vMonde;
      varying vec3 vNormaleMonde;
      void main() {
        vDir = normalize(position);
        vec4 monde = modelMatrix * vec4(position, 1.0);
        vMonde = monde.xyz;
        vNormaleMonde = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * monde;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform float uAge;
      uniform float uTemps;
      uniform vec3 uChaude;
      uniform vec3 uFroide;
      varying vec3 vDir;
      varying vec3 vMonde;
      varying vec3 vNormaleMonde;
      ${BRUIT}

      void main() {
        // Le bord contre le milieu.
        //
        // Au milieu de la bulle, le regard traverse la coquille de part en part
        // et ne rencontre presque rien ; au bord, il la prend en biais et la
        // suit sur toute sa longueur. C'est pour cela qu'un rémanent se voit
        // comme un anneau alors qu'il est une sphère, et c'est ce seul calcul
        // qui le dit.
        vec3 vers = normalize(cameraPosition - vMonde);
        float limbe = 1.0 - abs(dot(normalize(vNormaleMonde), vers));
        float coquille = pow(limbe, ${opts.finesse.toFixed(1)});

        // Déchirée, et qui se déchire davantage en vieillissant : au début le
        // souffle est encore d'un bloc, ensuite il part en lambeaux.
        //
        // Le bruit est **tranché** avant de servir. Pris tel quel il reste
        // autour de sa moyenne, les deux faces de la sphère se superposent en
        // s'y moyennant encore, et il n'en sort qu'une bulle lisse. Tranché, il
        // fait des trous, et c'est par les trous qu'on voit que cela se déchire.
        float grumeaux = bruit(vDir * ${opts.grain.toFixed(1)} + vec3(0.0, 0.0, uTemps * 0.03));
        float fin = bruit(vDir * ${(opts.grain * 2.7).toFixed(1)});
        float dechirure = smoothstep(0.3, 0.72, 0.62 * grumeaux + 0.38 * fin);
        float fil = mix(1.0, 0.2 + 1.7 * dechirure, min(1.0, 0.4 + uAge * 1.3));

        // Bleu-blanc tant que le gaz est chaud, cuivré quand il se détend. La
        // dérive est ce qui distingue une supernova d'une étoile quelconque.
        vec3 teinte = mix(uChaude, uFroide, smoothstep(0.1, 0.75, uAge));

        // Le plafond est posé **après** la force, et non avant.
        //
        // Posé avant, il écrasait tout le haut de la courbe : le bord de la
        // coquille y arrivait partout, les déchirures disparaissaient dans le
        // plafond et il ne restait qu'un anneau lisse. C'est le genre de détail
        // qui ne se voit pas dans le code et saute aux yeux à l'image.
        float alpha = clamp(coquille * fil * ${opts.force.toFixed(2)}, 0.0, 1.0) * uEclat;
        gl_FragColor = vec4(teinte * ${SOUS_LE_SEUIL.toFixed(2)}, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const maillage = new THREE.Mesh(geometrie, materiau);
  maillage.renderOrder = -1;
  return { maillage, materiau, geometrie };
}

export function createSupernova(rayon: number): SupernovaCiel {
  const groupe = new THREE.Group();
  groupe.name = 'nova';
  groupe.visible = false;

  // ── 1. L'onde de choc ────────────────────────────────────────────────────
  //
  // Mince, vive, et c'est elle qui donne sa taille à l'événement : tout le
  // reste tient à l'intérieur.
  const choc = creerCoquille({
    rayon,
    finesse: 4.0,
    grain: 5.5,
    chaude: new THREE.Color(0.95, 0.72, 0.45),
    froide: new THREE.Color(1.0, 0.28, 0.1),
    force: 0.7,
  });
  groupe.add(choc.maillage);

  // ── 2. Les débris ────────────────────────────────────────────────────────
  //
  // Plus lents, plus épais, plus grumeleux : la matière de l'étoile elle-même,
  // qui traîne derrière le souffle.
  const debris = creerCoquille({
    rayon: rayon * 0.66,
    finesse: 2.6,
    grain: 4.5,
    chaude: new THREE.Color(1.0, 0.95, 0.78),
    froide: new THREE.Color(1.0, 0.33, 0.08),
    force: 0.45,
  });
  groupe.add(debris.maillage);

  // ── 3. L'éclair ──────────────────────────────────────────────────────────
  //
  // Un carré tourné vers l'œil. Il est large — bien plus que la coquille — mais
  // presque tout y est noir : ce qui le remplit, ce sont les aigrettes, et il
  // leur faut de la place pour s'éteindre au lieu de s'arrêter net.
  const COTE = rayon * 4.8;
  const geoEclair = new THREE.PlaneGeometry(1, 1);
  const matEclair = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 }, uAge: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform float uAge;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        // Un carré a des coins, et les coins se voient quand la chevelure est
        // au plus fort. On s'en tient au cercle inscrit.
        if (r > 0.5) discard;

        // Un cœur minuscule et violent : la lumière ne vient pas d'un disque,
        // elle vient d'un point. Tout ce qu'on voit autour est la réponse de
        // l'instrument, pas l'objet.
        float coeur = smoothstep(0.02, 0.0, r) * 2.8;

        // Une décroissance en carré de la distance, sans plateau : une source
        // saturée s'éteint vite, et c'est cette chute qui éblouit.
        float halo = 0.45 / (1.0 + 260.0 * r * r);

        // Et une lueur bien plus large, qui ne se voit pas de près mais porte
        // de loin : c'est elle qui fait qu'on repère la chose du coin de l'œil
        // depuis l'autre bout de la galaxie.
        float lueur = 0.07 / (1.0 + 26.0 * r * r);

        // Les aigrettes : longues, très fines, et qui s'éteignent en
        // s'éloignant au lieu de s'arrêter net.
        float horizontale = exp(-abs(p.x) * 5.0) * exp(-pow(abs(p.y) * 150.0, 1.3));
        float verticale = exp(-abs(p.y) * 5.0) * exp(-pow(abs(p.x) * 150.0, 1.3));
        float branches = (horizontale + verticale) * 1.15;

        vec3 couleur = mix(vec3(0.82, 0.9, 1.0), vec3(1.0, 0.62, 0.42), uAge);

        float a = (coeur + halo + lueur + branches) * uEclat;
        gl_FragColor = vec4(couleur * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const eclair = new THREE.Mesh(geoEclair, matEclair);
  eclair.renderOrder = -1;
  groupe.add(eclair);

  /** Marche douce de 0 à 1, dérivée nulle aux deux bouts. */
  function lisser(x: number): number {
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  }

  return {
    objet: groupe,
    regler(eclat, age, temps, camera) {
      const a = Math.max(0, Math.min(1, age));

      // La loi du souffle : très vite, puis de moins en moins — mais jamais
      // immobile.
      //
      // Le premier terme est celui de Sedov, et c'est lui qui fait l'explosion :
      // la coquille est déjà au tiers de sa taille le temps de tourner la tête.
      // Seul, il sature — entre les deux tiers et la fin, il ne gagne plus que
      // quinze pour cent, ce qui ne se voit pas, et le dernier tiers de
      // l'événement devenait un grand cercle rouge arrêté qui attendait de
      // s'éteindre. Le second terme rend au souffle une vitesse à la fin : il
      // grandit encore quand il s'efface, et c'est ainsi qu'on le **perd de
      // vue** au lieu de le voir s'arrêter.
      const souffle = a ** 0.4 * (1 + 0.5 * a ** 2.5);
      choc.maillage.scale.setScalar(0.02 + 0.98 * souffle);
      // Les débris traînent derrière : ils partent du même point mais n'ont pas
      // reçu la même poussée.
      debris.maillage.scale.setScalar(0.02 + 0.98 * a ** 0.62 * (1 + 0.4 * a ** 2.5));

      choc.materiau.uniforms.uEclat.value = eclat * lisser(a / 0.035);
      choc.materiau.uniforms.uAge.value = a;
      choc.materiau.uniforms.uTemps.value = temps;
      debris.materiau.uniforms.uEclat.value = eclat * lisser(a / 0.05);
      debris.materiau.uniforms.uAge.value = a;
      debris.materiau.uniforms.uTemps.value = temps;

      // Le point s'éteint plus vite que ce qui en est sorti.
      //
      // Sans cela, l'éclair reste au milieu de la coquille jusqu'au bout et
      // l'explosion ressemble à une lampe entourée de fumée. Il doit céder la
      // place : à la fin il ne reste que la coquille, qui est le rémanent.
      matEclair.uniforms.uEclat.value = eclat * (0.12 + 0.88 * (1 - a) ** 2.2);
      matEclair.uniforms.uAge.value = a;
      // Il enfle un peu en s'allumant, le temps de l'éclair, et pas plus : ce
      // qui grandit ici, c'est la coquille.
      eclair.scale.setScalar(COTE * (0.55 + 0.45 * lisser(a / 0.04)));
      eclair.quaternion.copy(camera.quaternion);
    },
    dispose() {
      choc.geometrie.dispose();
      choc.materiau.dispose();
      debris.geometrie.dispose();
      debris.materiau.dispose();
      geoEclair.dispose();
      matEclair.dispose();
    },
  };
}
