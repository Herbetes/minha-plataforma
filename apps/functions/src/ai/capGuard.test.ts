import { describe, expect, it } from 'vitest';

import { mesAtualYYYYMM, statusPorConsumo } from './capGuard.logic.js';

describe('statusPorConsumo', () => {
  it('fica saudavel com cap zero', () => {
    expect(statusPorConsumo(0, 999)).toBe('saudavel');
  });
  it('saudavel abaixo de 70%', () => {
    expect(statusPorConsumo(100, 50)).toBe('saudavel');
  });
  it('aviso70 em 70%', () => {
    expect(statusPorConsumo(100, 70)).toBe('aviso70');
  });
  it('aviso90 em 90%', () => {
    expect(statusPorConsumo(100, 90)).toBe('aviso90');
  });
  it('bloqueado em 100% exato', () => {
    expect(statusPorConsumo(100, 100)).toBe('bloqueado');
  });
  it('bloqueado acima de 100%', () => {
    expect(statusPorConsumo(100, 150)).toBe('bloqueado');
  });
});

describe('mesAtualYYYYMM', () => {
  it('formata YYYY-MM com mês zero-padded', () => {
    expect(mesAtualYYYYMM(new Date(Date.UTC(2026, 0, 15)))).toBe('2026-01');
    expect(mesAtualYYYYMM(new Date(Date.UTC(2026, 10, 1)))).toBe('2026-11');
  });
});
