import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SUCCES,
  abonnerSucces,
  decrocherSucces,
  estDecroche,
  reinitialiserSucces,
  succesDecroches,
} from './succes';
import { readSucces } from '../../services/storage';

/**
 * Le module est appelé à chaque image par la scène, et doit donc être capable
 * de l'être : décrocher deux fois le même succès n'écrit rien, ne prévient
 * personne et ne rend pas vrai. C'est cette garantie qui permet à `ciel.ts` de
 * signaler bêtement ce qu'il montre, sans retenir ce qu'il a déjà signalé.
 */
describe('les succès', () => {
  beforeEach(() => {
    reinitialiserSucces();
  });

  it('ne rend vrai que la première fois', () => {
    expect(decrocherSucces('trainee')).toBe(true);
    expect(decrocherSucces('trainee')).toBe(false);
    expect(decrocherSucces('trainee')).toBe(false);
  });

  it('prévient une fois, et une seule', () => {
    const vus: string[] = [];
    const retirer = abonnerSucces((cle) => vus.push(cle));

    decrocherSucces('comete');
    decrocherSucces('comete');
    decrocherSucces('trouNoir');
    retirer();
    decrocherSucces('supernova');

    expect(vus).toEqual(['comete', 'trouNoir']);
  });

  it('les range dans l’ordre de la liste, et non dans celui où ils tombent', () => {
    decrocherSucces('trouNoir');
    decrocherSucces('trainee');
    decrocherSucces('comete');
    expect(succesDecroches()).toEqual(['trainee', 'comete', 'trouNoir']);
  });

  it('les écrit, pour qu’ils survivent à la session', () => {
    decrocherSucces('tempete');
    decrocherSucces('vaisseau');
    expect(readSucces()).toEqual(['tempete', 'vaisseau']);
  });

  it('la remise à zéro les oublie tous, stockage compris', () => {
    SUCCES.forEach(decrocherSucces);
    expect(succesDecroches()).toHaveLength(SUCCES.length);

    reinitialiserSucces();

    expect(succesDecroches()).toEqual([]);
    expect(readSucces()).toEqual([]);
    expect(estDecroche('trouNoir')).toBe(false);
    // Et on peut les redécrocher : c'est tout l'intérêt du bouton.
    expect(decrocherSucces('trouNoir')).toBe(true);
  });

  /**
   * L'ordre du démarrage est le piège.
   *
   * Le stockage n'est rempli qu'une fois `initStorage()` revenu, et les modules
   * sont évalués avant la première ligne de `main.tsx`. Lire au chargement du
   * module donnait donc un ensemble vide à chaque lancement : les succès de la
   * veille perdus, et le premier succès du jour les effaçant pour de bon en
   * réécrivant la liste. On relit au premier accès, qui vient de la scène ou de
   * l'interface, donc bien après.
   */
  it('relit le stockage au premier accès, et non au chargement du module', async () => {
    vi.resetModules();
    // Les deux viennent du registre neuf, sans quoi ils ne partageraient pas
    // le même stockage en mémoire.
    const stockage = await import('../../services/storage');
    const frais = await import('./succes');

    // Le stockage arrive après le module : c'est l'ordre réel au démarrage.
    stockage.writeSucces(['comete', 'trouNoir']);

    expect(frais.succesDecroches()).toEqual(['comete', 'trouNoir']);
    expect(frais.estDecroche('comete')).toBe(true);
  });

  it('il y en a un par événement du ciel', () => {
    expect(new Set(SUCCES).size).toBe(SUCCES.length);
    expect(SUCCES).toContain('supernova');
    expect(SUCCES).toContain('trouNoir');
  });
});
