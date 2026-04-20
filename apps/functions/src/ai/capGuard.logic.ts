// Lógica pura extraída do capGuard para testes sem dependência do Firestore.

import type { StatusCap } from '@minha-plataforma/shared';

export function statusPorConsumo(capUSD: number, consumoUSD: number): StatusCap {
  if (capUSD <= 0) return 'saudavel';
  const pct = consumoUSD / capUSD;
  if (pct >= 1) return 'bloqueado';
  if (pct >= 0.9) return 'aviso90';
  if (pct >= 0.7) return 'aviso70';
  return 'saudavel';
}

export function mesAtualYYYYMM(agora: Date = new Date()): string {
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}`;
}
