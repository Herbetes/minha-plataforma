import { z } from 'zod';
import { zId, zTimestampISO } from './comuns.js';

export const zItemSimulado = z.object({
  questaoId: zId,
  pontos: z.number().positive(),
  ordem: z.number().int().nonnegative(),
});

export const zConfigProctoring = z.object({
  trocaAbaMax: z.number().int().min(0),
  tempoMinSeg: z.number().int().min(0),
  bloqueioMultiplaSessao: z.boolean(),
  avisoTransparenciaAoAluno: z.boolean().default(true),
});

export const zEmbaralhamento = z.object({
  questoes: z.boolean(),
  alternativas: z.boolean(),
});

export const zJanelaAplicacao = z.object({
  inicio: zTimestampISO,
  fim: zTimestampISO,
  duracaoMinutos: z.number().int().positive(),
}).refine((j) => new Date(j.inicio).getTime() < new Date(j.fim).getTime(), {
  message: 'Início deve ser antes do fim',
});

export const zStatusSimulado = z.enum(['rascunho', 'publicado', 'aplicado', 'encerrado', 'arquivado']);

export const zSimulado = z.object({
  titulo: z.string().min(1).max(200),
  disciplinaId: zId.optional(),
  questoes: z.array(zItemSimulado).min(1),
  pontuacaoTotal: z.number().positive(),
  janelaAplicacao: zJanelaAplicacao,
  status: zStatusSimulado,
  embaralhamento: zEmbaralhamento,
  proctoring: zConfigProctoring,
  turmasIds: z.array(zId).default([]),
  criadoPor: zId,
  criadoEm: zTimestampISO,
  atualizadoEm: zTimestampISO,
});

export type Simulado = z.infer<typeof zSimulado>;
