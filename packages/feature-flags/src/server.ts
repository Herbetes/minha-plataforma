// Adaptador server-side (Cloud Functions) com cache in-memory curto (TTL 30s).
// Cache por instância de container — aceita staleness mínimo em troca de menos leituras.

import type { FeatureFlag } from '@minha-plataforma/shared';

import { avaliarFlag, type ContextoAvaliacao } from './avaliar.js';

export interface AdaptadorFirestoreServidor {
  obterFlagPerOrg(orgId: string, nome: string): Promise<FeatureFlag | null>;
  obterFlagGlobal(nome: string): Promise<FeatureFlag | null>;
}

const TTL_MS = 30_000;

interface EntradaCache<T> { valor: T; expiraEm: number; }
const cache = new Map<string, EntradaCache<FeatureFlag | null>>();

async function buscarCacheado(
  chave: string,
  buscar: () => Promise<FeatureFlag | null>,
): Promise<FeatureFlag | null> {
  const agora = Date.now();
  const existente = cache.get(chave);
  if (existente && existente.expiraEm > agora) return existente.valor;
  const valor = await buscar();
  cache.set(chave, { valor, expiraEm: agora + TTL_MS });
  return valor;
}

export async function flagAtivaServer(
  adaptador: AdaptadorFirestoreServidor,
  orgId: string,
  nome: string,
  ctx: ContextoAvaliacao,
): Promise<boolean> {
  const [perOrg, global] = await Promise.all([
    buscarCacheado(`org:${orgId}:${nome}`, () => adaptador.obterFlagPerOrg(orgId, nome)),
    buscarCacheado(`global:${nome}`, () => adaptador.obterFlagGlobal(nome)),
  ]);
  return avaliarFlag(perOrg, global, ctx).ativa;
}

// Útil em testes e no kill-switch: força limpeza.
export function limparCacheFlags(): void {
  cache.clear();
}
