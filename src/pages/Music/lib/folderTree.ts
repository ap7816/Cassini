import type { TrackDto } from '../../../features/music/MusicContext';

export type SortBy = 'name' | 'dur' | 'ext';
export type SortDir = 'asc' | 'desc';

/** Piste enrichie de son index dans la liste de lecture d'origine. */
export type TrackWithIdx = TrackDto & { originalIndex: number };

/** Hiérarchie des dossiers et pistes audio. */
export interface FolderNode {
  name: string;
  fullPath: string;
  tracks: TrackWithIdx[];
  children: FolderNode[];
}

/**
 * Construit l'arbre de dossiers à partir des pistes et des dossiers vides
 * connus. Les dossiers sans piste sont inclus pour rester navigables.
 */
export function buildTree(tracks: TrackWithIdx[], extraDirs: string[] = []): FolderNode {
  const root: FolderNode = { name: '', fullPath: '', tracks: [], children: [] };
  const map = new Map<string, FolderNode>();
  map.set('', root);

  // Crée récursivement les nœuds parents manquants
  function ensureNode(path: string): FolderNode {
    const known = map.get(path);
    if (known) return known;

    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const parent = ensureNode(parts.slice(0, -1).join('/'));

    const node: FolderNode = { name, fullPath: path, tracks: [], children: [] };
    map.set(path, node);
    parent.children.push(node);
    return node;
  }

  for (const t of tracks) ensureNode(t.folder).tracks.push(t);
  for (const dir of extraDirs) if (dir) ensureNode(dir);
  return root;
}

/** Descend l'arbre en suivant un chemin de navigation. */
export function getNodeAtPath(tree: FolderNode, path: string[]): FolderNode {
  let node = tree;
  for (const seg of path) {
    const child = node.children.find((c) => c.name === seg);
    if (!child) return node;
    node = child;
  }
  return node;
}

/** Le nœud, ou l'un de ses descendants, contient-il la piste en lecture ? */
export function hasActive(node: FolderNode, idx: number): boolean {
  if (node.tracks.some((t) => t.originalIndex === idx)) return true;
  return node.children.some((c) => hasActive(c, idx));
}

/** Nombre total de pistes dans un nœud et ses descendants. */
export function countTracks(node: FolderNode): number {
  return node.tracks.length + node.children.reduce((s, c) => s + countTracks(c), 0);
}
