import { z } from 'zod';
import { zId, zTimestampISO } from './comuns.js';

export const zAcaoAuditavel = z.enum([
  'usuario.criar',
  'usuario.atualizar',
  'usuario.alterar_papel',
  'usuario.excluir',
  'org.atualizar_config',
  'org.alterar_cap',
  'simulado.criar',
  'simulado.publicar',
  'simulado.encerrar',
  'resultado.corrigir',
  'flag.alterar',
  'lgpd.exportar',
  'lgpd.excluir',
  'ia.chamada',
  'ia.bloqueio_cap',
]);

export const zLogAuditoria = z.object({
  atorId: zId,
  atorPapel: z.string(),
  acao: zAcaoAuditavel,
  recurso: z.string(),
  antes: z.unknown().optional(),
  depois: z.unknown().optional(),
  requestId: z.string().optional(),
  em: zTimestampISO,
});

export type LogAuditoria = z.infer<typeof zLogAuditoria>;
export type AcaoAuditavel = z.infer<typeof zAcaoAuditavel>;
