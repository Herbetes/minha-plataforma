import { describe, expect, it } from 'vitest';
import { zQuestao } from './questao.js';

const base = {
  disciplinaId: 'mat',
  dificuldade: 'medio' as const,
  tags: [],
  enunciado: 'Quanto é 2+2?',
  versao: 1,
  ativa: true,
  criadoPor: 'uid1',
  criadoEm: '2026-04-20T12:00:00Z',
  atualizadoEm: '2026-04-20T12:00:00Z',
};

describe('zQuestao', () => {
  it('aceita objetiva com uma alternativa correta', () => {
    const r = zQuestao.safeParse({
      ...base,
      tipo: 'objetiva',
      alternativas: [
        { id: 'a', texto: '3', correta: false },
        { id: 'b', texto: '4', correta: true },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejeita objetiva sem alternativa correta', () => {
    const r = zQuestao.safeParse({
      ...base,
      tipo: 'objetiva',
      alternativas: [
        { id: 'a', texto: '3', correta: false },
        { id: 'b', texto: '4', correta: false },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejeita objetiva com duas alternativas corretas', () => {
    const r = zQuestao.safeParse({
      ...base,
      tipo: 'objetiva',
      alternativas: [
        { id: 'a', texto: '3', correta: true },
        { id: 'b', texto: '4', correta: true },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('exige critério de correção em dissertativa', () => {
    const r = zQuestao.safeParse({ ...base, tipo: 'dissertativa' });
    expect(r.success).toBe(false);
  });
});
