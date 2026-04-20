import type { Papel } from '@minha-plataforma/shared';
import type { CallableRequest } from 'firebase-functions/v2/https';

import { erroNaoAutenticado, erroSemOrg, erroSemPermissao } from './erros.js';

export interface ContextoChamada {
  uid: string;
  orgId: string;
  papel: Papel;
}

/**
 * Extrai e valida uid/orgId/papel do token JWT do chamador.
 * A fonte-verdade de autorização são os custom claims, NÃO o documento do usuário.
 */
export function exigirAuth(request: CallableRequest<unknown>): ContextoChamada {
  const auth = request.auth;
  if (!auth) throw erroNaoAutenticado();

  const orgId = auth.token.orgId as string | undefined;
  const papel = auth.token.role as Papel | undefined;

  if (!orgId) throw erroSemOrg();
  if (!papel) throw erroSemPermissao('Papel não definido');

  return { uid: auth.uid, orgId, papel };
}

export function exigirPapel(ctx: ContextoChamada, permitidos: readonly Papel[]): void {
  if (!permitidos.includes(ctx.papel)) {
    throw erroSemPermissao(`Papel ${ctx.papel} não autorizado para esta operação`);
  }
}
