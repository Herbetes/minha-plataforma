import { describe, expect, it } from 'vitest';

import { avaliarFlag } from './avaliar.js';

const agora = '2026-04-20T00:00:00Z';
const base = { criadoEm: agora, atualizadoEm: agora };

describe('avaliarFlag', () => {
  const ctx = { uid: 'user_1', papel: 'aluno' as const };

  it('fica desligada quando flag per-org não existe', () => {
    expect(avaliarFlag(null, null, ctx).ativa).toBe(false);
  });

  it('kill-switch global prevalece sobre per-org', () => {
    const perOrg = { ...base, nome: 'ia.chat', ativo: true, rolloutPct: 100 };
    const global = { ...base, nome: 'ia.chat', ativo: false, rolloutPct: 100 };
    const r = avaliarFlag(perOrg, global, ctx);
    expect(r.ativa).toBe(false);
    expect(r.motivo).toBe('kill_switch');
  });

  it('rollout 100% ativa para todos', () => {
    const f = { ...base, nome: 'ia.chat', ativo: true, rolloutPct: 100 };
    expect(avaliarFlag(f, null, ctx).ativa).toBe(true);
  });

  it('rollout 0% desativa para todos', () => {
    const f = { ...base, nome: 'ia.chat', ativo: true, rolloutPct: 0 };
    expect(avaliarFlag(f, null, ctx).ativa).toBe(false);
  });

  it('rollout parcial é determinístico por uid', () => {
    const f = { ...base, nome: 'ia.chat', ativo: true, rolloutPct: 50 };
    const r1 = avaliarFlag(f, null, { uid: 'u1', papel: 'aluno' });
    const r2 = avaliarFlag(f, null, { uid: 'u1', papel: 'aluno' });
    expect(r1.ativa).toBe(r2.ativa);
  });

  it('respeita audiencia por papel', () => {
    const f = {
      ...base,
      nome: 'ia.chat',
      ativo: true,
      rolloutPct: 100,
      audiencia: { papeis: ['coordenador'] as const },
    };
    expect(avaliarFlag(f, null, { uid: 'u1', papel: 'aluno' }).ativa).toBe(false);
    expect(avaliarFlag(f, null, { uid: 'u1', papel: 'coordenador' }).ativa).toBe(true);
  });
});
