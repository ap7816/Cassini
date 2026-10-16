import { describe, it, expect } from 'vitest';
import { composerTrajet, degagement, plongee, pointDuTrajet, type Point } from './flightPath';

/**
 * Le voyage d'un système à l'autre.
 *
 * Le défaut qu'on fige ici était le pire des trois reprochés à la caméra : la
 * position suivait un arc qui montait haut au-dessus du disque, pendant que le
 * regard allait tout droit d'un centre à l'autre sans jamais s'élever. À
 * mi-parcours, la caméra surplombait une cible restée en bas, presque à sa
 * verticale — elle regardait le sol, et l'on traversait la galaxie en
 * contemplant le vide.
 *
 * D'où la mesure qui compte ici : de combien le regard plonge sous l'horizon,
 * tout au long du trajet.
 */

/** Une galaxie d'essai : deux systèmes opposés, vus de trois quarts. */
const RAYON = 1000;
const CENTRE_A: Point = { x: -600, y: 0, z: 0 };
const CENTRE_B: Point = { x: 600, y: 0, z: 120 };
/** Les poses de caméra : en retrait et au-dessus de chaque centre. */
const POSE_A: Point = { x: -600, y: 120, z: 200 };
const POSE_B: Point = { x: 600, y: 120, z: 320 };

function trajet() {
  return composerTrajet(POSE_A, POSE_B, RAYON, CENTRE_A, CENTRE_B);
}

describe('le trajet entre deux systèmes', () => {
  it('garde pendant tout le trajet l’inclinaison du cadrage', () => {
    const t = trajet();
    const angles: number[] = [];
    for (let i = 0; i <= 40; i++) {
      angles.push(plongee(POSE_A, t.controle, POSE_B, CENTRE_A, t.controleRegard, CENTRE_B, i / 40));
    }

    // L'inclinaison des deux bouts : la caméra y est posée en retrait et au-
    // dessus du centre, et c'est l'angle sous lequel on regarde un système.
    const auxBouts = angles[0];
    expect(auxBouts).toBeGreaterThan(25);

    // La mesure qui compte : le trajet ne doit pas introduire une plongée plus
    // raide que celle du cadrage lui-même. Sans l'arc du regard, le milieu du
    // voyage atteignait 63° — on traversait la galaxie en regardant le sol.
    expect(Math.max(...angles)).toBeLessThan(auxBouts + 6);
    expect(Math.min(...angles)).toBeGreaterThan(auxBouts - 8);
  });

  it('regarde devant lui, et non ses pieds, au sommet de l’arc', () => {
    const t = trajet();
    const oeil = pointDuTrajet(POSE_A, t.controle, POSE_B, 0.5);
    const vise = pointDuTrajet(CENTRE_A, t.controleRegard, CENTRE_B, 0.5);
    // Le regard a plus avancé que la caméra : il est déjà tourné vers
    // l'arrivée quand elle n'est qu'à la moitié du chemin.
    const avanceCamera = (oeil.x - POSE_A.x) / (POSE_B.x - POSE_A.x);
    const avanceRegard = (vise.x - CENTRE_A.x) / (CENTRE_B.x - CENTRE_A.x);
    expect(avanceRegard).toBeGreaterThan(avanceCamera + 0.05);
  });

  it('prend de la hauteur, sinon le voyage ne se voit pas', () => {
    const t = trajet();
    const sommet = pointDuTrajet(POSE_A, t.controle, POSE_B, 0.5);
    expect(sommet.y).toBeGreaterThan(Math.max(POSE_A.y, POSE_B.y) * 1.5);
  });

  it('part et arrive exactement où il faut', () => {
    const t = trajet();
    for (const [p, attendu] of [[0, POSE_A], [1, POSE_B]] as const) {
      const got = pointDuTrajet(POSE_A, t.controle, POSE_B, p);
      expect(got.x).toBeCloseTo(attendu.x, 6);
      expect(got.y).toBeCloseTo(attendu.y, 6);
      expect(got.z).toBeCloseTo(attendu.z, 6);
    }
    const debut = pointDuTrajet(CENTRE_A, t.controleRegard, CENTRE_B, 0);
    const fin = pointDuTrajet(CENTRE_A, t.controleRegard, CENTRE_B, 1);
    expect(debut.x).toBeCloseTo(CENTRE_A.x, 6);
    expect(fin.x).toBeCloseTo(CENTRE_B.x, 6);
  });

  it('dure plus longtemps quand c’est plus loin, dans ses bornes', () => {
    const court = composerTrajet(POSE_A, { x: -400, y: 120, z: 200 }, RAYON, CENTRE_A, CENTRE_B);
    const long = composerTrajet(POSE_A, { x: 4000, y: 120, z: 200 }, RAYON, CENTRE_A, CENTRE_B);
    expect(court.duree).toBeLessThan(long.duree);
    expect(court.duree).toBeGreaterThan(1);
    expect(long.duree).toBeLessThan(8);
  });

  /**
   * L'arc avait été introduit pour ne pas traverser les soleils. On le vérifie
   * ici : le commentaire l'affirmait depuis des mois sans qu'aucun test ne le
   * tienne.
   */
  it('ne traverse pas le soleil posé au milieu du chemin', () => {
    const t = trajet();
    const soleil = { centre: { x: 0, y: 0, z: 60 }, rayon: 120 };
    expect(degagement(POSE_A, t.controle, POSE_B, soleil)).toBeGreaterThan(1);
  });
});
