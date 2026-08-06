/** Durée en secondes → `M:SS`. Chaîne vide si la durée est inconnue. */
export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || isNaN(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Combine la racine de la bibliothèque et un chemin relatif. */
export function absPath(root: string, rel: string): string {
  return rel ? `${root}/${rel}` : root;
}
