import type { Game } from '../../types';
import { readGamesRaw, writeGamesRaw } from '../../../services/storage';

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

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

export function saveGamesToStorage(games: Game[]): void {
  writeGamesRaw(JSON.stringify(games));
}
