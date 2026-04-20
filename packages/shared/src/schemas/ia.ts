import { z } from 'zod';
import { zId, zTimestampISO, zUSD } from './comuns.js';

export const zProvider = z.enum(['openai', 'anthropic', 'gemini']);

export const zTipoChamadaIA = z.enum([
  'diagnostico_aluno',
  'insights_turma',
  'plano_estudo',
  'correcao_dissertativa',
  'chat_tutor',
  'variacoes_questao',
  'config_assistente',
  'importacao_csv',
]);

export const zRequisicaoLLM = z.object({
  tipo: zTipoChamadaIA,
  provider: zProvider.optional(),
  modelo: z.string().optional(),
  prompt: z.string().min(1),
  promptSistema: z.string().optional(),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
  temperatura: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().optional(),
  cachear: z.boolean().default(true),
  requestId: z.string().min(1),
});

export const zRespostaLLM = z.object({
  conteudo: z.unknown(),
  modelo: z.string(),
  provider: zProvider,
  tokensEntrada: z.number().int().nonnegative(),
  tokensSaida: z.number().int().nonnegative(),
  custoUSD: zUSD,
  latenciaMs: z.number().int().nonnegative(),
  cacheHit: z.boolean(),
  requestId: z.string(),
});

export const zInsight = z.object({
  escopo: z.enum(['aluno', 'turma', 'simulado', 'organizacao']),
  refId: zId,
  simuladoId: zId.optional(),
  tipo: zTipoChamadaIA,
  conteudo: z.unknown(),
  confianca: z.number().min(0).max(1),
  modelo: z.string(),
  tokensUsados: z.number().int().nonnegative(),
  custoUSD: zUSD,
  geradoEm: zTimestampISO,
});

export type RequisicaoLLM = z.infer<typeof zRequisicaoLLM>;
export type RespostaLLM = z.infer<typeof zRespostaLLM>;
export type TipoChamadaIA = z.infer<typeof zTipoChamadaIA>;
export type Provider = z.infer<typeof zProvider>;
