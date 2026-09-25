import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _reinitialiserEtatFenetre,
  fenetreMasquee,
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
    expect(fenetreMasquee()).toBe(true);
  });

  it('reste masquée tant qu’une source le maintient', () => {
    noterEtat('navigateur', true);
    noterEtat('natif', false);
    // Cas particulier : le natif voit la fenêtre, son avis lève celui du moteur.
    expect(fenetreMasquee()).toBe(false);

    noterEtat('natif', true);
    noterEtat('navigateur', false);
    expect(fenetreMasquee()).toBe(true);
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
});
