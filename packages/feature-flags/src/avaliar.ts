import type { FeatureFlag, Papel } from '@minha-plataforma/shared';

import { bucketRollout } from './hash.js';

export interface ContextoAvaliacao {
  uid: string;
  papel: Papel;
  turmaIds?: readonly string[];
}

export interface ResultadoAvaliacao {
  ativa: boolean;
  motivo: 'desligada' | 'rollout_fora' | 'audiencia_fora' | 'kill_switch' | 'ok';
}

/**
 * Decide se uma flag está ativa para um usuário.
 * Regras:
 *  - flag global com ativo=false funciona como kill-switch e prevalece sobre a per-org.
 *  - se flag per-org não existe, ativa = false.
 *  - se `audiencia` está definida, usuário precisa atender pelo menos um critério.
 *  - se rolloutPct < 100, bucket determinístico por (nomeFlag, uid) decide.
 */
export function avaliarFlag(
  flagPerOrg: FeatureFlag | null,
  flagGlobal: FeatureFlag | null,
  ctx: ContextoAvaliacao,
): ResultadoAvaliacao {
  if (flagGlobal && !flagGlobal.ativo) {
    return { ativa: false, motivo: 'kill_switch' };
  }

  const flag = flagPerOrg ?? flagGlobal;
  if (!flag || !flag.ativo) {
    return { ativa: false, motivo: 'desligada' };
  }

  const audiencia = flag.audiencia;
  if (audiencia) {
    const temPapeis = audiencia.papeis && audiencia.papeis.length > 0;
    const temUsuarios = audiencia.usuariosIds && audiencia.usuariosIds.length > 0;
    const temTurmas = audiencia.turmasIds && audiencia.turmasIds.length > 0;
    const qualquerCriterio = temPapeis || temUsuarios || temTurmas;

    if (qualquerCriterio) {
      const atendePapel = temPapeis ? audiencia.papeis!.includes(ctx.papel) : false;
      const atendeUsuario = temUsuarios ? audiencia.usuariosIds!.includes(ctx.uid) : false;
      const atendeTurma =
        temTurmas && ctx.turmaIds ? ctx.turmaIds.some((t) => audiencia.turmasIds!.includes(t)) : false;

      if (!(atendePapel || atendeUsuario || atendeTurma)) {
        return { ativa: false, motivo: 'audiencia_fora' };
      }
    }
  }

  const pct = flag.rolloutPct ?? 100;
  if (pct >= 100) return { ativa: true, motivo: 'ok' };
  if (pct <= 0) return { ativa: false, motivo: 'rollout_fora' };

  const bucket = bucketRollout(flag.nome, ctx.uid);
  return bucket < pct ? { ativa: true, motivo: 'ok' } : { ativa: false, motivo: 'rollout_fora' };
}
