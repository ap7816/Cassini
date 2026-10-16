import type { Game } from '../../types';
// Résolution des jaquettes de jeux.
//
// Nommé d'après son rôle et non d'après son fournisseur : ce service s'est
// déjà appelé « rawgService » du temps où il interrogeait RAWG.io, et le nom
// est resté faux pendant tout le passage à SteamGridDB. Un nom fonctionnel
// survit au changement de prestataire.
//
// Deux sources aujourd'hui : le CDN de Valve pour les jeux Steam, dont l'URL
// se calcule sans appel réseau, et SteamGridDB pour tous les autres.

import { readCoverCacheRaw, writeCoverCacheRaw, removeCoverCache as storageRemoveCache } from '../../../services/storage';
import { tauriInvoke } from '../../../services/tauri';
import { estEnLigne, surEtatReseau, verifierLeReseau } from '../../system/reseau';

// URLs d'images trouvées → persistées dans le stockage entre les sessions
const persistentCache = new Map<string, string>();
// Clés sans résultat → gardées en mémoire seulement (retente à chaque redémarrage)
//
// « Sans résultat » veut dire : le fournisseur a répondu, et il n'a rien. Une
// panne de réseau n'a rien à faire ici — c'était le défaut. Hors ligne, chaque
// jeu y entrait comme s'il n'avait pas de jaquette, et au retour du wifi plus
// rien ne se rechargeait : la seule porte de sortie était de relancer
// l'application.
const notFoundCache = new Set<string>();

// Le réseau revient : on oublie les échecs, qui n'en étaient peut-être pas.
//
// Rien n'est rechargé d'autorité — ce sont les vignettes qui redemanderont, et
// elles le feront d'elles-mêmes puisqu'elles écoutent le même signal.
surEtatReseau((enLigne) => {
  if (enLigne) notFoundCache.clear();
});

function loadCache(): Map<string, string> {
  try {
    const raw = readCoverCacheRaw();
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    const result = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed)) {
      if (v) result.set(k, v);
    }
    return result;
  } catch {
    return new Map();
  }
}

function saveCache() {
  writeCoverCacheRaw(JSON.stringify(Object.fromEntries(persistentCache)));
}

if (typeof window !== 'undefined') {
  for (const [k, v] of loadCache()) persistentCache.set(k, v);
}

export function clearCoverCache() {
  persistentCache.clear();
  notFoundCache.clear();
  storageRemoveCache();
}

export function clearCoverCacheEntry(key: string) {
  persistentCache.delete(key);
  notFoundCache.delete(key);
  saveCache();
}

export function setCoverCacheEntry(key: string, value: string | null) {
  if (value) {
    persistentCache.set(key, value);
    saveCache();
  } else {
    notFoundCache.add(key);
  }
}

// Génère l'URL de la bannière header.jpg Steam (460×215) depuis un AppID
export function steamCdnUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

// Génère l'URL portrait Steam (600×900) utilisée en fallback si header.jpg échoue
export function steamPortraitUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

// Récupère l'URL de couverture d'un jeu :
// - Jeux Steam → CDN Valve directement (pas d'appel API)
// - Autres → commande Tauri fetch_sgdb_image (Rust, pas de CORS)
//
// La clé API n'est plus un paramètre : Rust la lit depuis le coffre système
// au moment de la requête. Elle ne transite jamais par le JavaScript.
// Cache persistant + cache mémoire en session.
// Requêtes en cours, par clé de cache.
//
// Le cache ne se remplit qu'une fois la réponse arrivée : sans ce registre,
// deux appelants demandant le même titre au même instant partaient tous les
// deux sur le réseau. C'est exactement ce qui arrive sur la page du système
// solaire, où les planètes et la liste latérale réclament les mêmes jaquettes
// simultanément.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Jaquette d'un jeu.
 *
 * Trois sources, dans cet ordre : le CDN de Steam quand on connaît son
 * identifiant, le logo que le jeu porte lui-même s'il vient du Store — seule
 * image qu'un jeu Xbox possède, aucun catalogue ne le connaissant —, puis
 * SteamGridDB.
 */
