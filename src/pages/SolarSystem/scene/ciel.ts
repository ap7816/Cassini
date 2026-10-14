import * as THREE from 'three';
import type { EvenementCiel } from '../../../features/debug/evenementsCiel';
import { createTrouNoir } from './trouNoir';
import {
  arreterMusiqueEvenement,
  jouerMusiqueEvenement,
  type EvenementMusical,
} from '../../../features/evenements/musiqueEvenement';

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

    // Les deux bouts de l'arc s'éteignent eux aussi.
    //
    // Sans cela, le rideau s'arrêtait net là où le cylindre s'ouvre : une arête
    // verticale parfaitement droite traversait le ciel de haut en bas, et rien
    // dans un ciel n'a de bord droit.
    float bords = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));

    // Les plis portent la lumière, la nappe s'efface.
    //
    // C'est aux stries qu'on reconnaît une aurore ; une nappe uniforme n'est
    // qu'un voile. Les élever à une puissance ferme les creux et détache les
    // plis, sans ajouter de lumière au total.
    float plis = pow(stries, 1.6);
    float a = pied * sommet * bords * smoothstep(0.46, 0.92, masse) * (0.12 + 0.98 * plis);
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
  update: (
    dt: number,
    vivant: boolean,
    evenements: boolean,
    mouvementReduit: boolean,
    camera: THREE.Camera,
    soleil: THREE.Vector3,
  ) => void;
  /**
   * Provoque un événement sur-le-champ.
   *
   * Pour la mise au point : ces événements sont rares par construction, et on
   * ne règle pas une couleur en attendant une heure. La caméra est celle de la
   * dernière image — l'événement naît donc dans le champ, comme toujours.
   *
   * Rend l'endroit du ciel où il se produit, pour qu'on puisse l'y regarder.
   */
  declencher: (evenement: EvenementCiel) => THREE.Vector3 | null;
  /**
   * Où se trouve la tête de la comète bleue, si elle passe.
   *
   * La scène en a besoin : c'est elle qui tient le pointeur, et c'est le survol
   * de cette tête qui fait monter le chant.
   */
  teteCometeBleue: () => THREE.Vector3 | null;
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
  // Un rayon modeste, et sans rapport avec la taille de la galaxie.
  //
  // Il valait la distance du ciel — jusqu'à près de vingt mille unités. Tant
  // que le cylindre restait au centre de la galaxie, on en voyait au moins une
  // partie ; depuis qu'il suit l'observateur, il se tenait tout entier à cette
  // distance-là, c'est-à-dire au-delà du plan lointain de la caméra, et il
  // était découpé en entier. Comme il ne se compare à aucune profondeur et se
  // dessine avant tout le reste, seule compte sa taille **apparente**, qui ne
  // dépend que de l'angle qu'il couvre.
  const RAYON_RIDEAU = 1100;
  const geoRideau = new THREE.CylinderGeometry(
    RAYON_RIDEAU, RAYON_RIDEAU, RAYON_RIDEAU * 1.1, 48, 1, true,
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

  /**
   * La distance à laquelle les événements se dessinent.
   *
   * Aucun rapport avec leur place dans la galaxie, dont on ne garde que la
   * direction. Un objet posé à sa vraie place est condamné deux fois : le plan
   * lointain de la caméra le tranche dès qu'on s'en éloigne de plus de vingt
   * mille unités, et il rapetisse à mesure qu'on s'en va — c'est-à-dire qu'une
   * supernova à l'autre bout de la galaxie n'existe plus pour personne.
   *
   * Rapporté sur une sphère autour de l'œil, il garde sa direction, donc le
   * coin de ciel où il se produit, mais plus sa distance : il se voit de
   * partout, à la même taille, et rien ne peut le couper. C'est ce qu'on fait
   * de toute façon pour les étoiles du fond — personne ne les dessine à des
   * années-lumière.
   *
   * Courte, cette distance : ce qui compte n'est pas elle, mais la taille
   * qu'on donne aux choses rapportée à elle. Prise grande, les traînes et les
   * queues finissaient par dépasser le plan lointain et se faisaient trancher.
   */
  const RAYON_CIEL = 2200;

  // ── La traînée ───────────────────────────────────────────────────────────
  //
  // Deux triangles, une seule fois pour toute la session : on les déplace et
  // on les rallume, au lieu d'en créer à chaque passage.
  // Courte et fine.
  //
  // Elle faisait la moitié du ciel et sa tête saturait en boule : elle se
  // lisait comme une seconde comète. Or ce qui distingue une étoile filante,
  // c'est justement qu'elle est brève, mince, et qu'on n'a pas le temps de
  // l'examiner.
  // Sa longueur est un angle, pas une distance : le cinquième du ciel, comme
  // lorsqu'elle vivait à sa vraie place, à huit dixièmes de la distance de
  // rendu.
  const longueur = RAYON_CIEL * 0.375;
  const geoTrainee = new THREE.PlaneGeometry(longueur, longueur * 0.02);
  const matTrainee = new THREE.ShaderMaterial({
    uniforms: {
      uEclat: { value: 0 },
      uTeinte: { value: new THREE.Color(0xbfd8ff) },
      // Rapport du rectangle : il permet de raisonner en unités de longueur,
      // donc de dessiner des formes rondes sur un quadrilatère très étiré.
      uRatio: { value: 50 },
    },
    vertexShader: VERTEX,
    // La tête est vive, la queue s'efface : c'est ce qui fait lire le sens de
    // la course. Le carré du fondu resserre la tête.
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform vec3 uTeinte;
      uniform float uRatio;
      varying vec2 vUv;
      void main() {
        // On se place en unités de longueur : la coordonnée en travers est
        // divisée par le rapport du rectangle. Sans cela, tout cercle dessiné
        // ici sortirait écrasé en trait, et toute forme ronde deviendrait
        // rectangulaire — c'est ce qui laissait voir le bord du quadrilatère.
        vec2 q = vec2(vUv.x, (vUv.y - 0.5) / uRatio);
        float demi = 0.5 / uRatio;

        // Une capsule : un segment, et une calotte ronde au bout. L'axe
        // s'arrête avant le bord du rectangle, de sorte que la tête ait la
        // place d'être ronde au lieu d'être coupée net.
        vec2 surAxe = vec2(clamp(q.x, 0.0, 1.0 - demi), 0.0);
        float d = length(q - surAxe);

        // Le fuseau : presque rien à la queue, pleine largeur à la tête.
        float rayon = demi * (0.18 + 0.82 * pow(q.x, 0.6));
        float corps = exp(-pow(d / max(rayon, 1e-6), 2.0) * 2.2) * pow(q.x, 3.5);

        // La tête concentre la lumière : c'est elle qui donne le sens de la
        // course, et c'est elle que le débordement lumineux attrapera.
        float tete = exp(-pow(d / (demi * 0.6), 2.0) * 2.2) * smoothstep(0.84, 1.0, q.x) * 1.5;

        float a = (corps + tete) * uEclat;
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
  trainee.name = 'trainee';
  trainee.renderOrder = -1;
  trainee.visible = false;
  groupe.add(trainee);

  // ── Le passage ───────────────────────────────────────────────────────────
  //
  // Un seul point, loin, qui traverse en ligne droite et clignote. Rien de
  // plus : à cette distance, une forme de vaisseau ne serait qu'un pâté.
  const geoVaisseau = new THREE.BufferGeometry();
  geoVaisseau.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  // Un point rond, et non le carré que dessine un matériau de points sans
  // texture — la même erreur que pour la tête de comète.
  const matVaisseau = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 } },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // Taille fixe en pixels : à cette distance, ce qui change n'est pas sa
        // taille apparente mais le fait qu'on le remarque ou non.
        gl_PointSize = 9.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        // Un feu dur, et le peu de halo que laisse une source lointaine.
        float a = (smoothstep(0.17, 0.02, r) + smoothstep(0.5, 0.1, r) * 0.25) * uEclat;
        gl_FragColor = vec4(vec3(1.0, 0.94, 0.78) * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const vaisseau = new THREE.Points(geoVaisseau, matVaisseau);
  vaisseau.name = 'vaisseau';
  vaisseau.renderOrder = -1;
  vaisseau.frustumCulled = false;
  vaisseau.visible = false;
  groupe.add(vaisseau);

  // ── La supernova ─────────────────────────────────────────────────────────
  //
  // Une étoile qui s'embrase, écrase tout le ciel pendant quelques secondes,
  // puis décline sur une minute en laissant un nuage à sa place pour le reste
  // de la session.
  //
  // Rare, et c'est tout l'intérêt : dans notre galaxie il en éclate une par
  // siècle environ, et Kepler a vu la dernière visible à l'œil nu en 1604. Une
  // par session au plus, jamais dans les premières minutes — sinon on croit à
  // une séquence d'ouverture — et seulement quand quelqu'un regarde.
  const geoNova = new THREE.BufferGeometry();
  geoNova.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const matNova = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 }, uTaille: { value: 90 }, uAge: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTaille;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uTaille;
      }
    `,
    // Un cœur net, un halo, et quatre branches : la signature d'un point
    // lumineux qui sature l'instrument.
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform float uAge;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p);
        // Un point de rendu est un carré : hors du cercle inscrit, rien n'est
        // dessiné du tout. Le fondu plus bas suffirait presque, mais « presque »
        // laisse justement voir les coins quand la chevelure est au plus fort.
        if (r > 0.5) discard;

        // Un cœur minuscule et violent.
        //
        // C'est ce qui distingue une source ponctuelle d'une boule de gaz : la
        // lumière ne vient pas d'un disque, elle vient d'un point. Tout ce qu'on
        // voit autour est la réponse de l'instrument, pas l'objet.
        float coeur = smoothstep(0.03, 0.0, r) * 3.2;

        // Et une décroissance en carré de la distance, sans plateau.
        //
        // Deux fondus superposés donnaient un halo large et uniforme — de la
        // ouate, où le cœur se noyait. Une vraie source saturée s'éteint vite,
        // et c'est cette chute brutale qui la rend éblouissante.
        float halo = 0.55 / (1.0 + 160.0 * r * r);

        // Les aigrettes : longues, très fines, et qui s'éteignent en s'éloignant
        // au lieu de s'arrêter net.
        float horizontale = exp(-abs(p.x) * 6.5) * exp(-pow(abs(p.y) * 70.0, 1.3));
        float verticale = exp(-abs(p.y) * 6.5) * exp(-pow(abs(p.x) * 70.0, 1.3));
        float branches = (horizontale + verticale) * 1.1;

        // Elle rougit en vieillissant : la boule de gaz se détend et se
        // refroidit. Bleu-blanc au pic, cuivrée à la fin — c'est à cette
        // dérive qu'on reconnaît une supernova d'une étoile quelconque.
        vec3 couleur = mix(vec3(0.82, 0.9, 1.0), vec3(1.0, 0.62, 0.42), uAge);

        float a = (coeur + halo + branches) * uEclat;
        gl_FragColor = vec4(couleur * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const nova = new THREE.Points(geoNova, matNova);
  nova.name = 'nova';
  nova.renderOrder = -1;
  // Jamais écarté comme hors champ.
  //
  // La sphère englobante d'un objet est calculée à sa création — ici autour
  // d'un point à l'origine, donc de rayon nul. Déplacer ensuite le sommet ne la
  // met pas à jour : le moteur juge la visibilité d'après une bille restée au
  // centre de la galaxie, et écarte l'objet alors qu'il est droit devant.
  nova.frustumCulled = false;
  nova.visible = false;
  groupe.add(nova);

  // ── La comète ────────────────────────────────────────────────────────────
  //
  // Sa queue ne traîne pas derrière elle : elle est poussée par le vent de
  // l'étoile, et pointe donc toujours à l'opposé du soleil, même quand la
  // comète s'en éloigne. C'est le détail que presque personne ne respecte, et
  // c'est celui qui fait vrai.
  const comete = new THREE.Group();
  const geoNoyau = new THREE.BufferGeometry();
  geoNoyau.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  // Un matériau de points sans texture dessine un carré — c'est la forme du
  // point lui-même. Il faut donc tailler le disque soi-même, dans le shader.
  const matNoyau = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 } },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 22.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        // Un noyau dur dans une chevelure diffuse : c'est de la glace qui
        // s'évapore, pas une bille.
        float a = (smoothstep(0.08, 0.0, r) + smoothstep(0.5, 0.0, r) * 0.35) * uEclat;
        gl_FragColor = vec4(vec3(0.82, 0.93, 1.0) * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const noyau = new THREE.Points(geoNoyau, matNoyau);
  noyau.name = 'noyauComete';
  // Même raison : son sommet bouge, pas sa sphère englobante.
  noyau.frustumCulled = false;

  // Un rectangle tourné vers l'œil, et non un cône.
  //
  // Un cône est une surface : on en voit l'arête, et une queue de comète qui a
  // des bords nets ressemble à un faisceau de phare. Ce qu'on veut est une
  // densité qui décroît dans toutes les directions — cela se peint, cela ne se
  // modélise pas. Le rectangle part du noyau et s'étend vers +X.
  const geoQueue = new THREE.PlaneGeometry(1, 1);
  geoQueue.translate(0.5, 0, 0);
  const matQueue = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      varying vec2 vUv;
      void main() {
        float along = vUv.x;                 // 0 au noyau, 1 au bout
        float across = abs(vUv.y - 0.5) * 2.0;

        // Le panache s'ouvre en s'éloignant du noyau, et sa densité décroît
        // comme une cloche en travers : pas de bord, donc pas d'arête.
        float largeur = 0.08 + 0.92 * pow(along, 0.7);
        float profil = exp(-pow(across / largeur, 2.0) * 1.7);

        // Et elle s'efface en longueur, d'abord lentement puis d'un coup.
        float longueur = pow(1.0 - along, 1.8);

        // Un filet plus dense dans l'axe : c'est la queue de gaz ionisé, plus
        // droite et plus bleue que la poussière qui l'entoure.
        float filet = exp(-pow(across / (largeur * 0.28), 2.0) * 3.0) * pow(1.0 - along, 2.6);

        float a = (profil * 0.45 + filet * 0.55) * longueur * uEclat;
        gl_FragColor = vec4(mix(vec3(0.55, 0.78, 1.0), vec3(0.85, 0.93, 1.0), filet) * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const queue = new THREE.Mesh(geoQueue, matQueue);
  comete.add(noyau);
  comete.add(queue);
  comete.renderOrder = -1;
  comete.visible = false;
  groupe.add(comete);

  // ── La comète bleue ──────────────────────────────────────────────────────
  //
  // La même chose en grand, en bleu, et en lent : un objet qu'on voit venir de
  // loin et qui met plus d'une minute à traverser. Elle n'a pas d'autre raison
  // d'être que d'être belle, et de se faire attendre.
  const cometeBleue = new THREE.Group();
  const geoNoyauBleu = new THREE.BufferGeometry();
  geoNoyauBleu.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  // Son propre matériau, et non celui de l'autre repeint : ce qui la distingue
  // n'est pas une teinte, c'est une matière. Un cœur blanc qui déborde, une
  // enveloppe de glace cyan, et une couronne bleue qui s'étale loin.
  const matNoyauBleu = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 }, uTemps: { value: 0 }, uBout: { value: 0 } },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // Taille fixe, et non proportionnelle à l'éclat.
        //
        // En début de course, l'éclat est encore faible : la tête naissait donc
        // minuscule pendant que la racine du panache brillait déjà. La comète
        // se lisait alors comme un cône finissant en pointe — tout l'inverse
        // d'une comète, qui est une tête ronde suivie d'une traîne.
        gl_PointSize = 300.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform float uTemps;
      /** De 0 (elle passe de profil) à 1 (elle vient droit sur nous). */
      uniform float uBout;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p);

        // La chevelure : une boule, large, et c'est ce qu'on voit d'une comète.
        //
        // Le noyau fait quelques kilomètres — rien, à ces distances. Ce qui se
        // voit est le gaz qu'il relâche en chauffant, et qui l'entoure d'une
        // sphère de plusieurs dizaines de milliers de kilomètres. D'où une
        // boule franche, et non un point avec un halo : c'est la boule qui est
        // l'objet.
        // Les trois éclats sont tenus en dessous de la saturation : au-delà,
        // tout vire au blanc et la couleur disparaît. Une comète bleue qui
        // brille trop n'est plus bleue.
        //
        // C'est la règle de tout ce fichier en mélange additif : la teinte ne
        // survit que tant que le canal le plus faible — ici le rouge — reste
        // sous un. Au-delà, les trois canaux butent ensemble sur la même
        // valeur, et la couleur, quelle qu'elle soit, devient du blanc.
        float boule = exp(-pow(r / 0.34, 2.0) * 2.4) * 0.62;
        // Un cœur clair au milieu, là où le gaz est le plus dense. Petit, et
        // pas tout à fait blanc : sur une photographie de comète, ce cœur fait
        // quelques pixels au milieu d'une chevelure qui, elle, est bleue.
        // Le cœur, lui, ne grossit pas avec elle : c'est un point sur toutes les
        // photographies de comètes, et c'est aussi ce qui garde la couleur —
        // les trois éclats s'ajoutent, et le rouge de celui-ci est le premier à
        // buter sur un.
        float coeur = exp(-pow(r / 0.04, 2.0) * 2.0) * 0.55;
        // Et ce qu'elle perd autour d'elle, qui se perd loin.
        //
        // C'est aussi la queue, quand on la regarde par le bout.
        //
        // Le panache est un rectangle tourné vers l'œil : vue de face il barre
        // le ciel, mais quand la comète vient droit sur nous il n'a plus de
        // face à présenter et il s'efface — et l'on ne voyait plus rien qu'une
        // boule. Or une queue vue par le bout ne disparaît pas : elle se range
        // derrière la chevelure et l'entoure d'un halo, large et diffus. C'est
        // ce halo-là qu'on enfle ici, exactement à mesure que le panache s'en
        // va, de sorte qu'il y a toujours quelque chose à voir.
        float voile = (0.16 + 0.42 * uBout) / (1.0 + (26.0 - 17.0 * uBout) * r * r);

        // Elle respire : de la glace qui s'évapore n'a pas un éclat fixe.
        float souffle = 0.92 + 0.08 * sin(uTemps * 1.3);

        float a = (boule + coeur + voile) * souffle * uEclat;

        // Éteint avant le bord du carré qui la porte.
        //
        // Un point de rendu est un carré, et tout ce qui vit encore à son bord
        // y est coupé net : le halo, autrefois ténu, y passait inaperçu ; large
        // et franc comme il l'est devenu de bout, il y dessinait un cadre. On
        // le ramène à zéro sur le cercle inscrit, où il n'y a plus de coin.
        a *= smoothstep(0.5, 0.36, r);
        // Claire au cœur, cyan sur la boule, franchement bleue sur le voile.
        vec3 couleur = mix(
          mix(vec3(0.10, 0.40, 1.0), vec3(0.28, 0.66, 1.0), boule),
          vec3(0.72, 0.90, 1.0),
          smoothstep(0.045, 0.0, r)
        );
        gl_FragColor = vec4(couleur * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const noyauBleu = new THREE.Points(geoNoyauBleu, matNoyauBleu);
  noyauBleu.frustumCulled = false;
  const geoQueueBleue = new THREE.PlaneGeometry(1, 1);
  geoQueueBleue.translate(0.5, 0, 0);
  const matQueueBleue = new THREE.ShaderMaterial({
    uniforms: { uEclat: { value: 0 }, uTemps: { value: 0 }, uFace: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uEclat;
      uniform float uTemps;
      uniform float uFace;
      varying vec2 vUv;

      float alea(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
      }

      /** Bruit continu : des bandes à seuil feraient des rectangles. */
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

      void main() {
        float along = vUv.x;
        float across = abs(vUv.y - 0.5) * 2.0;

        // Les filaments, d'abord : ils servent aussi à border le panache.
        //
        // En bandes à seuil, ils dessinaient des rectangles à bord franc —
        // exactement ce qu'une queue de comète n'a pas. Ici ils ne font que
        // creuser et renforcer, de quelques dizaines de pour cent.
        float strie = bruit(vec2((vUv.y - 0.5) * 16.0, along * 2.6 - uTemps * 0.12));
        float module = 0.7 + 0.5 * strie;

        // La densité décroît en cloche en travers : aucun bord, nulle part.
        //
        // Elle commence **à la largeur de la chevelure**, et non en pointe. Une
        // amorce fine disparaissait sous l'éclat de la boule : le panache ne se
        // voyait qu'une fois évasé, c'est-à-dire à distance, et l'on voyait
        // alors une boule d'un côté, une traîne de l'autre, et un trou entre
        // les deux. Partant large, il sort du rond lui-même.
        //
        // Et elle meurt bien avant le bord du rectangle qui la porte. Elle s'y
        // étendait jusqu'au bout, où un fondu la coupait : ce fondu suit le
        // bord, il est donc parfaitement droit, et c'est cette barre-là qu'on
        // finissait par voir courir le long du panache. En laissant un tiers de
        // marge, plus rien n'atteint le bord et il n'y a plus de droite à voir.
        //
        // Les filaments ondulent la largeur elle-même : le contour n'est plus
        // le même d'un bout à l'autre, ce qui achève de défaire la ligne.
        // L'exposant décide de la silhouette, et c'est lui qu'on voit.
        //
        // Pris petit, la largeur est acquise dans le premier quart puis ne bouge
        // plus : le panache a deux longs côtés parallèles, c'est-à-dire un
        // rectangle — et vu de bout, où la longueur se trouve écrasée par la
        // perspective, il ne reste que ce rectangle. Pris proche de un, la
        // largeur croît d'un bout à l'autre et la chose reste un éventail quel
        // que soit l'angle sous lequel on la prend.
        float largeur = (0.03 + 0.72 * pow(along, 0.85)) * (0.85 + 0.3 * strie);
        float profil = exp(-pow(across / largeur, 2.0) * 2.4);

        // Pas de jet central.
        //
        // Une ligne brillante dans l'axe donnait de la structure de près, mais à
        // cette taille elle se lisait comme un trait tiré à la règle en travers
        // du ciel. Ce qu'on voit d'une vraie queue est un éventail diffus, clair
        // près de la chevelure et qui s'efface ensuite — pas un rayon.
        //
        // Reste une courte surbrillance juste derrière la boule, là où le gaz
        // n'a pas encore eu le temps de se disperser.
        float sortie = exp(-pow(across / (largeur * 0.55), 2.0) * 1.6) * pow(1.0 - along, 7.0);

        // Et le panache démarre sur le noyau, par une amorce courte.
        //
        // Deux écueils se font face, et l'évasement rapide passe entre les deux.
        //
        // Une amorce large bute sur le petit côté du rectangle : le fondu qui le
        // cache vaut zéro sur toute sa hauteur puis un, c'est-à-dire une barre
        // droite en travers, plus haute que la boule et qui dépasse d'elle. Un
        // fondu circulaire, essayé ensuite, efface le panache dans un disque qui
        // se trouve être plus grand que la chevelure : la queue reparaît alors à
        // distance de la tête, avec un trou entre les deux.
        //
        // L'amorce est donc fine — le petit côté ne fait qu'un demi-degré de
        // haut, enfoui dans le cœur — mais elle s'évase en quelques centièmes de
        // la longueur, bien avant de sortir de la chevelure. Il n'y a ni barre à
        // voir ni intervalle à combler.
        float derriere = smoothstep(0.0, 0.012, along);

        float extinction = pow(1.0 - along, 2.1);
        float a = (profil * module * 0.5 + sortie * 0.32) * extinction * derriere * uEclat * uFace;

        // Garde-fou : rien n'atteint jamais le bord du rectangle, quelles que
        // soient les valeurs ci-dessus. Il s'y prend de loin, là où la cloche
        // ne vaut déjà plus rien — sans quoi c'est lui qui trace la barre qu'il
        // est censé prévenir.
        a *= smoothstep(0.98, 0.6, across);

        // Claire près de la chevelure, bleue en s'éloignant : c'est la dilution
        // du gaz, et c'est ce qui donne sa profondeur à l'éventail. Le clair
        // est tenu court — il ne gagne que la racine du panache, sans quoi
        // c'est toute la queue qui blanchit.
        vec3 couleur = mix(vec3(0.08, 0.38, 1.0), vec3(0.55, 0.82, 1.0), sortie * 0.65 + profil * 0.06);
        gl_FragColor = vec4(couleur * a, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const queueBleue = new THREE.Mesh(geoQueueBleue, matQueueBleue);
  queueBleue.frustumCulled = false;
  cometeBleue.add(noyauBleu);
  cometeBleue.add(queueBleue);
  cometeBleue.renderOrder = -1;
  cometeBleue.visible = false;
  groupe.add(cometeBleue);

  // ── Le trou noir ─────────────────────────────────────────────────────────
  //
  // Le plus gros et le plus rare. Il ne fait rien d'autre que d'être là : voir
  // `trouNoir.ts`, qui le construit.
  //
  // Comme les autres, il est rapporté sur la sphère du ciel : seule sa
  // direction est vraie, sa distance est celle du ciel. Posé à sa place dans la
  // galaxie, il se faisait couper par le plan lointain dès qu'on s'en éloignait
  // — et c'est justement de loin qu'un objet pareil doit se voir.
  //
  // Il n'y perd pas son relief. Son orientation, elle, reste celle du monde :
  // en se déplaçant dans la galaxie on change l'angle sous lequel on le prend,
  // et son disque s'ouvre, se referme, se montre par la tranche. Ce qu'on perd
  // est seulement de pouvoir s'en approcher — un objet qu'on peut atteindre
  // n'est plus un événement du ciel.
  // Sa taille : son disque barre environ le quart du ciel, soit le tiers de la
  // hauteur de l'écran. Au double, il ne restait plus rien à voir autour de lui
  // — ni les systèmes, ni la voie lactée, ni le reste du ciel —, et un
  // événement qui cache tout le reste n'est plus un événement, c'est un décor.
  const trouNoir = createTrouNoir(RAYON_CIEL * 0.045);
  groupe.add(trouNoir.objet);

  /**
   * Les trois rares ont droit à une musique.
   *
   * Supernova, comète bleue, trou noir : ceux qu'on ne voit qu'une fois ou deux
   * par session. Les étoiles filantes et les passages reviennent toutes les
   * trente secondes — une musique à chaque fois ne serait plus une annonce,
   * seulement du bruit.
   */
  function annoncer(evenement: EvenementMusical): void {
    jouerMusiqueEvenement(evenement);
  }

  // ── L'horloge des événements ─────────────────────────────────────────────
  let temps = 0;

  // Tempête : au repos le rideau respire à peine ; elle le porte au comble en
  // une vingtaine de secondes, le tient, puis le laisse retomber.
  const FORCE_REPOS = 0.45;
  /** Durée d'une tempête, du premier frémissement au dernier. */
  const DUREE_TEMPETE = 80;
  let tempete = 0;
  let prochaineTempete = 95 + Math.random() * 130;

  /** Une chute dure ce qu'elle dure : le temps de la suivre des yeux. */
  const DUREE_TRAINEE = 1.1;
  let trainéeRestante = 0;
  let prochaineTrainee = 18 + Math.random() * 45;
  const departTrainee = new THREE.Vector3();
  const finTrainee = new THREE.Vector3();
  /** Sa place réelle, dont on ne garde que la direction. */
  const vraieTrainee = new THREE.Vector3();
  const courseTrainee = new THREE.Vector3();
  const capTrainee = new THREE.Vector3();

  let vaisseauRestant = 0;
  let prochainVaisseau = 200 + Math.random() * 320;

  // La supernova : une par session au plus, et jamais avant dix minutes.
  //
  // Le tirage se fait une fois par minute, avec une chance sur cent quatre-vingts
  // — soit une toutes les trois heures de galaxie regardée. La plupart des
  // sessions n'en verront aucune : c'est ce qui fait qu'on s'en souvient.
  const DUREE_NOVA = 70;
  let novaRestante = 0;
  let novaFaite = false;
  let prochainTirageNova = 600;
  const positionNova = new THREE.Vector3();
  const tmpNova = new THREE.Vector3();

  // La comète : toutes les six à quinze minutes, une traversée lente.
  const DUREE_COMETE = 80;
  let cometeRestante = 0;
  let prochaineComete = 150 + Math.random() * 400;
  const departComete = new THREE.Vector3();
  const finComete = new THREE.Vector3();
  const vraieComete = new THREE.Vector3();
  const courseComete = new THREE.Vector3();
  const capComete = new THREE.Vector3();

  /** La bleue : rare, lente, et beaucoup plus grande. */
  const DUREE_BLEUE = 150;
  let bleueRestante = 0;
  let prochaineBleue = 900 + Math.random() * 1500;
  const departBleue = new THREE.Vector3();
  const finBleue = new THREE.Vector3();
  const arriereBleue = new THREE.Vector3();
  /** Position de sa tête, pour que la scène sache où l'on peut la survoler. */
  const teteBleue = new THREE.Vector3();
  /** Sa place réelle dans la galaxie, dont on ne garde que la direction. */
  const vraieBleue = new THREE.Vector3();
  const tmpDirection = new THREE.Vector3();
  const tmpCiel = new THREE.Vector3();
  const tmpCap = new THREE.Vector3();
  /** Sens de la course, fixé au départ : la queue s'adosse à lui. */
  const arriereComete = new THREE.Vector3();
  /**
   * Le trou noir : une fois par session au plus, et jamais avant vingt
   * minutes. Quand il vient, il reste une minute — le temps d'aller chercher
   * quelqu'un.
   */
  const DUREE_TROU = 60;
  /** Le temps que met son éclat à monter. */
  const FONDU_TROU = 9;
  /**
   * Et celui qu'il met à s'en aller, beaucoup plus long.
   *
   * Un départ aussi rapide que l'arrivée se voit comme un interrupteur : on
   * regarde l'objet, et il n'est plus là. Il s'efface donc presque deux fois
   * plus lentement, et en traînant — la racine ci-dessous garde une lueur
   * basse pendant plusieurs secondes au lieu de tomber droit sur zéro, ce qui
   * laisse à l'œil le temps de le perdre plutôt que de le voir disparaître.
   */
  const SORTIE_TROU = 16;
  let trouRestant = 0;
  let trouFait = false;
  let prochainTirageTrou = 1200;
  /** La direction où il se tient : fixe, pour qu'il ne bouge pour personne. */
  const directionTrou = new THREE.Vector3();

  const departVaisseau = new THREE.Vector3();
  const finVaisseau = new THREE.Vector3();
  const vraieVaisseau = new THREE.Vector3();
  const placeVaisseau = new THREE.Vector3();
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

  /**
   * Rapporte un événement sur la sphère du ciel : même direction, distance
   * fixe. Voir `RAYON_CIEL` pour le pourquoi.
   */
  function poserDansLeCiel(
    sortie: THREE.Vector3,
    vraie: THREE.Vector3,
    camera: THREE.Camera,
  ): THREE.Vector3 {
    tmpCiel.subVectors(vraie, camera.position).normalize();
    // Posé coordonnée par coordonnée, et non par un copier-ajouter : les trois
    // valeurs sont calculées avant d'être écrites, de sorte que la sortie peut
    // être n'importe quel vecteur — y compris celui qui vient de servir.
    return sortie.set(
      camera.position.x + tmpCiel.x * RAYON_CIEL,
      camera.position.y + tmpCiel.y * RAYON_CIEL,
      camera.position.z + tmpCiel.z * RAYON_CIEL,
    );
  }

  /**
   * La direction qu'une course prend à l'écran.
   *
   * Une fois l'objet rapporté près de l'œil, sa course dans la galaxie n'est
   * plus celle qu'on voit : seule en reste la part perpendiculaire au regard —
   * ce qui s'approche de nous ne traverse pas le ciel. C'est cette part-là qui
   * oriente une traînée et la queue d'une comète.
   *
   * Rend `null` quand la course vient droit sur nous : il n'y a alors aucune
   * direction apparente, et l'appelant garde la précédente.
   */
  function capApparent(
    sortie: THREE.Vector3,
    course: THREE.Vector3,
    vraie: THREE.Vector3,
    camera: THREE.Camera,
  ): THREE.Vector3 | null {
    tmpCap.subVectors(vraie, camera.position).normalize();
    sortie.copy(course).addScaledVector(tmpCap, -course.dot(tmpCap));
    if (sortie.lengthSq() < 1e-8) return null;
    return sortie.normalize();
  }

  function lancerTrainee(camera: THREE.Camera): void {
    devantLaCamera(departTrainee, camera, distance * 0.8, 0.5);
    // L'arrivée est proche du départ : une traînée file, elle ne fait pas le
    // tour du ciel.
    devantLaCamera(finTrainee, camera, distance * 0.8, 0.5);
    finTrainee.lerp(departTrainee, 0.55);

    courseTrainee.subVectors(finTrainee, departTrainee).normalize();
    vraieTrainee.copy(departTrainee);
    poserDansLeCiel(trainee.position, vraieTrainee, camera);
    orienter(trainee, capApparent(capTrainee, courseTrainee, vraieTrainee, camera) ?? courseTrainee, camera);
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

    // L'axe reste l'axe, et le rectangle ne tourne qu'autour de lui.
    //
    // Pour présenter sa face à l'œil, on projetait cet axe sur le plan de
    // l'écran — et c'était changer la direction de la chose elle-même. La queue
    // de la comète pivotait donc en même temps que la caméra, alors qu'elle est
    // tenue par le vent de l'étoile et ne doit bouger pour personne.
    //
    // Un pivot autour de l'axe suffit : la face se présente, la direction ne
    // bouge pas. C'est le billboard dit cylindrique.
    const x = sens.clone().normalize();
    const y = new THREE.Vector3().crossVectors(versCamera, x);
    // Regard aligné sur l'axe : le produit vectoriel s'annule et toute
    // orientation se vaut — on en prend une quelconque plutôt qu'un zéro.
    if (y.lengthSq() < 1e-8) y.set(0, 1, 0).addScaledVector(x, -x.y).normalize();
    else y.normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    objet.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  /** Pose la supernova dans la direction tirée, à la distance du ciel. */
  function poserNova(camera: THREE.Camera): void {
    poserDansLeCiel(tmpNova, positionNova, camera);
    const p = geoNova.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, tmpNova.x, tmpNova.y, tmpNova.z);
    p.needsUpdate = true;
  }

  /**
   * Lance une comète en travers du système regardé.
   *
   * Elle entre par un bord du champ et sort par l'autre, en frôlant le soleil :
   * c'est près de lui que sa queue est la plus longue, donc c'est là qu'il faut
   * la regarder passer.
   */
  function lancerComete(camera: THREE.Camera, soleil: THREE.Vector3): void {
    devantLaCamera(departComete, camera, distance * 0.45, 0.8);

    // La course se déduit du soleil, elle ne se tire plus au hasard.
    //
    // La queue est poussée à l'opposé de l'étoile, quoi que fasse la comète.
    // Avec une trajectoire tirée au hasard, une fois sur deux elle avançait donc
    // dans le sens de sa propre queue : vraie pour une comète qui s'éloigne,
    // mais à l'œil, elle a simplement l'air de reculer.
    //
    // Elle arrive vers l'étoile : c'est la seule phase où tout se tient.
    //
    // La queue étant poussée à l'opposé du soleil, une comète qui s'en approche
    // la traîne derrière elle — ce que l'œil attend. Celle qui s'en éloigne la
    // pousse devant, ce qui est vrai mais se lit comme une erreur ; et une
    // course perpendiculaire, qu'on avait essayée, laisse la queue pendre sur
    // le côté. On ne montre donc que l'approche, en biais pour qu'elle traverse
    // le champ plutôt que de foncer droit sur l'étoile.
    const fuite = new THREE.Vector3().subVectors(departComete, soleil).normalize();
    const travers = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    travers.addScaledVector(fuite, -travers.dot(fuite)).normalize();
    const course = travers.multiplyScalar(0.4).addScaledVector(fuite, -0.9).normalize();
    finComete.copy(departComete).addScaledVector(course, distance * 0.55);
    // La queue traîne derrière : l'arrière, c'est l'opposé de la course.
    courseComete.copy(course);
    arriereComete.copy(course).multiplyScalar(-1);
    const p = geoNoyau.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, 0, 0, 0);
    p.needsUpdate = true;
    vraieComete.copy(departComete);
    poserDansLeCiel(noyau.position, vraieComete, camera);
    comete.visible = true;
    cometeRestante = DUREE_COMETE;
  }

  /**
   * Lance la comète bleue : une traversée lente, loin et en grand.
   *
   * Elle passe plus loin que l'autre et dure deux minutes et demie : on doit
   * avoir le temps de la voir arriver, d'aller chercher quelqu'un, et de la
   * regarder partir.
   */
  function lancerCometeBleue(camera: THREE.Camera, soleil: THREE.Vector3): void {
    // Au-dessus de tout, et en travers.
    //
    // Les systèmes sont posés à plat : une comète qui passerait dans leur plan
    // se perdrait entre eux. Celle-ci survole la galaxie et la traverse de part
    // en part — c'est de là qu'elle se voit, et c'est là qu'on la cherche des
    // yeux quand on a entendu dire qu'elle passait.
    const cap = Math.random() * Math.PI * 2;
    const altitude = distance * 0.42;
    departBleue.set(Math.cos(cap) * distance * 0.9, altitude, Math.sin(cap) * distance * 0.9);
    finBleue.set(-departBleue.x, altitude * 0.75, -departBleue.z);

    // Un peu de hauteur en plus au milieu du trajet : elle doit passer
    // au-dessus du système regardé, pas à travers.
    departBleue.y += camera.position.y;
    finBleue.y += camera.position.y;

    const course = new THREE.Vector3().subVectors(finBleue, departBleue).normalize();
    arriereBleue.copy(course).multiplyScalar(-1);
    // Le soleil ne sert plus qu'à rappeler que la glace fond en s'approchant.
    void soleil;

    const p = geoNoyauBleu.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, 0, 0, 0);
    p.needsUpdate = true;
    noyauBleu.position.copy(departBleue);
    cometeBleue.visible = true;
    bleueRestante = DUREE_BLEUE;
    annoncer('cometeBleue');
  }

  /** Le pose haut dans le ciel, et l'allume. */
  function lancerTrouNoir(): void {
    // On retient une **direction**, et non un endroit.
    //
    // Un point fixe de la galaxie change de direction dès que l'œil se déplace :
    // l'objet traversait donc le ciel quand on tournait autour d'un système,
    // alors qu'il est censé y être accroché comme une étoile. Une direction,
    // elle, ne bouge pour personne — et c'est bien ce qu'on veut d'un objet
    // dont on ne peut de toute façon pas s'approcher.
    //
    // En haut, et non devant soi : les systèmes sont posés à plat, et ce qui se
    // produit à hauteur d'œil se dispute le regard avec eux. Une cinquantaine
    // de degrés au-dessus de l'horizon — assez haut pour qu'il domine, pas au
    // point qu'il faille se renverser.
    const cap = Math.random() * Math.PI * 2;
    directionTrou.set(Math.cos(cap) * 0.58, 0.81, Math.sin(cap) * 0.58).normalize();

    // Son disque est présenté presque par la tranche.
    //
    // C'est l'inclinaison qui fait la silhouette : vu de face, une couronne de
    // gaz n'est qu'une cible ; vu de biais, c'est l'objet qu'on reconnaît. Posé
    // là-haut et laissé à plat, il aurait justement été vu de dessous, donc de
    // face.
    //
    // La normale est donc le haut du monde ramené perpendiculaire à la
    // direction : le plan du disque contient alors l'horizontale de l'écran et
    // son ellipse y est couchée. Puis on la penche d'une quinzaine de degrés,
    // ce qui ouvre l'ellipse juste assez pour qu'on voie le dessus du disque.
    const normale = new THREE.Vector3(0, 1, 0);
    normale.addScaledVector(directionTrou, -normale.dot(directionTrou));
    if (normale.lengthSq() < 1e-6) normale.set(1, 0, 0);
    normale
      .normalize()
      .addScaledVector(directionTrou, Math.sin(0.2 + Math.random() * 0.2))
      .normalize();
    trouNoir.objet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normale);
    trouNoir.objet.visible = true;
    trouRestant = DUREE_TROU;
    annoncer('trouNoir');
  }

  function lancerVaisseau(camera: THREE.Camera): void {
    devantLaCamera(departVaisseau, camera, distance * 0.7, 0.75);
    devantLaCamera(finVaisseau, camera, distance * 0.7, 0.75);
    vaisseau.visible = true;
    vaisseauRestant = DUREE_VAISSEAU;
  }

  const position = geoVaisseau.attributes.position as THREE.BufferAttribute;

  /** Dernière caméra et dernier soleil reçus : un déclenchement manuel en a besoin. */
  let derniereCamera: THREE.Camera | null = null;
  const dernierSoleil = new THREE.Vector3();

  function update(
    dt: number,
    vivant: boolean,
    evenements: boolean,
    mouvementReduit: boolean,
    camera: THREE.Camera,
    soleil: THREE.Vector3,
  ): void {
    if (!vivant) {
      if (groupe.visible) {
        groupe.visible = false;
        trainee.visible = false;
        trouNoir.objet.visible = false;
        // Le ciel qu'on coupe emporte sa musique avec lui.
        arreterMusiqueEvenement();
        vaisseau.visible = false;
        nova.visible = false;
        comete.visible = false;
        cometeBleue.visible = false;
      }
      return;
    }
    groupe.visible = true;
    derniereCamera = camera;
    dernierSoleil.copy(soleil);
    temps += dt;

    // Le rideau enveloppe l'observateur, où qu'il soit.
    //
    // Son cylindre était posé au centre de la galaxie : en s'approchant d'un
    // système on en sortait, et le voile se voyait alors de l'extérieur, comme
    // un mur de brume posé en travers. Une aurore n'a pas de dehors — elle est
    // toujours autour de celui qui la regarde. Seul le rideau suit la caméra :
    // les événements, eux, portent déjà leur position dans le monde.
    rideau.position.copy(camera.position);
    matRideau.uniforms.uTemps.value = temps;

    // Mouvement réduit : le rideau reste, immobile et constant. Ce qui traverse
    // l'écran, en revanche, ne traverse plus.
    if (mouvementReduit) {
      matRideau.uniforms.uTemps.value = 0;
      matRideau.uniforms.uForce.value = FORCE_REPOS;
      return;
    }

    // ── Tempête ────────────────────────────────────────────────────────────
    if (evenements) prochaineTempete -= dt;
    if (evenements && prochaineTempete <= 0 && tempete <= 0) {
      tempete = DUREE_TEMPETE;
      prochaineTempete = 150 + Math.random() * 240;
    }
    if (tempete > 0) {
      tempete -= dt;

      // Une montée, un plateau, une retombée — et non une pointe.
      //
      // La forme en cloche atteignait son comble à la quinzième seconde et
      // redescendait aussitôt : l'embrasement ne durait qu'un instant, et il
      // fallait regarder au bon moment pour le voir. Le plateau laisse le temps
      // d'arriver, de tourner autour, et de le regarder s'éteindre.
      const ecoule = DUREE_TEMPETE - tempete;
      const avancement = Math.min(ecoule / 14, tempete / 22, 1);
      matRideau.uniforms.uForce.value = FORCE_REPOS + Math.max(0, avancement) * 0.55;
    } else {
      // Au repos, une respiration lente, à peine perceptible.
      matRideau.uniforms.uForce.value = FORCE_REPOS * (0.85 + 0.15 * Math.sin(temps * 0.18));
    }

    // ── Traînée ────────────────────────────────────────────────────────────
    if (trainéeRestante > 0) {
      trainéeRestante -= dt;
      const t = 1 - trainéeRestante / DUREE_TRAINEE;
      // Elle file toujours de son départ vers son arrivée ; mais c'est la
      // direction de cette course, et non la place qu'elle occupe, qu'on
      // reporte dans le ciel. L'orientation suit à chaque image : rapportée
      // près de l'œil, la chose tourne avec la tête.
      vraieTrainee.lerpVectors(departTrainee, finTrainee, t);
      poserDansLeCiel(trainee.position, vraieTrainee, camera);
      orienter(trainee, capApparent(capTrainee, courseTrainee, vraieTrainee, camera) ?? courseTrainee, camera);
      // S'allume net, s'éteint doucement.
      matTrainee.uniforms.uEclat.value = Math.max(0, Math.sin(Math.min(1, t) * Math.PI) ** 0.55);
      if (trainéeRestante <= 0) trainee.visible = false;
    } else {
      if (evenements) prochaineTrainee -= dt;
      if (prochaineTrainee <= 0) {
        lancerTrainee(camera);
        prochaineTrainee = 25 + Math.random() * 70;
      }
    }

    // ── Comète bleue ───────────────────────────────────────────────────────
    if (bleueRestante > 0) {
      bleueRestante -= dt;
      const t = 1 - bleueRestante / DUREE_BLEUE;

      // Sa vraie place dans la galaxie — celle qui décide de la direction où on
      // la voit, donc de son passage au-dessus des systèmes.
      vraieBleue.lerpVectors(departBleue, finBleue, t);

      // Mais elle se dessine à distance fixe de l'œil, dans cette direction-là.
      //
      // Posée à sa vraie place, elle sortait du tronc de vue dès qu'on s'en
      // éloignait de plus de vingt mille unités : le plan lointain de la caméra
      // la découpait, et elle disparaissait purement et simplement. Or c'est
      // justement de loin qu'on doit la voir passer. Rapportée sur une sphère
      // autour de l'observateur, elle garde sa direction, sa taille apparente,
      // et ne peut plus être coupée.
      // Posée près de l'œil, et non à la distance du ciel.
      //
      // Comme elle se dessine sur une sphère autour de nous, sa distance n'a
      // aucune conséquence sur ce qu'on voit : seule compte sa taille rapportée
      // à cette distance. Autant la prendre petite — à dix mille unités, sa
      // queue de vingt-huit mille dépassait le plan lointain de la caméra et se
      // faisait trancher net, ce qui lui taillait un biseau à bord droit.
      const direction = tmpDirection.subVectors(vraieBleue, camera.position).normalize();
      noyauBleu.position.copy(camera.position).addScaledVector(direction, RAYON_CIEL);
      teteBleue.copy(noyauBleu.position);

      const versCamera = RAYON_CIEL;
      // Démesurée, et c'est le propos : elle doit barrer le ciel.
      // Et sa queue tient tout entière devant le plan lointain.
      const longueur = versCamera * 1.5;
      // Le panache démarre sur le noyau, ni devant ni derrière.
      //
      // Son origine était avancée d'un cheveu pour que l'amorce tombe sous la
      // chevelure ; depuis que cette amorce est une calotte ronde, elle y tombe
      // d'elle-même, et ce décalage ne faisait plus que pousser une pointe
      // claire en avant de la tête — alors que cette lueur-là appartient à la
      // boule, c'est le gaz autour du noyau et pas la traîne.
      queueBleue.position.copy(noyauBleu.position);
      // Plus haut que large d'apparence : le rectangle est élargi d'autant que
      // la cloche a été resserrée, de sorte que le panache garde la même taille
      // à l'écran tout en gardant ses bords loin de ceux du rectangle.
      queueBleue.scale.set(longueur, longueur * 0.65, 1);
      orienter(queueBleue, arriereBleue, camera);

      // Une queue vue par la tranche n'est pas une queue.
      //
      // Du panache au halo, selon l'angle sous lequel on la prend.
      //
      // Le rectangle qui porte la queue pivote autour de son axe pour nous
      // présenter sa face ; quand cet axe tombe dans la direction du regard, il
      // n'a plus de face à présenter et se réduit à un trait en travers de la
      // chevelure. Il faut donc l'effacer — mais pas sans rien mettre à la
      // place : la queue n'a pas disparu, elle s'est rangée derrière la tête,
      // où elle fait un halo. Le même nombre commande les deux, l'un s'en va
      // comme l'autre arrive.
      //
      // Et il s'y prend à trente-cinq degrés de l'axe : au-delà, la perspective
      // écrase tellement la longueur du panache qu'il ne reste de lui qu'une
      // forme large et courte, sans direction — le halo dit mieux la même chose.
      // Plus tard, on voyait le rectangle ; plus tôt, on perdait la queue dès
      // qu'elle n'était plus exactement de profil.
      const versOeil = tmpDirection.subVectors(camera.position, noyauBleu.position).normalize();
      const alignement = Math.abs(arriereBleue.dot(versOeil));
      const parLeBout = THREE.MathUtils.smoothstep(alignement, 0.82, 0.985);
      matQueueBleue.uniforms.uFace.value = 1 - parLeBout;
      matNoyauBleu.uniforms.uBout.value = parLeBout;

      const bords = Math.sin(Math.min(1, t) * Math.PI) ** 0.3;
      // La tête atteint son plein éclat bien avant la queue : c'est elle
      // qu'on doit voir arriver.
      matNoyauBleu.uniforms.uEclat.value = Math.min(0.8, bords * 2.0);
      matQueueBleue.uniforms.uEclat.value = bords * 1.0;
      matNoyauBleu.uniforms.uTemps.value = temps;
      matQueueBleue.uniforms.uTemps.value = temps;
      if (bleueRestante <= 0) {
        cometeBleue.visible = false;
        arreterMusiqueEvenement();
      }
    } else {
      if (evenements) prochaineBleue -= dt;
      if (prochaineBleue <= 0) {
        lancerCometeBleue(camera, soleil);
        prochaineBleue = 1800 + Math.random() * 2400;
      }
    }

    // ── Supernova ──────────────────────────────────────────────────────────
    //
    // Sa place est rapportée à l'œil à chaque image, et pas seulement quand
    // elle s'allume : on doit pouvoir s'en aller à l'autre bout de la galaxie
    // et la voir encore briller dans le même coin de ciel. Le rémanent
    // compris, qui reste là jusqu'à la fin de la session.
    if (nova.visible) poserNova(camera);

    if (novaRestante > 0) {
      novaRestante -= dt;
      const ecoule = DUREE_NOVA - novaRestante;
      // Montée franche en huit secondes, puis déclin lent : c'est la courbe de
      // lumière d'une supernova, et c'est elle qui la rend reconnaissable.
      const eclat = ecoule < 8
        ? (ecoule / 8) ** 2
        : Math.max(0, 1 - (ecoule - 8) / (DUREE_NOVA - 8)) ** 1.6;
      matNova.uniforms.uEclat.value = eclat;
      // Elle enfle en s'allumant : au pic, elle occupe une bonne part du ciel.
      matNova.uniforms.uTaille.value = 60 + 260 * eclat;
      matNova.uniforms.uAge.value = Math.min(1, ecoule / DUREE_NOVA);
      // Le rémanent : ce qu'il en reste pour le reste de la session, de quoi
      // vérifier qu'on n'a pas rêvé.
      if (novaRestante <= 0) {
        arreterMusiqueEvenement();
        // Le rémanent : une lueur cuivrée, étalée, à l'endroit exact.
        matNova.uniforms.uEclat.value = 0.07;
        matNova.uniforms.uTaille.value = 70;
        matNova.uniforms.uAge.value = 1;
      }
    } else if (!novaFaite) {
      if (evenements) prochainTirageNova -= dt;
      if (prochainTirageNova <= 0) {
        prochainTirageNova = 60;
        if (Math.random() < 1 / 180) {
          devantLaCamera(positionNova, camera, distance * 0.9, 0.55);
          poserNova(camera);
          nova.visible = true;
          novaRestante = DUREE_NOVA;
          annoncer('supernova');
          void import('@tauri-apps/plugin-log').then((l) => l.info('[sonde] supernova allumée'));
          novaFaite = true;
        }
      }
    }

    // ── Comète ─────────────────────────────────────────────────────────────
    if (cometeRestante > 0) {
      cometeRestante -= dt;
      const t = 1 - cometeRestante / DUREE_COMETE;

      // Sa vraie course décide de la direction où on la voit et de ce qu'elle
      // vit — surtout de sa distance au soleil, qui fait toute la longueur de
      // sa queue. Ce qu'on dessine, lui, est rapporté à l'œil.
      vraieComete.lerpVectors(departComete, finComete, t);
      poserDansLeCiel(noyau.position, vraieComete, camera);
      queue.position.copy(noyau.position);

      const versCamera = RAYON_CIEL;
      const auSoleil = Math.max(1, vraieComete.distanceTo(soleil));

      // La queue traîne derrière la comète, et nulle part ailleurs.
      //
      // Dans le ciel, elle est poussée par le vent de l'étoile et pointe à
      // l'opposé du soleil, quoi que fasse la comète. C'est vrai, et c'est
      // laid : le panache part en biais, change de sens quand on tourne autour
      // du système, et se lit comme une erreur d'affichage. On garde donc de la
      // physique ce qui se voit bien — la queue s'allonge en approchant de
      // l'étoile — et on laisse le reste au manuel d'astronomie.
      //
      // Derrière la course telle qu'on la voit, et non telle qu'elle est :
      // rapportée près de l'œil, la comète ne traverse plus le ciel dans la
      // direction de sa course, mais dans celle qu'il en reste une fois ôté ce
      // qui vient vers nous.
      const cap = capApparent(capComete, courseComete, vraieComete, camera);
      const fuite = cap ? cap.multiplyScalar(-1) : arriereComete;

      // Plus elle approche du soleil, plus la glace s'évapore et plus la queue
      // s'allonge. La longueur est rapportée à la distance de l'œil pour qu'elle
      // garde une taille lisible à l'écran, et bornée pour ne jamais devenir un
      // voile dans lequel on se trouverait.
      const chauffe = THREE.MathUtils.clamp((distance * 0.35) / auSoleil, 0.4, 2.2);
      // Bornée en parts du ciel, et non de la galaxie : la queue garde la même
      // taille à l'écran où qu'on soit, et ne devient jamais le voile dans
      // lequel on se trouverait.
      const longueur = THREE.MathUtils.clamp(
        versCamera * 0.3 * chauffe,
        RAYON_CIEL * 0.1,
        RAYON_CIEL * 0.8,
      );
      queue.scale.set(longueur, longueur * 0.45, 1);

      // Le rectangle s'étend vers +X depuis le noyau : on pose donc +X sur la
      // fuite, et sa face vers l'œil — sans quoi on le verrait par la tranche.
      orienter(queue, fuite, camera);

      const bords = Math.sin(Math.min(1, t) * Math.PI);
      matNoyau.uniforms.uEclat.value = bords;
      matQueue.uniforms.uEclat.value = bords;
      if (cometeRestante <= 0) comete.visible = false;
    } else {
      if (evenements) prochaineComete -= dt;
      if (prochaineComete <= 0) {
        lancerComete(camera, soleil);
        prochaineComete = 360 + Math.random() * 540;
      }
    }

    // ── Trou noir ──────────────────────────────────────────────────────────
    if (trouRestant > 0) {
      trouRestant -= dt;
      const ecoule = DUREE_TROU - trouRestant;
      // Il paraît lentement et s'en va de même : rien d'aussi gros ne doit
      // s'allumer d'un coup. Ce nombre n'est qu'une enveloppe — `trouNoir.ts`
      // en tire des heures différentes pour chacune de ses pièces.
      const eclat = Math.min(
        Math.min(1, ecoule / FONDU_TROU),
        Math.min(1, trouRestant / SORTIE_TROU) ** 0.6,
      );
      // Accroché au ciel : toujours la même direction, à la distance du ciel.
      // Il ne suit pas l'œil, il ne s'en éloigne pas — il est là, en haut, et
      // n'en bouge pas. Et il n'est jamais tourné vers nous : c'est un volume,
      // et son orientation appartient au monde.
      trouNoir.objet.position
        .copy(camera.position)
        .addScaledVector(directionTrou, RAYON_CIEL);
      trouNoir.regler(Math.max(0, eclat), temps, camera);
      if (trouRestant <= 0) {
        trouNoir.objet.visible = false;
        arreterMusiqueEvenement();
      }
    } else if (!trouFait) {
      if (evenements) prochainTirageTrou -= dt;
      if (prochainTirageTrou <= 0) {
        prochainTirageTrou = 60;
        // Une chance sur deux mille par minute : de l'ordre d'une fois toutes
        // les trente heures passées devant la galaxie. La plupart des sessions
        // n'en verront aucun, et c'est ce qui en fait un événement.
        if (Math.random() < 1 / 2000) {
          lancerTrouNoir();
          trouFait = true;
        }
      }
    }

    // ── Passage ────────────────────────────────────────────────────────────
    if (vaisseauRestant > 0) {
      vaisseauRestant -= dt;
      const t = 1 - vaisseauRestant / DUREE_VAISSEAU;
      vraieVaisseau.lerpVectors(departVaisseau, finVaisseau, t);
      poserDansLeCiel(placeVaisseau, vraieVaisseau, camera);
      position.setXYZ(0, placeVaisseau.x, placeVaisseau.y, placeVaisseau.z);
      position.needsUpdate = true;
      // Clignotement lent, et extinction aux deux bouts de la course pour
      // qu'il n'apparaisse ni ne disparaisse d'un coup.
      const bords = Math.sin(t * Math.PI);
      matVaisseau.uniforms.uEclat.value = bords * (0.5 + 0.5 * Math.sin(temps * 2.4));
      if (vaisseauRestant <= 0) vaisseau.visible = false;
    } else {
      if (evenements) prochainVaisseau -= dt;
      if (prochainVaisseau <= 0) {
        lancerVaisseau(camera);
        prochainVaisseau = 260 + Math.random() * 420;
      }
    }
  }

  /** Force un événement, comme si son heure était venue. */
  function declencher(evenement: EvenementCiel): THREE.Vector3 | null {
    const camera = derniereCamera;
    if (!camera) return null;
    groupe.visible = true;

    if (evenement === 'trainee') {
      lancerTrainee(camera);
      // Le milieu de la course : au bout d'une seconde, c'est là qu'elle sera.
      return departTrainee.clone().lerp(finTrainee, 0.5);
    }
    if (evenement === 'comete') {
      lancerComete(camera, dernierSoleil);
      return departComete.clone().lerp(finComete, 0.35);
    }
    if (evenement === 'vaisseau') {
      lancerVaisseau(camera);
      return departVaisseau.clone().lerp(finVaisseau, 0.4);
    }
    if (evenement === 'tempete') {
      tempete = DUREE_TEMPETE;

      // Le rideau occupe un arc du ciel : on vise son milieu, un peu au-dessus
      // du niveau de l'œil, là où ses plis sont les plus lumineux.
      //
      // L'angle se compte comme Three.js dispose les sommets d'un cylindre :
      // le sinus sur X et le cosinus sur Z. Pris à l'envers, la visée tombait
      // à quatre-vingt-dix degrés du rideau — c'est-à-dire sur le vide.
      const milieu = -Math.PI * 0.25 + Math.PI * 0.33;
      return new THREE.Vector3(
        Math.sin(milieu) * RAYON_RIDEAU,
        RAYON_RIDEAU * 0.09,
        Math.cos(milieu) * RAYON_RIDEAU,
      ).add(camera.position);
    }
    if (evenement === 'cometeBleue') {
      lancerCometeBleue(camera, dernierSoleil);
      return departBleue.clone().lerp(finBleue, 0.25);
    }
    if (evenement === 'trouNoir') {
      lancerTrouNoir();
      return camera.position.clone().addScaledVector(directionTrou, RAYON_CIEL);
    }
    if (evenement === 'supernova') {
      devantLaCamera(positionNova, camera, distance * 0.9, 0.35);
      poserNova(camera);
      nova.visible = true;
      novaRestante = DUREE_NOVA;
      annoncer('supernova');
      return positionNova.clone();
    }
    return null;
  }

  return {
    objet: groupe,
    update,
    declencher,
    teteCometeBleue: () => (bleueRestante > 0 ? teteBleue : null),
    dispose() {
      geoRideau.dispose();
      matRideau.dispose();
      geoTrainee.dispose();
      matTrainee.dispose();
      geoNoyauBleu.dispose();
      matNoyauBleu.dispose();
      geoQueueBleue.dispose();
      matQueueBleue.dispose();
      geoNova.dispose();
      matNova.dispose();
      geoNoyau.dispose();
      matNoyau.dispose();
      geoQueue.dispose();
      matQueue.dispose();
      geoVaisseau.dispose();
      matVaisseau.dispose();
      trouNoir.dispose();
      arreterMusiqueEvenement();
    },
  };
}
