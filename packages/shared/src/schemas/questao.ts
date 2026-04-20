import { z } from 'zod';
import { zId, zTimestampISO } from './comuns.js';

export const zAlternativa = z.object({
  id: zId,
  texto: z.string().min(1),
  correta: z.boolean(),
});

export const zPsicometria = z.object({
  taxaAcerto: z.number().min(0).max(1),
  discriminacao: z.number().min(-1).max(1),
  flagQuestaoQuebrada: z.boolean(),
  nAmostras: z.number().int().nonnegative(),
  ultimaAtualizacao: zTimestampISO,
}).partial();

export const zTipoQuestao = z.enum(['objetiva', 'multipla_correta', 'dissertativa', 'numerica']);

export const zQuestao = z.object({
  disciplinaId: zId,
  areaId: zId.optional(),
  dificuldade: z.enum(['facil', 'medio', 'dificil']),
  tags: z.array(z.string().min(1).max(40)).default([]),
  enunciado: z.string().min(1),
  tipo: zTipoQuestao,
  alternativas: z.array(zAlternativa).optional(),
  gabarito: z.union([z.string(), z.number(), z.array(zId)]).optional(),
  criterioCorrecao: z.string().optional(), // para dissertativa
  versao: z.number().int().positive(),
  ativa: z.boolean(),
  psicometria: zPsicometria.optional(),
  criadoPor: zId,
  criadoEm: zTimestampISO,
  atualizadoEm: zTimestampISO,
}).superRefine((q, ctx) => {
  if ((q.tipo === 'objetiva' || q.tipo === 'multipla_correta') && (!q.alternativas || q.alternativas.length < 2)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Objetivas requerem ao menos 2 alternativas' });
  }
  if ((q.tipo === 'objetiva' || q.tipo === 'multipla_correta') && q.alternativas) {
    const corretas = q.alternativas.filter((a) => a.correta).length;
    if (q.tipo === 'objetiva' && corretas !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Objetiva deve ter exatamente 1 alternativa correta' });
    }
    if (q.tipo === 'multipla_correta' && corretas < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Múltipla correta deve ter ao menos 1 alternativa correta' });
    }
  }
  if (q.tipo === 'dissertativa' && !q.criterioCorrecao) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Dissertativa exige critério de correção' });
  }
});

export type Questao = z.infer<typeof zQuestao>;
export type TipoQuestao = z.infer<typeof zTipoQuestao>;
