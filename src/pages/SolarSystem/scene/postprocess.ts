import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { lireReglages } from '../../../features/debug/tuning';

// Seuil, intensité et étalement du débordement viennent des réglages, où leur
// valeur par défaut est justifiée (voir `features/debug/tuning.ts`).

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
  /** Reprend les réglages de lumière du moment : débordement et exposition. */
  regler: () => void;
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
  const reglages = lireReglages();

  // ACES filmique : compresse les hautes lumières au lieu de les écrêter, ce
  // qui évite les aplats blancs sur le soleil et donne au débordement de quoi
  // se dégrader progressivement.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = reglages.exposition;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width * BLOOM_SCALE, height * BLOOM_SCALE),
    reglages.bloomForce,
    reglages.bloomRayon,
    reglages.bloomSeuil,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function setSize(w: number, h: number) {
    composer.setSize(w, h);
    // Après `composer.setSize`, qui vient de remettre toutes les passes à la
    // pleine résolution — y compris celle-ci.
    bloom.setSize(w * BLOOM_SCALE, h * BLOOM_SCALE);
  }

  function regler() {
    const r = lireReglages();
    bloom.strength = r.bloomForce;
    bloom.radius = r.bloomRayon;
    bloom.threshold = r.bloomSeuil;
    renderer.toneMappingExposure = r.exposition;
  }

  setSize(width, height);

  return {
    render: () => composer.render(),
    setSize,
    regler,
    dispose() {
      bloom.dispose();
      composer.dispose();
      renderer.toneMapping = THREE.NoToneMapping;
    },
  };
}