export function fetchCoverArt(
  jeu: Pick<Game, 'title' | 'steamAppId' | 'platform' | 'installPath'>,
  options?: { sansSteam?: boolean },
): Promise<string | null> {
  const { title } = jeu;
  const steamAppId = jeu.steamAppId ?? null;
  const dossierXbox = jeu.platform === 'Xbox' ? jeu.installPath ?? null : null;
  const cacheKey = steamAppId
    ? `steam:${steamAppId}`
    : dossierXbox
      ? `xbox:${dossierXbox.toLowerCase()}`
      : title.toLowerCase();

  // `sansSteam` : l'appelant a essayé les images de Valve et aucune n'existe.
  //
  // Le CDN n'a pas de jaquette pour tout ce qui porte un identifiant Steam —
  // les outils et les sorties récentes n'en ont souvent aucune, et l'adresse
  // calculée répond 404. Sans cette porte de sortie, on rendait l'URL morte
  // depuis le cache à celui-là même qui venait de la voir échouer : l'image se
  // rechargeait en boucle et la fiche gardait un cadre vide, sans même la
  // lettre de repli.
  const sansSteam = options?.sansSteam === true;

  if (!sansSteam && persistentCache.has(cacheKey)) {
    return Promise.resolve(persistentCache.get(cacheKey)!);
  }
  if (notFoundCache.has(cacheKey)) return Promise.resolve(null);

  if (sansSteam && persistentCache.has(cacheKey)) {
    const connue = persistentCache.get(cacheKey)!;
    // Une jaquette trouvée ailleurs reste valable ; seule l'adresse calculée
    // de Valve est à oublier — y compris pour les prochaines sessions.
    if (steamAppId && connue !== steamCdnUrl(steamAppId)) return Promise.resolve(connue);
    persistentCache.delete(cacheKey);
    saveCache();
  }

  if (steamAppId && !sansSteam) {
    const steamUrl = steamCdnUrl(steamAppId);
    persistentCache.set(cacheKey, steamUrl);
    saveCache();
    return Promise.resolve(steamUrl);
  }

  if (dossierXbox) {
    const enCours = inFlight.get(cacheKey);
    if (enCours) return enCours;
    const lecture = (async () => {
      try {
        const url = await tauriInvoke<string | null>('xbox_cover', { path: dossierXbox });
        if (url) {
          persistentCache.set(cacheKey, url);
          saveCache();
          return url;
        }
      } catch (e) {
        console.error('[xbox] lecture du logo impossible pour', title, e);
        // Une lecture qui échoue n'est pas une absence : on ne retient rien.
        return null;
      }
      notFoundCache.add(cacheKey);
      return null;
    })().finally(() => inFlight.delete(cacheKey));
    inFlight.set(cacheKey, lecture);
    return lecture;
  }

  // Sans réseau, inutile de demander : on ne retient rien et on réessaiera.
  if (!estEnLigne()) return Promise.resolve(null);

  const running = inFlight.get(cacheKey);
  if (running) return running;

  const request = (async () => {
    try {
      const url = await tauriInvoke<string | null>('fetch_sgdb_image', { title });
      if (url) {
        persistentCache.set(cacheKey, url);
        saveCache();
        return url;
      }
    } catch (e) {
      // Le côté natif ne rend une erreur que s'il n'a pas pu **joindre** le
      // fournisseur ; une recherche qui aboutit sans rien trouver rend un
      // résultat vide. On ne retient donc rien ici : ce n'est pas une absence
      // de jaquette, c'est une absence de réponse.
      console.error('[sgdb] jaquette injoignable pour', title, e);
      // Le plus sûr des signaux : on vient d'essayer, et ça n'est pas passé.
      // On fait vérifier l'état du réseau sur-le-champ, au lieu d'attendre la
      // prochaine sonde — c'est ce qui fait paraître le bandeau tout de suite.
      verifierLeReseau();
      return null;
    }
    notFoundCache.add(cacheKey);
    return null;
  })().finally(() => inFlight.delete(cacheKey));

  inFlight.set(cacheKey, request);
  return request;
}
