import { erro, exigirUsuario } from "@/lib/api";
import {
  type ConciliacaoLinha,
  type ContratoLinha,
  type TransacaoLinha,
  montarRepasse,
} from "@/lib/vh-repasse";

export const runtime = "nodejs";
export const maxDuration = 60;

type Contexto = { params: Promise<{ id: string }> };

/**
 * Baixa o repasse do mês: o arquivo que a skill lê para escrever a aba do
 * MOVIMENTO VH.
 *
 * Sai como download em vez de ficar só na tela porque o destino dele é a
 * pasta do mês, ao lado dos extratos — é assim que a skill acha o arquivo.
 */
export async function GET(_request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;

  const { data: fechamento } = await supabase
    .from("closings")
    .select("id, competencia, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!fechamento) return erro("Fechamento não encontrado.", 404);

  const [contratos, conciliacoes, transacoes, despesas, contas] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, imovel, locatario, valor_centavos, account_id, ativo")
      .eq("user_id", user.id),
    supabase
      .from("reconciliations")
      .select(
        "categoria, status, confianca, justificativa, contract_id, " +
          "transactions ( data, historico, valor_centavos, account_id )",
      )
      .eq("user_id", user.id)
      .eq("closing_id", id),
    supabase
      .from("transactions")
      .select("data, historico, valor_centavos, account_id")
      .eq("user_id", user.id)
      .eq("closing_id", id),
    supabase
      .from("expenses")
      .select("tipo, descricao, valor_centavos")
      .eq("user_id", user.id)
      .eq("closing_id", id),
    supabase.from("accounts").select("id, apelido").eq("user_id", user.id),
  ]);

  const repasse = montarRepasse({
    competencia: String(fechamento.competencia),
    status: String(fechamento.status),
    geradoEm: new Date().toISOString(),
    contratos: (contratos.data ?? []) as ContratoLinha[],
    conciliacoes: (conciliacoes.data ?? []) as unknown as ConciliacaoLinha[],
    transacoes: (transacoes.data ?? []) as TransacaoLinha[],
    despesas: (despesas.data ?? []) as { tipo: string; descricao: string | null; valor_centavos: number }[],
    contas: (contas.data ?? []) as { id: string; apelido: string }[],
  });

  const nome = `REPASSE VH ${fechamento.competencia}.json`;

  return new Response(JSON.stringify(repasse, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      // O mês pode mudar entre dois cliques; servir cópia velha aqui seria
      // entregar para a contabilidade um número que já foi corrigido.
      "Cache-Control": "no-store",
    },
  });
}
