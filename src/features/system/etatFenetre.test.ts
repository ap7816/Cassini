import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _reinitialiserEtatFenetre,
  fenetreEnArrierePlan,
  noterEtat,
  surEtatFenetre,
} from './etatFenetre';

/**
 * Ce que dit l'application de l'état de sa fenêtre.
 *
 * Le comportement vérifié ici n'est pas cosmétique : c'est lui qui coupe la
 * musique d'ambiance quand la fenêtre quitte l'écran. Le défaut d'origine tenait
 * à une seule source de vérité — l'état natif « pas réduite » d'une fenêtre
 * repliée dans la zone de notification relançait l'ambiance aussitôt après que
 * la visibilité l'eut coupée.
 */
beforeEach(() => _reinitialiserEtatFenetre());

describe('état de la fenêtre', () => {
  it('est masquée dès qu’une source le dit', () => {
    noterEtat('navigateur', true);
    expect(fenetreEnArrierePlan()).toBe(true);
  });

  it('reste masquée tant qu’une source le maintient', () => {
    noterEtat('navigateur', true);
    noterEtat('natif', false);
    // Cas particulier : le natif voit la fenêtre, son avis lève celui du moteur.
    expect(fenetreEnArrierePlan()).toBe(false);

    noterEtat('natif', true);
    noterEtat('navigateur', false);
    expect(fenetreEnArrierePlan()).toBe(true);
  });

  it('ne prévient qu’au changement de verdict', () => {
    const vu = vi.fn();
    surEtatFenetre(vu);
    expect(vu).toHaveBeenCalledWith(false);
    vu.mockClear();

    noterEtat('navigateur', true);
    noterEtat('navigateur', true);
    noterEtat('natif', true);
    expect(vu).toHaveBeenCalledTimes(1);
    expect(vu).toHaveBeenCalledWith(true);

    noterEtat('navigateur', false);
    expect(vu).toHaveBeenCalledTimes(1);
    noterEtat('natif', false);
    expect(vu).toHaveBeenCalledTimes(2);
    expect(vu).toHaveBeenLastCalledWith(false);
  });

  it('annonce l’état courant à l’abonnement, et se désabonne', () => {
    noterEtat('natif', true);
    const vu = vi.fn();
    const stop = surEtatFenetre(vu);
    expect(vu).toHaveBeenCalledWith(true);

    stop();
    noterEtat('natif', false);
    expect(vu).toHaveBeenCalledTimes(1);
  });

  /**
   * Le focus est la voix qui manquait : une fenêtre recouverte par une autre
   * application n'est ni réduite ni occultée, elle n'est simplement plus
   * devant. Et le natif, qui a le dernier mot sur ce que le moteur web croit
   * voir, ne l'a pas sur le focus — qu'il ne connaît pas.
   */
  it('le focus perdu met la fenêtre en arrière-plan, même sans être masquée', () => {
    noterEtat('focus', true);
    expect(fenetreEnArrierePlan()).toBe(true);

    // Le natif a beau affirmer la fenêtre visible, elle reste derrière.
    noterEtat('natif', false);
    expect(fenetreEnArrierePlan()).toBe(true);

    noterEtat('focus', false);
    expect(fenetreEnArrierePlan()).toBe(false);
  });

  it('prévient à chaque passage, et une seule fois par passage', () => {
    const vus: boolean[] = [];
    surEtatFenetre((arriere) => vus.push(arriere));

    noterEtat('focus', true);
    noterEtat('navigateur', true); // déjà en arrière-plan : rien à annoncer
    noterEtat('navigateur', false);
    noterEtat('focus', false);

    expect(vus).toEqual([false, true, false]);
  });
});
