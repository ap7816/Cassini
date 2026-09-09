import type { Game } from '../../types';

/**
 * Fusion et déduplication de la bibliothèque.
 *
 * Extrait du hook parce que le scan automatique du démarrage s'en sert aussi,
 * et qu'il n'a rien de React : dupliquer ces règles, c'était prendre le risque
 * qu'une des deux copies cesse un jour de préserver les favoris.
 */

// Ordre de priorité pour la déduplication : Steam prime sur Epic, puis BattleNet, etc.
const PLATFORM_PRIORITY: Record<string, number> = { Steam: 0, Epic: 1, BattleNet: 2, Riot: 3, Rockstar: 4, Ubisoft: 5 };

// Normalise un titre pour la comparaison de doublons : minuscules, sans ponctuation
function normalizeName(title: string): string {
  return title.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

// Déduplique les jeux détectés sur plusieurs plateformes par titre normalisé
// En cas de conflit, garde la plateforme prioritaire et fusionne les données utilisateur
export function deduplicateGames(games: Game[]): Game[] {
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const key = normalizeName(g.title);
    const group = groups.get(key) ?? [];
    group.push(g);
    groups.set(key, group);
  }

  const result: Game[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }

    group.sort((a, b) => (PLATFORM_PRIORITY[a.platform] ?? 99) - (PLATFORM_PRIORITY[b.platform] ?? 99));
    const winner = { ...group[0] };
    for (const g of group.slice(1)) {
      if (!winner.favorite && g.favorite) winner.favorite = true;
      if (!winner.lastPlayedAt && g.lastPlayedAt) winner.lastPlayedAt = g.lastPlayedAt;
      if (!winner.customImageUrl && g.customImageUrl) winner.customImageUrl = g.customImageUrl;
    }
    result.push(winner);
  }
  return result;
}

// Fusionne une liste existante avec une liste entrante en préservant les données utilisateur
// (favori, lastPlayedAt, image custom) — jamais perdues lors d'un rescan
export function mergeById(prev: Game[], incoming: Game[]): Game[] {
  const map = new Map<string, Game>();
  for (const g of prev) map.set(g.id, g);

  for (const g of incoming) {
    const existing = map.get(g.id);
    if (existing) {
      map.set(g.id, {
        ...existing,
        ...g,
        favorite: existing.favorite ?? g.favorite ?? false,
        lastPlayedAt: existing.lastPlayedAt ?? g.lastPlayedAt ?? null,
        customImageUrl: existing.customImageUrl ?? g.customImageUrl ?? null,
      });
    } else {
      map.set(g.id, { ...g, favorite: g.favorite ?? false });
    }
  }

  return Array.from(map.values());
}
