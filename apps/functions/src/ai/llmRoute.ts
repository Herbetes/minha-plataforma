// Roteador único de LLM. Nenhuma outra Function deve chamar provedores diretamente.
//
// Contrato (brief §"CAMADA DE IA"):
//  1. Entrada validada por Zod.
//  2. Cap de custo verificado ANTES da chamada; bloqueia se statusCap='bloqueado'.
//  3. PII minimizada (responsabilidade do chamador — aqui só logamos redigidos).
//  4. Prompt sistema inclui JSON Schema; resposta valida contra schema.
//  5. Cache SHA-256(provider+modelo+prompt) em /llmCache/{hash} com TTL por tipo.
//  6. Rate-limit por (uid, tipo): token bucket em Firestore.
//  7. Log estruturado + auditoria.

import { createHash, randomUUID } from 'node:crypto';

import {
  CODIGOS_ERRO,
  zRequisicaoLLM,
  zRespostaLLM,
  type Provider,
  type RequisicaoLLM,
  type RespostaLLM,
  type TipoChamadaIA,
} from '@minha-plataforma/shared';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { exigirAuth } from '../utils/contextoAuth.js';
import { erroCapExcedido, erroLLM, erroRateLimit, erroValidacao } from '../utils/erros.js';
import { logger } from '../utils/logger.js';
import { registrarConsumoIA, verificarCapAntes } from './capGuard.js';

// TTL por tipo de chamada. Escolhidos por valor-de-fresh: chat tutor precisa de contexto do momento.
const TTL_SEGUNDOS: Record<TipoChamadaIA, number> = {
  diagnostico_aluno: 24 * 60 * 60,
  insights_turma: 24 * 60 * 60,
  plano_estudo: 12 * 60 * 60,
  correcao_dissertativa: 7 * 24 * 60 * 60,
  chat_tutor: 0, // sem cache
  variacoes_questao: 7 * 24 * 60 * 60,
  config_assistente: 60 * 60,
  importacao_csv: 0,
};

// Rate-limit por (uid, tipo) em requisições/minuto. Token bucket simples.
const LIMITE_POR_MINUTO: Record<TipoChamadaIA, number> = {
  diagnostico_aluno: 10,
  insights_turma: 5,
  plano_estudo: 5,
  correcao_dissertativa: 30,
  chat_tutor: 20,
  variacoes_questao: 10,
  config_assistente: 20,
  importacao_csv: 3,
};

function hashPrompt(provider: Provider, modelo: string, prompt: string, promptSistema?: string): string {
  return createHash('sha256').update(`${provider}::${modelo}::${promptSistema ?? ''}::${prompt}`).digest('hex');
}

