import { z } from 'zod';
import { PAPEIS } from '../constantes/papeis.js';
import { zEmail, zId, zTimestampISO } from './comuns.js';

export const zPapel = z.enum(PAPEIS);

// Documento em organizacoes/{orgId}/usuarios/{uid}
// OBS: campo `papel` aqui é informacional (reflexo). A fonte-verdade de autorização é o custom claim.
export const zUsuario = z.object({
  nome: z.string().min(1).max(200),
  email: zEmail,
  papel: zPapel,
  turmaIds: z.array(zId).default([]),
  camposCustom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  acessibilidade: z.object({
    tempoEstendidoPct: z.number().min(0).max(200).default(0),
    fonteAmpliada: z.boolean().default(false),
    altoContraste: z.boolean().default(false),
  }).default({ tempoEstendidoPct: 0, fonteAmpliada: false, altoContraste: false }),
  criadoEm: zTimestampISO,
  atualizadoEm: zTimestampISO,
});

export type Usuario = z.infer<typeof zUsuario>;

// Custom claims no token JWT. Mantemos o mínimo necessário para autorização no cliente e nas rules.
export const zCustomClaims = z.object({
  orgId: zId,
  role: zPapel,
});

export type CustomClaims = z.infer<typeof zCustomClaims>;
