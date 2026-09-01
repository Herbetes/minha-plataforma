import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type Alerta,
  type ContratoRadar,
  alertasDeFechamento,
  alertasDeInadimplencia,
  alertasDeReajuste,
  alertasDeVencimento,
  montarAlertas,
} from "@/lib/radar";

/**
 * Busca no banco o que o Radar precisa e devolve os alertas já calculados.
 *
 * Recebe o cliente pronto de fora porque isto roda em dois contextos: pela tela
 * (cliente com a sessão do usuário, protegido pelo RLS) e pelo agendamento
 * (cliente de serviço, sem sessão). Em ambos, todo filtro por `user_id` está
 * escrito explicitamente — no caminho do agendamento é ele que substitui o RLS.
 */
export async function coletarAlertas(
  supabase: SupabaseClient,
  userId: string,
  hoje: string,
): Promise<Alerta[]> {
  const competenciaAtual = hoje.slice(0, 7);

  const [contratosRes, recebidosRes, fechamentosRes] = await Promise.all([
    supabase
      .from("contracts")
      .select(
        "id, imovel, locatario, valor_centavos, dia_vencimento, vigencia_fim, mes_reajuste, indice_reajuste, ativo",
      )
      .eq("user_id", userId)
      .eq("ativo", true),

    // Só o que foi APROVADO conta como recebido. Proposta do agente ainda não
    // decidida não pode inocentar um inquilino nem acusar outro.
    supabase
      .from("reconciliations")
      .select("contract_id, transactions (valor_centavos)")
      .eq("user_id", userId)
      .eq("status", "aprovada")
      .eq("categoria", "aluguel")
      .eq("competencia", competenciaAtual),

    supabase
      .from("closings")
      .select("competencia, status, pendencias")
      .eq("user_id", userId)
      .order("competencia", { ascending: false })
      .limit(12),
  ]);

  if (contratosRes.error) throw new Error("Não foi possível ler os contratos.");
  if (recebidosRes.error) throw new Error("Não foi possível ler as conciliações.");
  if (fechamentosRes.error) throw new Error("Não foi possível ler os fechamentos.");

  const contratos: ContratoRadar[] = (contratosRes.data ?? []).map((c) => ({
    id: String(c.id),
    imovel: String(c.imovel ?? ""),
    locatario: String(c.locatario ?? ""),
    valorCentavos: Number(c.valor_centavos ?? 0),
    diaVencimento: c.dia_vencimento === null ? null : Number(c.dia_vencimento),
    vigenciaFim: c.vigencia_fim ? String(c.vigencia_fim) : null,
    mesReajuste: c.mes_reajuste === null ? null : Number(c.mes_reajuste),
    indiceReajuste: c.indice_reajuste ? String(c.indice_reajuste) : null,
    ativo: c.ativo !== false,
  }));

  const recebidos = new Map<string, number>();
  for (const linha of recebidosRes.data ?? []) {
    const contractId = linha.contract_id ? String(linha.contract_id) : null;
    if (!contractId) continue;
    // O join volta objeto ou array conforme a cardinalidade que o PostgREST
    // inferir; normalizar aqui evita depender dessa inferência.
    const t = linha.transactions as
      | { valor_centavos: number | null }
      | { valor_centavos: number | null }[]
      | null;
    const primeiro = Array.isArray(t) ? t[0] : t;
    const valor = Number(primeiro?.valor_centavos ?? 0);
    recebidos.set(contractId, (recebidos.get(contractId) ?? 0) + valor);
  }

  const fechamentos = (fechamentosRes.data ?? []).map((f) => ({
    competencia: String(f.competencia),
    status: String(f.status),
    pendencias: Number(f.pendencias ?? 0),
  }));

  return montarAlertas([
    alertasDeVencimento(contratos, hoje),
    alertasDeReajuste(contratos, hoje),
    alertasDeInadimplencia(contratos, recebidos, hoje),
    alertasDeFechamento(fechamentos, hoje),
  ]);
}

/** Data de hoje em São Paulo. O servidor da Vercel roda em UTC. */
export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
