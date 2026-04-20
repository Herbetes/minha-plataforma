import { CODIGOS_ERRO, type CodigoErro } from '@minha-plataforma/shared';
import { HttpsError } from 'firebase-functions/v2/https';

// Wrapper tipado: sempre usar essas helpers em vez de instanciar HttpsError diretamente,
// para garantir que o cliente sempre receba um `code` do CODIGOS_ERRO.

export function erroNaoAutenticado(): HttpsError {
  return new HttpsError('unauthenticated', 'Não autenticado', { codigo: CODIGOS_ERRO.AUTH_NAO_AUTENTICADO });
}

export function erroSemOrg(): HttpsError {
  return new HttpsError('failed-precondition', 'Usuário sem organização', { codigo: CODIGOS_ERRO.AUTH_SEM_ORG });
}

export function erroSemPermissao(detalhe?: string): HttpsError {
  return new HttpsError('permission-denied', detalhe ?? 'Sem permissão', { codigo: CODIGOS_ERRO.AUTH_SEM_PERMISSAO });
}

export function erroCapExcedido(capUSD: number, consumoUSD: number): HttpsError {
  return new HttpsError('resource-exhausted', 'Cap de custo de IA excedido', {
    codigo: CODIGOS_ERRO.CAP_EXCEDIDO,
    capUSD,
    consumoUSD,
  });
}

export function erroValidacao(detalhe: unknown): HttpsError {
  return new HttpsError('invalid-argument', 'Validação falhou', {
    codigo: CODIGOS_ERRO.VALIDACAO_FALHOU,
    detalhe,
  });
}

export function erroRateLimit(): HttpsError {
  return new HttpsError('resource-exhausted', 'Limite de requisições excedido', { codigo: CODIGOS_ERRO.RATE_LIMIT });
}

export function erroLLM(codigo: CodigoErro, mensagem: string): HttpsError {
  return new HttpsError('internal', mensagem, { codigo });
}

export function erroFlagDesligada(nome: string): HttpsError {
  return new HttpsError('failed-precondition', `Feature ${nome} desligada`, { codigo: CODIGOS_ERRO.FLAG_DESLIGADA });
}
