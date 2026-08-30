import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicApiKey, anthropicModel } from "@/lib/env";
import { VH_SYSTEM_PROMPT_V1 } from "@/prompts/vh";
import {
  type Contrato,
  type Lancamento,
  candidatos,
  competencia,
  formatarCentavos,
} from "@/lib/vh";

/** Teto de idas ao modelo. Sem ele, um laço confuso vira conta aberta. */
const MAX_ITERACOES = 30;

/** Quantos lançamentos entram numa execução. */
const LOTE = 40;

type Contexto = {
  supabase: SupabaseClient;
  userId: string;
  runId: string;
  closingId: string | null;
  passo: number;
};

/**
 * Registra cada chamada de ferramenta.
 *
 * É o que permite responder "por que o agente decidiu isso?" meses depois. Sem
 * trilha, um agente é uma caixa preta mexendo nos seus números.
 */
async function registrarPasso(
  ctx: Contexto,
  ferramenta: string,
  entrada: unknown,
  saida: unknown,
) {
  ctx.passo += 1;

  // A trilha serve para auditar a decisão, não para virar uma segunda cópia do
  // banco. Quando a saída é grande demais, guarda um recorte legível — cortar
  // o JSON no meio produziria texto inválido e derrubaria a gravação.
  const bruto = JSON.stringify(saida ?? null);
  const saidaGravada =
    bruto.length > 8000
      ? { truncado: true, tamanho: bruto.length, inicio: bruto.slice(0, 4000) }
      : (saida ?? null);

  const { error } = await ctx.supabase.from("agent_steps").insert({
    run_id: ctx.runId,
    user_id: ctx.userId,
    ordem: ctx.passo,
    ferramenta,
    entrada: entrada ?? null,
    saida: saidaGravada,
  });

  // Falha de auditoria não pode derrubar a conciliação em andamento, mas
  // também não pode passar em silêncio.
  if (error) console.error("[vh-agente] falha ao gravar passo", ferramenta, error);
}

