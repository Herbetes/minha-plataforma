// Hash estável (FNV-1a 32-bit) para decidir se um usuário entra no bucket de rollout.
// Escolhido em vez de Math.random para que, dada uma flag+uid, a decisão seja determinística
// (mesmo usuário vê o mesmo estado toda vez) e independente de cliente/servidor.

export function hashFnv1a(entrada: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < entrada.length; i++) {
    hash ^= entrada.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function bucketRollout(nomeFlag: string, uid: string): number {
  return hashFnv1a(`${nomeFlag}:${uid}`) % 100;
}
