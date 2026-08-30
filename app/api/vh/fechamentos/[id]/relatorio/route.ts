import { NextResponse } from "next/server";
import { erro, exigirUsuario } from "@/lib/api";
import { formatarCentavos } from "@/lib/vh";

export const runtime = "nodejs";
export const maxDuration = 60;

type Contexto = { params: Promise<{ id: string }> };

const MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function porExtenso(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${MES[Number(mes) - 1]?.toUpperCase() ?? mes} ${ano}`;
}

/**
 * Gera o relatório de conferência do mês.
 *
 * É montado por código, não pelo modelo. Um relatório contábil precisa somar
 * sempre igual; pedir para a IA redigir os números abriria espaço para
 * divergência entre o texto e o banco — que é o pior tipo de erro num
 * documento que vai para a contabilidade.
 */
export async function POST(_request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;

  const { data: fechamento } = await supabase
    .from("closings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!fechamento) return erro("Fechamento não encontrado.", 404);

  const [{ data: conciliacoes }, { data: despesas }, { data: pendentes }, { data: contas }] =
    await Promise.all([
      supabase
        .from("reconciliations")
        .select(
          "categoria, competencia, confianca, justificativa, status, " +
            "contracts ( imovel, locatario ), transactions ( data, historico, valor_centavos, account_id )",
        )
        .eq("user_id", user.id)
        .eq("closing_id", id),
      supabase
        .from("expenses")
        .select("tipo, descricao, valor_centavos")
        .eq("user_id", user.id)
        .eq("closing_id", id),
      supabase
        .from("transactions")
        .select("data, historico, valor_centavos, account_id")
        .eq("user_id", user.id)
        .eq("closing_id", id),
      supabase.from("accounts").select("id, apelido").eq("user_id", user.id),
    ]);

  const apelido = new Map((contas ?? []).map((c) => [c.id as string, c.apelido as string]));
  const linhas = (conciliacoes ?? []) as Array<Record<string, any>>;
  const aprovadas = linhas.filter((l) => l.status === "aprovada");

  const comProposta = new Set(
    linhas.map((l) => `${l.transactions?.data}|${l.transactions?.valor_centavos}`),
  );

  // ------------------------------------------------------------ agregações
  const alugueis = aprovadas.filter((l) => l.categoria === "aluguel");
  const receita = alugueis.reduce((s, l) => s + Number(l.transactions?.valor_centavos ?? 0), 0);
  const condominios = (despesas ?? []).filter((d) => d.tipo === "condominio");
  const totalCondominio = condominios.reduce((s, d) => s + Number(d.valor_centavos), 0);
  const iptu = (despesas ?? []).filter((d) => d.tipo === "iptu");
  const totalIptu = iptu.reduce((s, d) => s + Number(d.valor_centavos), 0);

  const naoAtribuidos = (pendentes ?? []).filter(
    (t) =>
      Number(t.valor_centavos) > 0 &&
      !comProposta.has(`${t.data}|${t.valor_centavos}`),
  );

  const dividendos = aprovadas.filter((l) => l.categoria === "dividendo");
  const darfs = aprovadas.filter((l) => l.categoria === "darf");
  const semDecisao = linhas.filter((l) => l.status === "proposta");

  // -------------------------------------------------------------- markdown
  const md: string[] = [];
  md.push(`# Conferência — ${porExtenso(fechamento.competencia as string)}`);
  md.push("");
  md.push(`Gerado em ${new Date().toLocaleString("pt-BR")}.`);
  md.push("");
  md.push("## Resumo");
  md.push("");
  md.push("| | |");
  md.push("|---|---:|");
  md.push(`| Receita de aluguéis | ${formatarCentavos(receita)} |`);
  md.push(`| Condomínios | (${formatarCentavos(totalCondominio)}) |`);
  md.push(`| IPTU | (${formatarCentavos(totalIptu)}) |`);
  md.push(`| **Receita líquida** | **${formatarCentavos(receita - totalCondominio - totalIptu)}** |`);
  md.push("");

  md.push("## Receitas por imóvel");
  md.push("");
  if (alugueis.length === 0) {
    md.push("_Nenhum aluguel conciliado e aprovado._");
  } else {
    const porImovel = new Map<string, Array<Record<string, any>>>();
    for (const l of alugueis) {
      const chave = l.contracts?.imovel ?? "(sem imóvel)";
      porImovel.set(chave, [...(porImovel.get(chave) ?? []), l]);
    }
    for (const [imovel, itens] of porImovel) {
      const total = itens.reduce((s, l) => s + Number(l.transactions?.valor_centavos ?? 0), 0);
      md.push(`### ${imovel} — ${formatarCentavos(total)}`);
      md.push("");
      itens.forEach((l, i) => {
        const t = l.transactions;
        md.push(
          `${i + 1}. ${t?.data} · ${formatarCentavos(Number(t?.valor_centavos ?? 0))} · ` +
            `${apelido.get(t?.account_id) ?? "conta não identificada"} · ${t?.historico}`,
        );
      });
      md.push("");
    }
  }

  md.push("## Depósitos não atribuídos");
  md.push("");
  if (naoAtribuidos.length === 0) {
    md.push("_Nenhum. Todo crédito do período foi analisado._");
  } else {
    md.push("| Data | Conta | Valor | Histórico |");
    md.push("|---|---|---:|---|");
    for (const t of naoAtribuidos) {
      md.push(
        `| ${t.data} | ${apelido.get(t.account_id as string) ?? "—"} | ` +
          `${formatarCentavos(Number(t.valor_centavos))} | ${t.historico} |`,
      );
    }
  }
  md.push("");

  md.push("## Dividendos");
  md.push("");
  if (dividendos.length === 0) md.push("_Nenhum dividendo no período._");
  else
    for (const l of dividendos) {
      md.push(
        `- ${l.transactions?.data} · ${formatarCentavos(Math.abs(Number(l.transactions?.valor_centavos ?? 0)))} · ${l.transactions?.historico}`,
      );
    }
  md.push("");

  md.push("## Tributos (DARF)");
  md.push("");
  if (darfs.length === 0) md.push("_Nenhum tributo pago no período._");
  else
    for (const l of darfs) {
      const conta = apelido.get(l.transactions?.account_id) ?? "conta não identificada";
      md.push(
        `- ${l.transactions?.data} · ${formatarCentavos(Math.abs(Number(l.transactions?.valor_centavos ?? 0)))} · ` +
          `pago da conta **${conta}** · ${l.justificativa}`,
      );
    }
  md.push("");

  if (semDecisao.length > 0) {
    md.push("## Pendências");
    md.push("");
    md.push(`**${semDecisao.length} proposta(s) ainda sem decisão.** O mês não pode ser fechado assim.`);
    md.push("");
  }

  const relatorio = md.join("\n");

  await supabase
    .from("closings")
    .update({
      relatorio_md: relatorio,
      receita_bruta_centavos: receita,
      iptu_centavos: totalIptu,
      pendencias: semDecisao.length + naoAtribuidos.length,
      status: fechamento.status === "aberto" ? "conferencia" : fechamento.status,
    })
    .eq("id", id);

  // Guarda o arquivo junto do mês, para não se perder.
  const caminho = `${user.id}/${fechamento.competencia}/Conferência ${porExtenso(fechamento.competencia as string)}.md`;
  await supabase.storage
    .from("vh")
    .upload(caminho, new Blob([relatorio], { type: "text/markdown" }), { upsert: true });

  await supabase.from("closing_files").delete()
    .eq("user_id", user.id).eq("closing_id", id).eq("direcao", "saida").eq("tipo", "relatorio");

  await supabase.from("closing_files").insert({
    user_id: user.id,
    closing_id: id,
    direcao: "saida",
    tipo: "relatorio",
    nome: `Conferência ${porExtenso(fechamento.competencia as string)}.md`,
    storage_path: caminho,
    bytes: relatorio.length,
    status: "processado",
  });

  return NextResponse.json({ relatorio, pendencias: semDecisao.length + naoAtribuidos.length });
}
