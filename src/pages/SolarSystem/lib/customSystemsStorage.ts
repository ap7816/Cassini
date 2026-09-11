import { STORAGE_KEYS, readJSON, writeJSON } from '../../../services/storage';
import { normaliserSystemes, type SystemePerso } from './customSystems';

/** Systèmes personnalisés enregistrés, relus et assainis. */
export function chargerSystemesPerso(): SystemePerso[] {
  return normaliserSystemes(readJSON<unknown>(STORAGE_KEYS.systemesPerso));
}

export function enregistrerSystemesPerso(liste: SystemePerso[]): void {
  writeJSON(STORAGE_KEYS.systemesPerso, liste);
}
