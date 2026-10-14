import { describe, it, expect, beforeEach } from 'vitest';
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

  it('il y en a un par événement du ciel', () => {
    expect(new Set(SUCCES).size).toBe(SUCCES.length);
    expect(SUCCES).toContain('supernova');
    expect(SUCCES).toContain('trouNoir');
  });
});
