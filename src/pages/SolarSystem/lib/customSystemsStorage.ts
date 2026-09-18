import { STORAGE_KEYS, readJSON, writeJSON } from '../../../services/storage';
import {
  normaliserReglagesLaunchers,
  normaliserSystemes,
  type ReglageSysteme,
  type SystemePerso,
} from './customSystems';

/** Systèmes personnalisés enregistrés, relus et assainis. */
export function chargerSystemesPerso(): SystemePerso[] {
  return normaliserSystemes(readJSON<unknown>(STORAGE_KEYS.systemesPerso));
}

export function enregistrerSystemesPerso(liste: SystemePerso[]): void {
  writeJSON(STORAGE_KEYS.systemesPerso, liste);
}

/** Réglages des systèmes des launchers, par plateforme. */
export function chargerReglagesLaunchers(): Record<string, ReglageSysteme> {
  return normaliserReglagesLaunchers(readJSON<unknown>(STORAGE_KEYS.reglagesLaunchers));
}

export function enregistrerReglagesLaunchers(reglages: Record<string, ReglageSysteme>): void {
  writeJSON(STORAGE_KEYS.reglagesLaunchers, reglages);
}
