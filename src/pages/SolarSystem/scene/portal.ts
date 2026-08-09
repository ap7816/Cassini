import * as THREE from 'three';
import { hashStr, seededRng } from '../lib/random';
import { makePortalTexture } from '../textures/portal';

/** Une destination atteignable depuis le système courant. */
export type PortalTarget = {
  platform: string;
  color: number;
};

export type PortalEntry = {
  platform: string;
  color: number;
  /** Cible du pointeur — bien plus large que le cœur, qui est minuscule. */
  hit: THREE.Mesh;
  /** Position monde, pour y accrocher un label et y diriger la caméra. */
  position: THREE.Vector3;
};

export type Portals = {
  group: THREE.Group;
  entries: PortalEntry[];
  byHit: Map<THREE.Object3D, PortalEntry>;
  update: (t: number, dt: number, camera: THREE.Camera) => void;
  dispose: () => void;
};

/**
 * Rayon de l'anneau de portails, en fractions du rayon des orbites.
 *
 * Nettement au-delà de la ceinture d'astéroïdes (1,34) : les portails sont des
 * sorties du système, pas des objets en orbite, et doivent se lire comme tels.
 */
export const PORTAL_RING = 2.5;

/**
 * Arc sur lequel les portails sont répartis, en radians.
 *
 * Volontairement pas un tour complet, et décalé vers l'arrière-gauche :
 *
 *  - l'angle 0 pointe vers la droite de l'écran, où se trouve la colonne des
 *    jeux ; un portail placé là serait caché tant que la liste est dépliée ;
 *  - la caméra regarde le système d'en haut et de face, donc les positions
 *    situées **vers elle** (+Z) se projettent tout en bas et sortent du cadre.
 *    Mesuré à −1,39 en coordonnées normalisées, soit largement hors écran.
 *
 * Centrer l'arc entre −X et −Z place les portails dans la moitié haute-gauche,
 * dégagée dans tous les cadrages testés.
 */
const ARC_CENTRE = Math.PI * 1.25;
const ARC_SPAN = Math.PI * 0.66;

/**
 * Désordre appliqué au placement — sans lui les portails s'alignent sur un arc
 * parfait, ce qui trahit la grille et ne ressemble pas à l'espace.
 *
 * Chaque amplitude est bornée, et ces bornes sont exploitées ailleurs :
 * `JITTER_R` élargit le cadrage pour qu'un portail tiré vers l'extérieur reste
 * visible, et `JITTER_ANGLE` resserre la contrainte d'écartement, deux voisins
 * pouvant désormais se rapprocher l'un de l'autre.
 */
const JITTER_R = 0.16;
const JITTER_ANGLE = 0.22;
/**
 * Dispersion hors du plan des orbites, en fractions du rayon de l'anneau.
 *
 * De loin la plus importante des trois. L'arc est plan : le désordre en angle
 * et en rayon ne fait que le déformer, il se projette toujours en ligne à
 * l'écran. Seule la hauteur casse l'alignement — et rien ne retient un portail
 * sur l'écliptique, il n'appartient pas au système.
 */
const JITTER_Y = 0.3;

/**
 * Facteur d'élargissement du cadrage, pour le portail le plus éloigné du
 * centre — combinaison du décalage radial et de la hauteur, d'où l'hypoténuse.
 */
export const PORTAL_SPREAD = Math.hypot(1 + JITTER_R, JITTER_Y);

/** Écart angulaire nominal entre deux portails voisins. */
function arcStep(count: number): number {
  return count > 1 ? ARC_SPAN / (count - 1) : ARC_SPAN * 0.5;
}

/**
 * Rayon d'un portail.
 *
 * Strictement proportionnel au système, sans plafond : la caméra cadre
 * toujours l'ensemble, donc une taille absolue verrait sa taille apparente
 * fondre à mesure que la bibliothèque grandit — mesuré à 2,4 px de rayon pour
 * 80 jeux, soit invisible et impossible à viser. Le plancher ne sert qu'aux
 * systèmes d'une seule planète, où `outerR` est minuscule.
 *
 * La fraction est délibérément faible : un portail est une sortie lointaine,
 * pas un astre du système. À 0,13 son halo couvrait la moitié de l'orbite
 * externe et il rivalisait visuellement avec le soleil.
 */
export function portalRadius(outerR: number): number {
  return Math.max(outerR * 0.142, 10);
}

/**
 * Rayon de l'anneau sur lequel les portails sont posés.
 *
 * Écarté au besoin pour qu'ils ne se chevauchent jamais : sur un système
 * d'une seule planète, où le plancher de taille s'applique, six portails
 * répartis sur l'arc nominal se touchaient. On impose une corde d'au moins
 * trois rayons entre voisins.
 */
