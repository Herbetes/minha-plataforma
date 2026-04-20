import type { StatusCap } from '@minha-plataforma/shared';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { logger } from '../utils/logger.js';

import { mesAtualYYYYMM, statusPorConsumo } from './capGuard.logic.js';

export interface EstadoCap {
  capUSD: number;
  consumoUSD: number;
  status: StatusCap;
  mesReferencia: string;
}

export interface ResultadoCheckCap {
  bloqueado: boolean;
  estado: EstadoCap;
}

/**
 * Verifica o cap ANTES de chamar LLM. Bloqueia se estouro.
 * Reseta contadores automaticamente quando muda o mês.
 * NÃO contabiliza consumo aqui — isso é feito por `registrarConsumoIA` após a chamada.
 */
export async function verificarCapAntes(orgId: string): Promise<ResultadoCheckCap> {
  const db = getFirestore();
  const refOrg = db.collection('organizacoes').doc(orgId);

  const snap = await refOrg.get();
  if (!snap.exists) {
    logger.error('Org inexistente ao verificar cap', { orgId });
    return {
      bloqueado: true,
      estado: { capUSD: 0, consumoUSD: 0, status: 'bloqueado', mesReferencia: mesAtualYYYYMM() },
    };
  }

  const dados = snap.data() as {
    capsCustoIAMesUSD?: number;
    consumoAcumuladoMesUSD?: number;
    statusCap?: StatusCap;
    mesReferencia?: string;
  };

  const mesAtual = mesAtualYYYYMM();
  const capUSD = dados.capsCustoIAMesUSD ?? 0;
  let consumoUSD = dados.consumoAcumuladoMesUSD ?? 0;
  let status = dados.statusCap ?? 'saudavel';

  if (dados.mesReferencia !== mesAtual) {
    // Virada de mês: zera contador e reabilita.
    await refOrg.update({
      consumoAcumuladoMesUSD: 0,
      mesReferencia: mesAtual,
      statusCap: 'saudavel',
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    consumoUSD = 0;
    status = 'saudavel';
  }

  const statusCalculado = statusPorConsumo(capUSD, consumoUSD);
  const bloqueado = statusCalculado === 'bloqueado';

  return {
    bloqueado,
    estado: { capUSD, consumoUSD, status: statusCalculado, mesReferencia: mesAtual },
  };
}

/**
 * Contabiliza consumo após chamada bem-sucedida (ou falha paga).
 * Atualiza statusCap se cruzou limiar.
 */
export async function registrarConsumoIA(orgId: string, custoUSD: number): Promise<void> {
  if (custoUSD <= 0) return;
  const db = getFirestore();
  const refOrg = db.collection('organizacoes').doc(orgId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(refOrg);
    if (!snap.exists) return;
    const dados = snap.data() as { capsCustoIAMesUSD?: number; consumoAcumuladoMesUSD?: number };
    const capUSD = dados.capsCustoIAMesUSD ?? 0;
    const novoConsumo = (dados.consumoAcumuladoMesUSD ?? 0) + custoUSD;
    const novoStatus = statusPorConsumo(capUSD, novoConsumo);
    tx.update(refOrg, {
      consumoAcumuladoMesUSD: novoConsumo,
      statusCap: novoStatus,
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  });
}
