import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Seuil de luminosité au-delà duquel un pixel déborde.
 *
 * Réglé au-dessus des étoiles du champ, qui rendent autour de 0,72 une fois
 * leur opacité appliquée. À 0,55 chacune des cinq mille se transformait en
 * pastille floue et le fond de nébuleuse se mettait à luire : la scène perdait
 * ses contrastes au lieu d'en gagner. Seuls le soleil, les portails et les
 * jaquettes les plus claires doivent déborder.
 */
const BLOOM_THRESHOLD = 0.85;
/** Intensité du débordement, et étalement de son halo. */
const BLOOM_STRENGTH = 0.45;
const BLOOM_RADIUS = 0.4;

/**
 * Le flou est calculé à la moitié de la résolution.
 *
 * Un débordement lumineux est par nature une image très basse fréquence : le
 * calculer à pleine résolution quadruple le coût de remplissage pour une
 * différence invisible. C'est le réglage qui décide si le post-traitement
 * passe ou non sur circuit graphique intégré.
 */
const BLOOM_SCALE = 0.5;

export type Postprocess = {
  render: () => void;
  setSize: (w: number, h: number) => void;
  dispose: () => void;
};

/**
 * Chaîne de post-traitement : débordement lumineux puis courbe de rendu.
 *
 * `OutputPass` applique le tone mapping et la conversion d'espace colorimétrique
 * en fin de chaîne. Sans lui, ces deux étapes se feraient dans la passe de
 * rendu, donc **avant** le flou : les hautes lumières seraient déjà écrasées
 * quand le débordement les échantillonne, et il n'aurait presque rien à faire.
 */
export function createPostprocess(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): Postprocess {
  // ACES filmique : compresse les hautes lumières au lieu de les écrêter, ce
  // qui évite les aplats blancs sur le soleil et donne au débordement de quoi
  // se dégrader progressivement.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width * BLOOM_SCALE, height * BLOOM_SCALE),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function setSize(w: number, h: number) {
    composer.setSize(w, h);
    // Après `composer.setSize`, qui vient de remettre toutes les passes à la
    // pleine résolution — y compris celle-ci.
    bloom.setSize(w * BLOOM_SCALE, h * BLOOM_SCALE);
  }

  setSize(width, height);

  return {
    render: () => composer.render(),
    setSize,
    dispose() {
      bloom.dispose();
      composer.dispose();
      renderer.toneMapping = THREE.NoToneMapping;
    },
  };
}
