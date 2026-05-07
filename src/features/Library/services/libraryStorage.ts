import type { Game } from '../../types';
import { readGamesRaw, writeGamesRaw } from '../../../services/storage';

// Retourne la valeur si c'est une string, sinon null
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

// Retourne la valeur si c'est un booléen, sinon undefined (pour distinguer absent/faux)
function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

// Valide et normalise un tableau brut (venant du JSON) en tableau de Game typés
// Ignore silencieusement les entrées dont les champs obligatoires (id, title, platform) sont manquants
export function normalizeGames(input: unknown): Game[] {
  if (!Array.isArray(input)) return [];

  const out: Game[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;

    const r = raw as Record<string, unknown>;

    const id = asString(r.id);
    const title = asString(r.title);
    const platform = asString(r.platform);

    if (!id || !title || !platform) continue;

    out.push({
      id,
      title,
      platform: platform as Game['platform'],
      launchUrl: asString(r.launchUrl),
      lastPlayedAt: asString(r.lastPlayedAt),
      installed: asBool(r.installed) ?? false,
      favorite: asBool(r.favorite) ?? false,
      customImageUrl: asString(r.customImageUrl),
    });
  }

  return out;
}

// Charge la liste des jeux depuis le stockage persistant, retourne [] si vide ou corrompu
export function loadGamesFromStorage(): Game[] {
  const raw = readGamesRaw();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return normalizeGames(parsed);
  } catch {
    return [];
  }
}

// Sérialise et écrit la liste des jeux dans le stockage persistant
export function saveGamesToStorage(games: Game[]): void {
  writeGamesRaw(JSON.stringify(games));
}
