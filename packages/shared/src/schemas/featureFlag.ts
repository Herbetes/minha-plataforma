import { z } from 'zod';
import { zId, zTimestampISO } from './comuns.js';
import { zPapel } from './usuario.js';

// Flags seguem o padrão 'area.nomeDaFeature'. Ex.: 'ia.chatTutor', 'relatorios.radarHabilidades'.
export const zNomeFlag = z.string().regex(/^[a-z]+\.[a-zA-Z][a-zA-Z0-9]*$/, 'Nome deve seguir area.nomeDaFeature');

export const zAudienciaFlag = z.object({
  papeis: z.array(zPapel).optional(),
  usuariosIds: z.array(zId).optional(),
  turmasIds: z.array(zId).optional(),
});

export const zFeatureFlag = z.object({
  nome: zNomeFlag,
  ativo: z.boolean(),
  rolloutPct: z.number().int().min(0).max(100).default(0),
  audiencia: zAudienciaFlag.optional(),
  descricao: z.string().max(500).optional(),
  criadoEm: zTimestampISO,
  atualizadoEm: zTimestampISO,
});

export type FeatureFlag = z.infer<typeof zFeatureFlag>;
export type NomeFlag = z.infer<typeof zNomeFlag>;
