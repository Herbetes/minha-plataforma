import { z } from 'zod';
import { zCor, zId, zIdioma, zTimestampISO, zUSD } from './comuns.js';

export const zBranding = z.object({
  nome: z.string().min(1).max(120),
  logoUrl: z.string().url().optional(),
  corPrimaria: zCor,
  corSecundaria: zCor,
  dominioCustom: z.string().min(3).max(255).optional(),
});

export const zConceito = z.object({
  id: zId,
  nome: z.string().min(1).max(40),
  minPct: z.number().min(0).max(100),
  maxPct: z.number().min(0).max(100),
  cor: zCor,
});

export const zConfig = z.object({
  versao: z.number().int().nonnegative(),
  idioma: zIdioma,
  disciplinas: z.array(z.object({ id: zId, nome: z.string(), areas: z.array(z.object({ id: zId, nome: z.string(), parentId: zId.optional() })) })),
  escalaPontuacao: z.object({
    max: z.number().positive(),
    conceitos: z.array(zConceito).min(1),
  }),
  camposCustomUsuario: z.array(z.object({
    id: zId,
    label: z.string().min(1).max(80),
    tipo: z.enum(['texto', 'numero', 'data', 'selecao']),
    obrigatorio: z.boolean(),
    opcoes: z.array(z.string()).optional(),
  })).default([]),
  proctoringPadrao: z.object({
    trocaAbaMax: z.number().int().min(0).max(10),
    tempoMinSeg: z.number().int().min(0),
    bloqueioMultiplaSessao: z.boolean(),
  }),
  gamificacao: z.object({
    ativa: z.boolean(),
    badges: z.array(z.object({ id: zId, nome: z.string(), descricao: z.string(), criterio: z.string() })).default([]),
  }),
});

export const zStatusCap = z.enum(['saudavel', 'aviso70', 'aviso90', 'bloqueado']);

export const zPlano = z.enum(['trial', 'basico', 'profissional', 'enterprise', 'customizado']);

export const zOrganizacao = z.object({
  nome: z.string().min(1).max(200),
  plano: zPlano,
  branding: zBranding,
  config: zConfig,
  capsCustoIAMesUSD: zUSD,
  consumoAcumuladoMesUSD: zUSD,
  statusCap: zStatusCap,
  mesReferencia: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  criadoEm: zTimestampISO,
  atualizadoEm: zTimestampISO,
});

export type Organizacao = z.infer<typeof zOrganizacao>;
export type Config = z.infer<typeof zConfig>;
export type Branding = z.infer<typeof zBranding>;
export type StatusCap = z.infer<typeof zStatusCap>;
