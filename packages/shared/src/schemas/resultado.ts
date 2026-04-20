import { z } from 'zod';
import { zId, zTimestampISO } from './comuns.js';

export const zResposta = z.object({
  questaoId: zId,
  valor: z.union([z.string(), z.number(), z.array(zId)]).nullable(),
  pontosObtidos: z.number().nonnegative().optional(),
  corrigida: z.boolean().default(false),
  corretor: z.enum(['automatica', 'humana', 'ia_assistida']).optional(),
  tempoRespostaSeg: z.number().int().nonnegative().optional(),
});

export const zEventoProctoring = z.object({
  tipo: z.enum(['troca_aba', 'copia_colar', 'multipla_sessao', 'tempo_anomalo', 'saida_fullscreen']),
  em: zTimestampISO,
  detalhes: z.record(z.string(), z.unknown()).optional(),
});

export const zResultado = z.object({
  simuladoId: zId,
  alunoId: zId,
  turmaId: zId.optional(),
  respostas: z.array(zResposta),
  total: z.number().nonnegative(),
  conceitoId: zId.optional(),
  eventosProctoring: z.array(zEventoProctoring).default([]),
  iniciadoEm: zTimestampISO,
  entregueEm: zTimestampISO.optional(),
  status: z.enum(['em_andamento', 'entregue', 'corrigido']),
});

export type Resultado = z.infer<typeof zResultado>;
export type Resposta = z.infer<typeof zResposta>;
