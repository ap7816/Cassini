// Aléatoire déterministe : chaque planète doit garder exactement la même
// apparence d'une session à l'autre, donc tout est dérivé de l'identifiant du
// jeu plutôt que de Math.random().

/** Hash djb2-xor — non cryptographique, sert uniquement de graine. */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/** Générateur xorshift32 ensemencé, renvoyant des flottants dans [0, 1). */
export function seededRng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}
