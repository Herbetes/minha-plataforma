// Adaptador client-side: consome flags do Firestore via snapshot em tempo real.
// Mantido agnóstico à instância de Firestore (injetada pelo chamador) para facilitar testes.

import type { FeatureFlag } from '@minha-plataforma/shared';

import { avaliarFlag, type ContextoAvaliacao } from './avaliar.js';

export interface AdaptadorFirestore {
  obterFlagPerOrg(orgId: string, nome: string): Promise<FeatureFlag | null>;
  obterFlagGlobal(nome: string): Promise<FeatureFlag | null>;
}

export async function checarFlag(
  adaptador: AdaptadorFirestore,
  orgId: string,
  nome: string,
  ctx: ContextoAvaliacao,
): Promise<boolean> {
  const [perOrg, global] = await Promise.all([
    adaptador.obterFlagPerOrg(orgId, nome),
    adaptador.obterFlagGlobal(nome),
  ]);
  return avaliarFlag(perOrg, global, ctx).ativa;
}