function montarFerramentas(ctx: Contexto) {
  /** Só leitura: o cadastro contra o qual o extrato é conferido. */
  const listarContratos = betaZodTool({
    name: "listar_contratos_ativos",
    description:
      "Lista os contratos de locação ativos, com locatário, valor do aluguel e dia de vencimento.",
    inputSchema: z.object({}),
    run: async () => {
      const [{ data }, { data: contas }] = await Promise.all([
        ctx.supabase
          .from("contracts")
          .select("id, imovel, locatario, documento, valor_centavos, dia_vencimento, account_id, padroes")
          .eq("user_id", ctx.userId)
          .eq("ativo", true)
          .order("locatario"),
        ctx.supabase
          .from("accounts")
          .select("id, apelido, tipo")
          .eq("user_id", ctx.userId),
      ]);

      const apelido = new Map(
        (contas ?? []).map((a) => [a.id as string, a.apelido as string]),
      );

      const saida = (data ?? []).map((c) => ({
        contrato_id: c.id,
        imovel: c.imovel,
        locatario: c.locatario,
        documento: c.documento,
        valor: formatarCentavos(Number(c.valor_centavos)),
        dia_vencimento: c.dia_vencimento,
        conta_destino: c.account_id ? apelido.get(c.account_id as string) : null,
        padroes_de_pagador: c.padroes ?? [],
      }));

      await registrarPasso(ctx, "listar_contratos_ativos", {}, saida);
      return JSON.stringify(saida);
    },
  });

  /** Só leitura: lançamentos que ainda não têm proposta. */
  const listarLancamentos = betaZodTool({
    name: "listar_lancamentos_pendentes",
    description:
      "Lista os lançamentos do extrato que ainda não têm proposta de conciliação.",
    inputSchema: z.object({}),
    run: async () => {
      const { data: jaPropostos } = await ctx.supabase
        .from("reconciliations")
        .select("transaction_id")
        .eq("user_id", ctx.userId);

      // Trabalha sobre o mês aberto, não sobre a base inteira.


      const excluir = new Set((jaPropostos ?? []).map((r) => r.transaction_id as string));

      const [{ data }, { data: contas }] = await Promise.all([
        (ctx.closingId
          ? ctx.supabase
              .from("transactions")
              .select("id, data, historico, documento, valor_centavos, account_id")
              .eq("user_id", ctx.userId)
              .eq("closing_id", ctx.closingId)
          : ctx.supabase
              .from("transactions")
              .select("id, data, historico, documento, valor_centavos, account_id")
              .eq("user_id", ctx.userId)
        )
          .order("data", { ascending: true })
          .limit(LOTE + excluir.size),
        ctx.supabase
          .from("accounts")
          .select("id, apelido, tipo")
          .eq("user_id", ctx.userId),
      ]);

      const conta = new Map(
        (contas ?? []).map((a) => [
          a.id as string,
          { apelido: a.apelido as string, tipo: a.tipo as string },
        ]),
      );

      const saida = (data ?? [])
        .filter((t) => !excluir.has(t.id as string))
        .slice(0, LOTE)
        .map((t) => {
          const c = t.account_id ? conta.get(t.account_id as string) : undefined;
          return {
            lancamento_id: t.id,
            data: t.data,
            historico: t.historico,
            documento: t.documento,
            valor: formatarCentavos(Number(t.valor_centavos)),
            tipo: Number(t.valor_centavos) >= 0 ? "crédito" : "débito",
            conta: c?.apelido ?? null,
            // O tipo da conta decide se um DARF é tributo comum ou
            // empréstimo do sócio à empresa.
            conta_e_pessoa_fisica: c ? c.tipo === "pf" : null,
          };
        });

      await registrarPasso(ctx, "listar_lancamentos_pendentes", {}, { total: saida.length });
      return JSON.stringify(saida);
    },
  });

  /**
   * A aritmética da conciliação, feita por código.
   *
   * Comparar valor e data é conta: código faz igual toda vez, de graça, e dá
   * para testar. Deixar isso com o modelo seria caro, instável e impossível de
   * verificar.
   */
  const pontuarCandidatos = betaZodTool({
    name: "pontuar_candidatos",
    description:
      "Para um lançamento, devolve os contratos mais prováveis com pontuação de 0 a 100 e os motivos de cada nota. A pontuação é calculada por código comparando valor, data, nome e documento.",
    inputSchema: z.object({
      lancamento_id: z.string().describe("id do lançamento devolvido por listar_lancamentos_pendentes"),
    }),
    run: async ({ lancamento_id }) => {
      const { data: t } = await ctx.supabase
        .from("transactions")
        .select("id, data, historico, documento, valor_centavos, account_id")
        .eq("id", lancamento_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();

      if (!t) {
        const erro = { erro: "Lançamento não encontrado." };
        await registrarPasso(ctx, "pontuar_candidatos", { lancamento_id }, erro);
        return JSON.stringify(erro);
      }

      const { data: cs } = await ctx.supabase
        .from("contracts")
        .select("id, imovel, locatario, documento, valor_centavos, dia_vencimento, account_id, padroes")
        .eq("user_id", ctx.userId)
        .eq("ativo", true);

      const lancamento: Lancamento = {
        data: t.data as string,
        historico: t.historico as string,
        documento: (t.documento as string) ?? null,
        valorCentavos: Number(t.valor_centavos),
        contaId: (t.account_id as string) ?? null,
      };

      const contratos: Contrato[] = (cs ?? []).map((c) => ({
        id: c.id as string,
        imovel: c.imovel as string,
        locatario: c.locatario as string,
        documento: (c.documento as string) ?? null,
        valorCentavos: Number(c.valor_centavos),
        diaVencimento: (c.dia_vencimento as number) ?? null,
        contaId: (c.account_id as string) ?? null,
        padroes: (c.padroes as string[]) ?? [],
      }));

      const saida = {
        lancamento: {
          data: lancamento.data,
          historico: lancamento.historico,
          valor: formatarCentavos(lancamento.valorCentavos),
        },
        candidatos: candidatos(lancamento, contratos).map((c) => ({
          contrato_id: c.contratoId,
          locatario: c.locatario,
          pontuacao: c.score,
          motivos: c.motivos,
        })),
      };

      await registrarPasso(ctx, "pontuar_candidatos", { lancamento_id }, saida);
      return JSON.stringify(saida);
    },
  });

  /**
   * A única ferramenta que escreve — e ela escreve PROPOSTA, não verdade.
   *
   * Virar 'aprovada' exige um clique humano na tela. É a diferença entre um
   * agente que ajuda e um agente que mexe na contabilidade sozinho.
   */
  const registrarProposta = betaZodTool({
    name: "registrar_proposta",
    description:
      "Registra a proposta de conciliação de um lançamento. A proposta fica pendente de aprovação humana — ela não altera nada de definitivo.",
    inputSchema: z.object({
      lancamento_id: z.string(),
      categoria: z.enum(["aluguel", "dividendo", "darf", "outro"]),
      confianca: z.number().int().min(0).max(100)
        .describe("0 a 100. Não infle: proposta errada com confiança alta faz o humano aprovar no automático."),
      justificativa: z.string().min(5)
        .describe("Em português, o que te convenceu: valor, data, o que estava no histórico."),
      contrato_id: z.string().nullable().optional()
        .describe("Obrigatório quando a categoria é aluguel; vazio nas demais."),
    }),
    run: async (input) => {
      const { data: t } = await ctx.supabase
        .from("transactions")
        .select("id, data")
        .eq("id", input.lancamento_id)
        .eq("user_id", ctx.userId)
        .maybeSingle();

      if (!t) {
        const erro = { erro: "Lançamento não encontrado." };
        await registrarPasso(ctx, "registrar_proposta", input, erro);
        return JSON.stringify(erro);
      }

      let contratoId: string | null = input.contrato_id ?? null;
      let diaVencimento: number | null = null;

      if (contratoId) {
        const { data: c } = await ctx.supabase
          .from("contracts")
          .select("id, dia_vencimento")
          .eq("id", contratoId)
          .eq("user_id", ctx.userId)
          .maybeSingle();

        // Contrato inventado não entra no banco: vira proposta sem contrato,
        // com a confiança derrubada, para a pessoa olhar.
        if (!c) {
          contratoId = null;
        } else {
          diaVencimento = (c.dia_vencimento as number) ?? null;
        }
      }

      const registro = {
        user_id: ctx.userId,
        transaction_id: input.lancamento_id,
        contract_id: contratoId,
        categoria: input.categoria,
        competencia: competencia(t.data as string, diaVencimento),
        confianca: contratoId === null && input.categoria === "aluguel"
          ? Math.min(input.confianca, 30)
          : input.confianca,
        justificativa:
          contratoId === null && input.categoria === "aluguel"
            ? `${input.justificativa}\n\n[Sistema: o contrato indicado não existe no cadastro.]`
            : input.justificativa,
        status: "proposta",
        run_id: ctx.runId,
        closing_id: ctx.closingId,
      };

      const { error } = await ctx.supabase
        .from("reconciliations")
        .upsert(registro, { onConflict: "transaction_id" });

      const saida = error
        ? { erro: error.message }
        : { ok: true, competencia: registro.competencia };

      await registrarPasso(ctx, "registrar_proposta", input, saida);
      return JSON.stringify(saida);
    },
  });

  /** Só leitura: quem são os sócios, para reconhecer dividendo. */
  const listarSocios = betaZodTool({
    name: "listar_socios",
    description:
      "Lista os sócios cadastrados. Um PIX ou TED enviado a um deles é dividendo, não despesa.",
    inputSchema: z.object({}),
    run: async () => {
      const { data } = await ctx.supabase
        .from("partners")
        .select("nome, documento")
        .eq("user_id", ctx.userId)
        .eq("ativo", true)
        .order("nome");

      const saida = (data ?? []).map((s) => ({ nome: s.nome, documento: s.documento }));
      await registrarPasso(ctx, "listar_socios", {}, saida);
      return JSON.stringify(saida);
    },
  });

  return [
    listarContratos,
    listarLancamentos,
    listarSocios,
    pontuarCandidatos,
    registrarProposta,
  ];
}

export type ResultadoAgente = {
  runId: string;
  resumo: string;
  propostas: number;
  iteracoes: number;
  inputTokens: number;
  outputTokens: number;
};

/** Roda uma conciliação completa e devolve o resumo escrito pelo agente. */
export async function conciliar(
  supabase: SupabaseClient,
  userId: string,
  closingId: string | null,
): Promise<ResultadoAgente> {
  const modelo = anthropicModel();

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      user_id: userId,
      agente: "vh-conciliacao",
      closing_id: closingId,
      modelo,
      status: "executando",
    })
    .select("id")
    .single();

  if (runError || !run) throw new Error("Não foi possível abrir a execução.");

  const ctx: Contexto = {
    supabase,
    userId,
    runId: run.id as string,
    closingId,
    passo: 0,
  };
  const anthropic = new Anthropic({ apiKey: anthropicApiKey() });

  try {
    const runner = anthropic.beta.messages.toolRunner({
      model: modelo,
      max_tokens: 16000,
      max_iterations: MAX_ITERACOES,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: VH_SYSTEM_PROMPT_V1,
      tools: montarFerramentas(ctx),
      messages: [
        {
          role: "user",
          content:
            "Concilie os lançamentos pendentes contra os contratos ativos. " +
            "Comece listando contratos, sócios e lançamentos. Repare em qual conta " +
            "cada lançamento caiu. Registre uma proposta para cada um.",
        },
      ],
    });

    let iteracoes = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let resumo = "";

    for await (const mensagem of runner) {
      iteracoes += 1;
      inputTokens += mensagem.usage?.input_tokens ?? 0;
      outputTokens += mensagem.usage?.output_tokens ?? 0;

      for (const bloco of mensagem.content) {
        if (bloco.type === "text" && bloco.text.trim()) resumo = bloco.text;
      }
    }

    const { count } = await supabase
      .from("reconciliations")
      .select("id", { count: "exact", head: true })
      .eq("run_id", ctx.runId);

    const propostas = count ?? 0;

    await supabase
      .from("agent_runs")
      .update({
        status: "concluido",
        iteracoes,
        propostas,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        terminado_em: new Date().toISOString(),
      })
      .eq("id", ctx.runId);

    return {
      runId: ctx.runId,
      resumo: resumo || "O agente terminou sem escrever um resumo.",
      propostas,
      iteracoes,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    await supabase
      .from("agent_runs")
      .update({
        status: "erro",
        erro: error instanceof Error ? error.message : String(error),
        terminado_em: new Date().toISOString(),
      })
      .eq("id", ctx.runId);

    throw error;
  }
}