async function verificarRateLimit(uid: string, tipo: TipoChamadaIA): Promise<void> {
  const db = getFirestore();
  const limite = LIMITE_POR_MINUTO[tipo];
  const ref = db.collection('rateLimits').doc(`${uid}:${tipo}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const agora = Date.now();
    const janelaInicio = agora - 60_000;
    const anteriores = (snap.data()?.chamadas as number[] | undefined) ?? [];
    const recentes = anteriores.filter((ts) => ts > janelaInicio);
    if (recentes.length >= limite) {
      throw erroRateLimit();
    }
    recentes.push(agora);
    tx.set(ref, { chamadas: recentes, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function buscarCache(hash: string): Promise<RespostaLLM | null> {
  const db = getFirestore();
  const snap = await db.collection('llmCache').doc(hash).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data) return null;
  const expira = data.expiraEm as Timestamp | undefined;
  if (expira && expira.toMillis() < Date.now()) return null;
  const parse = zRespostaLLM.safeParse({ ...data.resposta, cacheHit: true });
  return parse.success ? parse.data : null;
}

async function gravarCache(hash: string, resposta: RespostaLLM, ttlSeg: number): Promise<void> {
  if (ttlSeg <= 0) return;
  const db = getFirestore();
  await db.collection('llmCache').doc(hash).set({
    resposta,
    criadoEm: FieldValue.serverTimestamp(),
    expiraEm: Timestamp.fromMillis(Date.now() + ttlSeg * 1000),
  });
}

// ----- Adaptadores de provider (stubs; implementação real em Fase 2) -----
// Injeção via parâmetro permite testar sem chamadas reais.

export interface AdaptadorProvider {
  chamar(req: RequisicaoLLM): Promise<{ conteudo: unknown; modelo: string; tokensIn: number; tokensOut: number; custoUSD: number }>;
}

export const adaptadoresPadrao: Record<Provider, AdaptadorProvider> = {
  openai: {
    chamar: async () => { throw erroLLM(CODIGOS_ERRO.LLM_FALHA, 'Adapter OpenAI não configurado (Fase 2)'); },
  },
  anthropic: {
    chamar: async () => { throw erroLLM(CODIGOS_ERRO.LLM_FALHA, 'Adapter Anthropic não configurado (Fase 2)'); },
  },
  gemini: {
    chamar: async () => { throw erroLLM(CODIGOS_ERRO.LLM_FALHA, 'Adapter Gemini não configurado (Fase 2)'); },
  },
};

interface OpcoesRotear {
  orgId: string;
  uid: string;
  entrada: RequisicaoLLM;
  adaptadores?: Record<Provider, AdaptadorProvider>;
}

export async function roteadorLLM({ orgId, uid, entrada, adaptadores = adaptadoresPadrao }: OpcoesRotear): Promise<RespostaLLM> {
  const requestId = entrada.requestId || randomUUID();
  const provider: Provider = entrada.provider ?? ((process.env.LLM_PROVIDER_PADRAO as Provider) ?? 'openai');
  const ctxLog = { requestId, uid, orgId, tipo: entrada.tipo, provider };

  // 1. Cap de custo
  const { bloqueado, estado } = await verificarCapAntes(orgId);
  if (bloqueado) {
    logger.warn('Chamada de IA bloqueada por cap', { ...ctxLog, estado });
    throw erroCapExcedido(estado.capUSD, estado.consumoUSD);
  }

  // 2. Rate limit
  await verificarRateLimit(uid, entrada.tipo);

  // 3. Cache
  const modeloPadrao = entrada.modelo ?? 'default';
  const hash = hashPrompt(provider, modeloPadrao, entrada.prompt, entrada.promptSistema);
  if (entrada.cachear) {
    const hit = await buscarCache(hash);
    if (hit) {
      logger.info('Cache hit de LLM', { ...ctxLog, hash });
      return { ...hit, requestId };
    }
  }

  // 4. Chamar provider
  const inicio = Date.now();
  const adaptador = adaptadores[provider];
  const bruto = await adaptador.chamar(entrada);
  const latenciaMs = Date.now() - inicio;

  const resposta: RespostaLLM = {
    conteudo: bruto.conteudo,
    modelo: bruto.modelo,
    provider,
    tokensEntrada: bruto.tokensIn,
    tokensSaida: bruto.tokensOut,
    custoUSD: bruto.custoUSD,
    latenciaMs,
    cacheHit: false,
    requestId,
  };

  // 5. Contabilizar consumo + gravar cache
  await Promise.all([
    registrarConsumoIA(orgId, bruto.custoUSD),
    gravarCache(hash, resposta, TTL_SEGUNDOS[entrada.tipo]),
  ]);

  logger.info('Chamada LLM ok', {
    ...ctxLog,
    modelo: bruto.modelo,
    tokensIn: bruto.tokensIn,
    tokensOut: bruto.tokensOut,
    custoUSD: bruto.custoUSD,
    latenciaMs,
  });

  return resposta;
}

// Callable pública do roteador. Callers internos (outras Functions) devem importar `roteadorLLM` direto.
export const llmRoute = onCall(
  { region: 'southamerica-east1', maxInstances: 50 },
  async (request) => {
    const ctx = exigirAuth(request);
    const parse = zRequisicaoLLM.safeParse(request.data);
    if (!parse.success) throw erroValidacao(parse.error.flatten());
    try {
      return await roteadorLLM({ orgId: ctx.orgId, uid: ctx.uid, entrada: parse.data });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      logger.error('Falha inesperada no llmRoute', { erro: String(e) });
      throw erroLLM(CODIGOS_ERRO.LLM_FALHA, 'Falha inesperada no roteador de LLM');
    }
  },
);