export function portalRingRadius(outerR: number, count: number): number {
  const base = outerR * PORTAL_RING;
  if (count < 2) return base;

  // Pire cas et non cas nominal : le désordre peut rapprocher deux voisins de
  // `2 · JITTER_ANGLE` et les ramener tous deux sur le rayon le plus court.
  //
  // La dispersion verticale est délibérément ignorée : elle écarte les
  // portails la plupart du temps, mais rien n'empêche deux voisins de tirer
  // la même hauteur. S'y fier reviendrait à parier sur le tirage.
  const ecartMini = arcStep(count) * (1 - 2 * JITTER_ANGLE);
  const mini =
    (1.5 * portalRadius(outerR)) / ((1 - JITTER_R) * Math.sin(ecartMini / 2));
  return Math.max(base, mini);
}

/**
 * Portails de phase : un par système voisin, chacun teinté de la couleur de sa
 * destination.
 *
 * La teinte n'est pas décorative — c'est, avec le label, ce qui annonce où
 * mène chaque portail.
 */
export function createPortals(outerR: number, targets: PortalTarget[]): Portals {
  const group = new THREE.Group();
  const entries: PortalEntry[] = [];
  const byHit = new Map<THREE.Object3D, PortalEntry>();
  const halos: THREE.Mesh[] = [];
  const jetables: { dispose: () => void }[] = [];

  const R = portalRadius(outerR);
  const ringR = portalRingRadius(outerR, targets.length);

  targets.forEach((cible, i) => {
    const teinte = new THREE.Color(cible.color);
    const tex = makePortalTexture(teinte);
    jetables.push(tex);

    const portail = new THREE.Group();

    // Halo : un plan orienté vers la caméra à chaque frame. Un disque fixe
    // disparaîtrait dès qu'on le regarde par la tranche, ce qui arrive
    // constamment puisque les portails ceinturent le système.
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(R * 4, R * 4),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    portail.add(halo);
    halos.push(halo);
    jetables.push(halo.geometry, halo.material as THREE.Material);

    // Cœur sombre, devant le halo. Il n'est pas noir mais très légèrement
    // teinté : du noir pur sur fond noir ne se lirait pas comme un volume.
    const coeur = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.52, 24, 24),
      new THREE.MeshBasicMaterial({ color: teinte.clone().multiplyScalar(0.06) }),
    );
    portail.add(coeur);
    jetables.push(coeur.geometry, coeur.material as THREE.Material);

    // Cible de pointage invisible, franchement plus large que l'anneau
    // lumineux : celui-ci est volontairement discret et lointain, viser son
    // trait exact serait pénible — mesuré à 11 px de rayon sur une petite
    // fenêtre. Le cœur seul serait pire, et le halo n'est qu'un plan orienté,
    // donc instable au raycast.
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(R * 2.2, 12, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    portail.add(hit);
    jetables.push(hit.geometry, hit.material as THREE.Material);

    // Réparti sur l'arc, puis dérangé.
    //
    // Le tirage est semé sur le nom de la plateforme, jamais sur l'index : un
    // launcher retrouve ainsi toujours la même place, alors qu'un tirage libre
    // le ferait sauter à chaque reconstruction de la scène — et elle est
    // reconstruite à chaque changement de système.
    const rng = seededRng(hashStr(cible.platform));
    const t = targets.length === 1 ? 0.5 : i / (targets.length - 1);

    const angle =
      ARC_CENTRE - ARC_SPAN / 2 + t * ARC_SPAN
      + (rng() - 0.5) * 2 * JITTER_ANGLE * arcStep(targets.length);
    const rayon = ringR * (1 + (rng() - 0.5) * 2 * JITTER_R);
    // Rapportée au rayon de l'anneau et non à celui des orbites : c'est
    // l'échelle à laquelle les portails sont vus, et donc celle à laquelle la
    // dispersion se remarque.
    const y = ringR * (rng() - 0.5) * 2 * JITTER_Y;

    portail.position.set(Math.cos(angle) * rayon, y, Math.sin(angle) * rayon);

    group.add(portail);

    const entry: PortalEntry = {
      platform: cible.platform,
      color: cible.color,
      hit,
      position: portail.position.clone(),
    };
    entries.push(entry);
    byHit.set(hit, entry);
  });

  return {
    group,
    entries,
    byHit,
    update(t, _dt, camera) {
      for (let i = 0; i < halos.length; i++) {
        const h = halos[i];
        h.quaternion.copy(camera.quaternion);
        // Respirations désaccordées : en phase, la rangée de portails
        // clignoterait d'un seul bloc.
        h.scale.setScalar(1 + Math.sin(t * 0.0011 + i * 1.7) * 0.05);
      }
    },
    dispose() {
      for (const d of jetables) d.dispose();
    },
  };
}
