import type { Game, GamePlatform } from '../../types';
import { tauriInvoke } from '../../../services/tauri';
import { loadGamesFromStorage, saveGamesToStorage } from './libraryStorage';
import { deduplicateGames, mergeById } from './mergeGames';

/**
 * Détection des jeux installés, hors de tout composant.
 *
 * Le scan ne vivait jusqu'ici que dans la page Bibliothèque, derrière son
 * bouton « Actualiser ». Un jeu fraîchement installé n'apparaissait donc nulle
 * part tant qu'on n'avait pas pensé à ouvrir cette page et à cliquer — et
 * depuis que l'application s'ouvre sur le système solaire, on peut ne jamais y
 * passer.
 */

/** Une commande de détection par launcher, et la plateforme qu'elle renseigne. */
const SCANNERS: Array<{ commande: string; platform: GamePlatform }> = [
  { commande: 'scan_steam_games', platform: 'Steam' },
  { commande: 'scan_epic_games', platform: 'Epic' },
  { commande: 'scan_battlenet_games', platform: 'BattleNet' },
  { commande: 'scan_riot_games', platform: 'Riot' },
  { commande: 'scan_rockstar_games', platform: 'Rockstar' },
  { commande: 'scan_ubisoft_games', platform: 'Ubisoft' },
  { commande: 'scan_hytale_games', platform: 'Hytale' },
];

/**
 * Applique le résultat d'un scan à la bibliothèque.
 *
 * Les mêmes règles que la page Bibliothèque, et pour cause : elles viennent du
 * même module. Un jeu de cette plateforme absent du scan n'est plus installé,
 * mais il reste dans la bibliothèque — on en garde le favori, la date de
 * dernière partie et l'image choisie.
 */
export function appliquerScan(
  precedents: Game[],
  detectes: Game[],
  platform: GamePlatform,
): Game[] {
  const normalises: Game[] = detectes.map((g) => ({
    ...g,
    platform,
    installed: true,
    favorite: g.favorite ?? false,
  }));

  const presents = new Set(normalises.map((g) => g.id));
  const misAJour = precedents.map((g) =>
    g.platform === platform && !presents.has(g.id) ? { ...g, installed: false } : g,
  );

  return deduplicateGames(mergeById(misAJour, normalises));
}

export type ResultatScan = {
  /** Jeux découverts qui n'étaient pas dans la bibliothèque. */
  ajoutes: number;
  /** Launchers dont la détection a échoué — absents, ou commande indisponible. */
  echecs: string[];
  /** La bibliothèque a-t-elle changé ? */
  modifiee: boolean;
};

/**
 * Détecte les jeux de tous les launchers et met la bibliothèque à jour.
 *
 * Les scans partent ensemble : ils interrogent des dossiers et des clés de
 * registre distincts, les enchaîner ne ferait qu'additionner les attentes. En
 * revanche la fusion est séquentielle — chaque plateforme s'applique sur le
 * résultat de la précédente, sinon la dernière écraserait les autres.
 *
 * Un launcher absent de la machine fait échouer sa commande : c'est attendu, et
 * cela ne doit pas empêcher les six autres d'aboutir.
 */
export function scannerTousLesLaunchers(): Promise<ResultatScan> {
  // Un seul scan à la fois : le bouton « Actualiser » peut croiser le scan du
  // démarrage ou celui du retour sur l'application. Deux passes simultanées
  // liraient la même bibliothèque et la réécriraient l'une après l'autre ;
  // la seconde reçoit simplement le résultat de la première.
  if (!scanEnCours) {
    scanEnCours = scanner().finally(() => {
      scanEnCours = null;
    });
  }
  return scanEnCours;
}

let scanEnCours: Promise<ResultatScan> | null = null;

/**
 * Ajoute aux jeux Steam leur temps de jeu, que Steam tient en local.
 *
 * À part du scan des manifestes : un échec ici — fichier illisible, compte
 * jamais connecté — ne doit pas faire perdre la liste des jeux.
 */
async function avecTempsDeJeu(jeux: Game[]): Promise<Game[]> {
  try {
    const temps = await tauriInvoke<Record<string, number>>('steam_playtimes');
    return jeux.map((g) => {
      const m = g.steamAppId ? temps[g.steamAppId] : undefined;
      return typeof m === 'number' ? { ...g, playtimeMinutes: m } : g;
    });
  } catch {
    return jeux;
  }
}

async function scanner(): Promise<ResultatScan> {
  const resultats = await Promise.all(
    SCANNERS.map(async (s) => {
      try {
        const jeux = await tauriInvoke<Game[]>(s.commande);
        return { platform: s.platform, jeux: s.platform === 'Steam' ? await avecTempsDeJeu(jeux) : jeux };
      } catch {
        return { platform: s.platform, jeux: null };
      }
    }),
  );

  const avant = loadGamesFromStorage();
  const connus = new Set(avant.map((g) => g.id));

  let apres = avant;
  const echecs: string[] = [];
  for (const r of resultats) {
    if (r.jeux === null) {
      echecs.push(r.platform);
      continue;
    }
    apres = appliquerScan(apres, r.jeux, r.platform);
  }

  const ajoutes = apres.filter((g) => !connus.has(g.id)).length;
  const modifiee = empreinte(avant) !== empreinte(apres);

  if (modifiee) saveGamesToStorage(apres);

  return { ajoutes, echecs, modifiee };
}

/**
 * Empreinte de contenu d'une bibliothèque, insensible à l'ordre.
 *
 * Comparer deux `JSON.stringify` ne dirait rien d'utile : la fusion reconstruit
 * chaque jeu, ce qui change l'ordre de ses clés, et la déduplication regroupe
 * par titre, ce qui change l'ordre du tableau. On croirait la bibliothèque
 * modifiée à chaque démarrage — et l'on réécrirait le stockage pour rien, ce
 * qui reconstruirait la galaxie sous les yeux de l'utilisateur.
 */
function empreinte(games: Game[]): string {
  return games
    .map((g) => {
      const cles = Object.keys(g).sort() as Array<keyof Game>;
      return cles
        .map((k) => String(k) + '=' + JSON.stringify(g[k] ?? null))
        .join(' | ');
    })
    .sort()
    .join(String.fromCharCode(10));
}
