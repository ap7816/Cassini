import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createTrouNoir } from './trouNoir';

function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 1.6, 1, 20000);
  c.position.set(0, 200, 1200);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
}

/** Le dernier d'une liste — `at` n'existe pas dans la cible de compilation. */
function dernier<T>(liste: T[]): T {
  return liste[liste.length - 1];
}

/** Suit l'événement seconde par seconde et retient ce qu'il a fait. */
function derouler(pas = 0.1, duree = 32) {
  const trou = createTrouNoir(2000);
  trou.declencher(camera());
  const releves: Array<{ t: number; force: number; ecran: number; actif: boolean }> = [];
  for (let t = 0; t < duree; t += pas) {
    trou.update(pas);
    const e = trou.etat();
    releves.push({ t: t + pas, force: e.force, ecran: e.ecran, actif: e.actif });
  }
  return releves;
}

describe('le trou noir', () => {
  it('ne se produit qu’une fois, et pas avant vingt minutes', () => {
    const trou = createTrouNoir(2000);
    // Dix-neuf minutes : rien ne peut encore arriver.
    expect(trou.peutSurvenir(19 * 60)).toBe(false);
    expect(trou.etat().actif).toBe(false);
  });

  it('aspire dès le premier instant, et de plus en plus vite', () => {
    const releves = derouler();

    // Dès qu'il paraît, l'image bouge — il n'y a pas un avant et un après.
    expect(releves[0].ecran).toBeGreaterThan(0);

    // Mais le gros reste à faire au tiers du temps : c'est la fin qui emporte.
    const tiers = releves.find((r) => r.t >= 5)!;
    expect(tiers.ecran).toBeLessThan(0.25);

    // Chaque seconde prend plus que la précédente.
    const a = releves.find((r) => r.t >= 5)!.ecran - releves.find((r) => r.t >= 4)!.ecran;
    const b = releves.find((r) => r.t >= 9)!.ecran - releves.find((r) => r.t >= 8)!.ecran;
    const c = releves.find((r) => r.t >= 14)!.ecran - releves.find((r) => r.t >= 13)!.ecran;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);

    // Et la courbure du ciel, elle, est installée bien avant la fin.
    expect(releves.find((r) => r.t >= 8)!.force).toBeCloseTo(1, 1);

    // L'aspiration va jusqu'au bout.
    expect(Math.max(...releves.map((r) => r.ecran))).toBeCloseTo(1, 2);
  });

  it('tient le noir le temps qu’on le voie', () => {
    const releves = derouler(0.05);
    const noir = releves.filter((r) => r.ecran >= 1);
    // Un battement, pas un clignement : sans lui, l'écran touchait le fond et
    // repartait dans la même image.
    expect(noir.length * 0.05).toBeGreaterThan(0.5);
    // Et pas une seconde de plus : c'est une farce, pas une coupure.
    expect(noir.length * 0.05).toBeLessThan(1.2);
  });

  it('rend tout, et s’arrête', () => {
    const releves = derouler();
    const fin = dernier(releves);
    expect(fin.actif).toBe(false);
    expect(fin.ecran).toBe(0);
    expect(fin.force).toBe(0);

    // Et sans traîner : une quinzaine de secondes en tout.
    const dernierActif = dernier(releves.filter((r) => r.actif));
    expect(dernierActif.t).toBeGreaterThan(15);
    expect(dernierActif.t).toBeLessThan(18);
  });

  it('la détente est plus brève que la chute : c’est ce qui fait la blague', () => {
    const releves = derouler();
    const comble = releves.reduce((a, b) => (b.ecran > a.ecran ? b : a));
    const chute = releves.filter((r) => r.ecran > 0 && r.t < comble.t).length;
    const detente = releves.filter((r) => r.ecran > 0 && r.t > comble.t).length;
    expect(detente).toBeLessThan(chute);
  });

  it('se place devant l’œil', () => {
    const trou = createTrouNoir(2000);
    const cam = camera();
    const endroit = trou.declencher(cam);
    expect(endroit).not.toBeNull();

    const avant = new THREE.Vector3();
    cam.getWorldDirection(avant);
    const vers = endroit!.clone().sub(cam.position);
    expect(vers.clone().normalize().dot(avant)).toBeCloseTo(1, 5);

    // Et une deuxième demande pendant qu'il est là ne le replace pas.
    expect(trou.declencher(cam)).toBeNull();
  });
});
