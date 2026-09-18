import type { Game } from '../../types';
import { readGamesRaw, writeGamesRaw } from '../../../services/storage';

// Retourne la valeur si c'est une string, sinon null
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation des champs à risque
//
// Un fichier de bibliothèque peut venir de l'extérieur (import JSON partagé).
// Sans contrôle, `launchUrl` permettrait de faire lancer n'importe quel
// exécutable — y compris un binaire distant via un chemin UNC — au premier
// clic sur « Jouer ». On restreint donc aux formes légitimes.
// ─────────────────────────────────────────────────────────────────────────────

// Protocoles de lancement acceptés, tels qu'émis par les scans de plateformes
const ALLOWED_SCHEMES = [
  'steam://',
  'com.epicgames.launcher://',
  'battlenet://',
  'riotclient://',
  'uplay://',
] as const;

// Chemin Windows local absolu sur un disque : C:\Jeux\jeu.exe
//
// Les deux séparateurs sont acceptés. Steam stocke son dossier d'installation
// en barres obliques dans le registre (« c:/program files (x86)/steam ») ; les
// chemins de jeux qui en dérivent sont donc mixtes, et n'exiger que l'antislash
// les rejetait tous — le bouton « dossier du jeu » disparaissait pour toute la
// bibliothèque Steam. Win32 traite les deux séparateurs indifféremment.
//
// Le préfixe de disque reste obligatoire : il exclut les chemins UNC
// (\\serveur\partage, //serveur/partage), qui désigneraient une machine
// distante.
const LOCAL_PATH_RE = /^[a-zA-Z]:[\\/](?![\\/])/;

function sanitizeLaunchUrl(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;

  const t = s.trim();
  if (!t || t.length > 2048) return null;
  // Les caractères de contrôle n'ont rien à faire dans une cible de lancement
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(t)) return null;

  if (ALLOWED_SCHEMES.some((p) => t.toLowerCase().startsWith(p))) return t;

  // Chemin local : on refuse les chemins UNC (\\serveur\partage\charge.exe),
  // qui permettraient d'exécuter un binaire hébergé à distance.
  if (LOCAL_PATH_RE.test(t) && !t.includes('..')) return t;

  return null;
}

// Les URLs d'images sont chargées automatiquement à l'affichage des cartes :
// une URL arbitraire ferait de chaque affichage une balise de traçage.
function sanitizeImageUrl(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;

  const t = s.trim();
  if (!t || t.length > 2048) return null;
  if (t.toLowerCase().startsWith('https://')) return t;
  if (t.startsWith('data:image/')) return t;

  return null;
}

// Un chemin d'installation ne sert qu'à ouvrir un dossier : disque local seul
function sanitizeInstallPath(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;

  const t = s.trim();
  if (!t || t.length > 4096) return null;
  if (!LOCAL_PATH_RE.test(t) || t.includes('..')) return null;

  return t;
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

    // Le titre est affiché tel quel : on borne sa longueur et on retire les
    // caractères de contrôle pour éviter tout affichage dégradé.
    // eslint-disable-next-line no-control-regex
    const safeTitle = title.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256).trim();
    if (!safeTitle) continue;

    out.push({
      id:              id.slice(0, 256),
      title:           safeTitle,
      platform: platform as Game['platform'],
      launchUrl:       sanitizeLaunchUrl(r.launchUrl),
      lastPlayedAt:    asString(r.lastPlayedAt),
      installed:       asBool(r.installed) ?? false,
      favorite:        asBool(r.favorite) ?? false,
      customImageUrl:  sanitizeImageUrl(r.customImageUrl),
      installPath:     sanitizeInstallPath(r.installPath),
      steamAppId:      asString(r.steamAppId),
      sizeOnDisk:      typeof r.sizeOnDisk === 'number' && r.sizeOnDisk >= 0 ? r.sizeOnDisk : null,
      playtimeMinutes:
        typeof r.playtimeMinutes === 'number' && Number.isFinite(r.playtimeMinutes) && r.playtimeMinutes >= 0
          ? r.playtimeMinutes
          : null,
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
  for (const fn of abonnes) fn();
}

/**
 * Abonnés prévenus à chaque écriture de la bibliothèque.
 *
 * Le système solaire lit la bibliothèque une fois, à son montage. Sans ce
 * signal, un scan qui découvre un jeu pendant qu'il est affiché n'y changerait
 * rien : il faudrait quitter la page et y revenir pour voir la planète
 * apparaître.
 */
const abonnes = new Set<() => void>();

export function subscribeGames(fn: () => void): () => void {
  abonnes.add(fn);
  return () => { abonnes.delete(fn); };
}
