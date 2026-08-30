import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { impressaoDigital, lerCSV, lerOFX, type Lancamento } from "@/lib/vh";
import {
  classificarArquivo,
  competenciaDominante,
  conferirSaldo,
  identificarConta,
  lerExtratoPDF,
  valoresConferem,
} from "@/lib/vh-arquivos";
import { casarImovel, lerCondominios, type LinhaPlanilha } from "@/lib/vh-planilha";

export const runtime = "nodejs";
export const maxDuration = 120;

type Contexto = { params: Promise<{ id: string }> };

const schema = z.object({
  storagePath: z.string().trim().min(1),
  nome: z.string().trim().min(1).max(200),
  bytes: z.number().int().nonnegative().optional(),
  /** Quando o usuário já sabe de qual conta é. Se não vier, tentamos deduzir. */
  contaId: z.uuid().nullable().optional(),
});

/**
 * Recebe um arquivo já enviado ao armazenamento e decide o que ele é.
 *
 * Uma caixa de entrada só: extrato em PDF, CSV, OFX ou a planilha de
 * condomínios. A classificação é pelo CONTEÚDO — nome de arquivo é a
 * informação menos confiável que existe.
 */
export async function POST(request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id: closingId } = await params;

  const { data: fechamento } = await supabase
    .from("closings")
    .select("id, competencia, status")
    .eq("id", closingId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!fechamento) return erro("Fechamento não encontrado.", 404);
  if (fechamento.status === "fechado") {
    return erro("Este mês está fechado. Reabra antes de acrescentar arquivos.", 422);
  }

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Requisição inválida.", 400);
  }

  const { storagePath, nome, bytes, contaId } = parsed.data;
  if (!storagePath.startsWith(`${user.id}/`)) {
    return erro("Caminho de arquivo não pertence a você.", 403);
  }

  const { data: registro } = await supabase
    .from("closing_files")
    .insert({
      user_id: user.id,
      closing_id: closingId,
      direcao: "entrada",
      tipo: "desconhecido",
      nome,
      storage_path: storagePath,
      bytes: bytes ?? null,
      account_id: contaId ?? null,
    })
    .select("id")
    .single();

  const fileId = registro?.id as string | undefined;

  async function concluir(tipo: string, detalhe: string, status: "processado" | "erro") {
    if (fileId) {
      await supabase
        .from("closing_files")
        .update({ tipo, detalhe, status })
        .eq("id", fileId);
    }
  }

  try {
    const { data: arquivo, error: downloadError } = await supabase.storage
      .from("vh")
      .download(storagePath);

    if (downloadError || !arquivo) {
      await concluir("desconhecido", "Arquivo não encontrado no armazenamento.", "erro");
      return erro("Arquivo não encontrado no armazenamento.", 404);
    }

    const buffer = await arquivo.arrayBuffer();
    const ehExcel = /\.(xlsx|xlsm|xls)$/i.test(nome);

    // ------------------------------------------------------------- planilha
    if (ehExcel) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      // Prefere a aba cujo nome lembra a competência; senão, a primeira.
      const [ano, mes] = fechamento.competencia.split("-");
      const nomesDeMes = [
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
      ];
      const alvo = nomesDeMes[Number(mes) - 1];

      const aba =
        wb.worksheets.find(
          (w) =>
            w.name.toLowerCase().includes(alvo) ||
            w.name.includes(ano) ||
            w.name.includes(mes),
        ) ?? wb.worksheets[0];

      if (!aba) {
        await concluir("planilha", "A planilha não tem nenhuma aba legível.", "erro");
        return erro("A planilha não tem nenhuma aba legível.", 422);
      }

      const linhas: LinhaPlanilha[] = [];
      aba.eachRow({ includeEmpty: true }, (row) => {
        const valores: LinhaPlanilha = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value;
          if (v === null || v === undefined) valores.push(null);
          else if (typeof v === "object" && "result" in v) valores.push(String(v.result ?? ""));
          else if (typeof v === "object" && "text" in v) valores.push(String(v.text ?? ""));
          else valores.push(v as string | number);
        });
        linhas.push(valores);
      });

      const { condominios, cabecalhoEncontrado } = lerCondominios(linhas);

      if (condominios.length === 0) {
        const achado = cabecalhoEncontrado?.filter(Boolean).join(", ") ?? "nada";
        const msg =
          `Não achei colunas de imóvel e valor na aba "${aba.name}". ` +
          `As colunas que encontrei foram: ${achado}.`;
        await concluir("planilha", msg, "erro");
        return erro(msg, 422);
      }

      const { data: contratos } = await supabase
        .from("contracts")
        .select("id, imovel")
        .eq("user_id", user.id);

      const cadastro = (contratos ?? []).map((c) => ({
        id: c.id as string,
        imovel: c.imovel as string,
      }));

      // Substitui os condomínios deste mês, para reenviar a planilha corrigida
      // não somar em cima da versão anterior.
      await supabase
        .from("expenses")
        .delete()
        .eq("user_id", user.id)
        .eq("closing_id", closingId)
        .eq("tipo", "condominio");

      let semImovel = 0;
      const linhasParaGravar = condominios.map((c) => {
        const casado = casarImovel(c.imovel, cadastro);
        if (!casado) semImovel++;
        return {
          user_id: user.id,
          closing_id: closingId,
          contract_id: casado?.id ?? null,
          tipo: "condominio",
          descricao: c.imovel,
          valor_centavos: c.valorCentavos,
          origem: nome,
        };
      });

      await supabase.from("expenses").insert(linhasParaGravar);

      const total = condominios.reduce((s, c) => s + c.valorCentavos, 0);
      await supabase
        .from("closings")
        .update({ condominio_centavos: total })
        .eq("id", closingId);

      const detalhe =
        `${condominios.length} condomínios lidos da aba "${aba.name}"` +
        (semImovel ? ` · ${semImovel} sem imóvel correspondente no cadastro` : "");

      await concluir("planilha", detalhe, "processado");
      return NextResponse.json({ tipo: "planilha", condominios: condominios.length, semImovel, detalhe });
    }

    // -------------------------------------------------------------- extrato
    let texto: string;
    if (/\.pdf$/i.test(nome)) {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const extraido = await extractText(pdf, { mergePages: true });
      texto = extraido.text;
    } else {
      texto = new TextDecoder().decode(buffer);
    }

    const tipo = classificarArquivo(nome, texto);

    if (tipo === "contrato") {
      await concluir(
        "contrato",
        "Isto parece um contrato de locação. Envie-o pelo Cofre; o cadastro ainda não é atualizado automaticamente.",
        "processado",
      );
      return NextResponse.json({
        tipo: "contrato",
        detalhe: "Parece um contrato. Use o Cofre para guardá-lo e consultá-lo.",
      });
    }

    if (tipo === "desconhecido") {
      await concluir("desconhecido", "Não reconheci este arquivo.", "erro");
      return erro(
        "Não reconheci este arquivo. Esperava extrato (PDF, CSV ou OFX) ou a planilha de condomínios.",
        422,
      );
    }

    let lancamentos: Lancamento[];
    let alerta: string | null = null;

    if (/\.pdf$/i.test(nome)) {
      const leitura = lerExtratoPDF(texto);
      lancamentos = leitura.lancamentos;

      // A trava: valor que não está escrito no documento não entra no banco.
      const conferencia = valoresConferem(texto, lancamentos);
      if (!conferencia.ok) {
        const msg = `Valores lidos que não aparecem no documento: ${conferencia.ausentes.join(", ")}.`;
        await concluir("extrato", msg, "erro");
        return erro(msg, 422);
      }

      const saldo = conferirSaldo(leitura);
      if (saldo.confere === false) {
        alerta =
          `Atenção: o extrato não fecha por ${(Math.abs(saldo.diferencaCentavos ?? 0) / 100).toFixed(2)}. ` +
          "Algum lançamento pode não ter sido lido.";
      }
    } else if (/<STMTTRN>/i.test(texto)) {
      lancamentos = lerOFX(texto).lancamentos;
    } else {
      lancamentos = lerCSV(texto).lancamentos;
    }

    if (lancamentos.length === 0) {
      await concluir("extrato", "Nenhum lançamento reconhecido.", "erro");
      return erro("Não reconheci nenhum lançamento neste extrato.", 422);
    }

    // Sem conta informada, tenta deduzir pelo cabeçalho do extrato.
    let contaFinal = contaId ?? null;
    if (!contaFinal) {
      const { agencia, conta } = identificarConta(texto);
      if (conta) {
        const { data: contas } = await supabase
          .from("accounts")
          .select("id, numero, agencia")
          .eq("user_id", user.id);

        const digitos = (s: string | null) => (s ?? "").replace(/\D/g, "");
        const achada = (contas ?? []).find(
          (a) =>
            digitos(a.numero as string) === digitos(conta) &&
            (!agencia || !a.agencia || digitos(a.agencia as string) === digitos(agencia)),
        );
        contaFinal = (achada?.id as string) ?? null;
      }
    }

    if (!contaFinal) {
      const msg =
        "Não consegui identificar de qual conta é este extrato. " +
        "Escolha a conta na tela e envie de novo.";
      await concluir("extrato", msg, "erro");
      return erro(msg, 422);
    }

    const competencia = competenciaDominante(lancamentos);

    const { data: extrato } = await supabase
      .from("statements")
      .insert({
        user_id: user.id,
        closing_id: closingId,
        account_id: contaFinal,
        arquivo_nome: nome,
        origem: /\.pdf$/i.test(nome) ? "csv" : /<STMTTRN>/i.test(texto) ? "ofx" : "csv",
        periodo_inicio: lancamentos.map((l) => l.data).sort()[0],
        periodo_fim: lancamentos.map((l) => l.data).sort().at(-1),
        total: lancamentos.length,
      })
      .select("id")
      .single();

    const { data: inseridos } = await supabase
      .from("transactions")
      .upsert(
        lancamentos.map((l) => ({
          user_id: user.id,
          statement_id: extrato?.id ?? null,
          closing_id: closingId,
          account_id: contaFinal,
          data: l.data,
          historico: l.historico,
          documento: l.documento,
          valor_centavos: l.valorCentavos,
          impressao: impressaoDigital({ ...l, contaId: contaFinal }),
        })),
        { onConflict: "user_id,account_id,impressao", ignoreDuplicates: true },
      )
      .select("id");

    const novos = inseridos?.length ?? 0;
    const detalhe =
      `${lancamentos.length} lançamentos · ${novos} novos · ` +
      `${lancamentos.length - novos} já existiam` +
      (competencia && competencia !== fechamento.competencia
        ? ` · atenção: os lançamentos são de ${competencia}, não de ${fechamento.competencia}`
        : "") +
      (alerta ? ` · ${alerta}` : "");

    await concluir("extrato", detalhe, "processado");

    return NextResponse.json({
      tipo: "extrato",
      lidos: lancamentos.length,
      novos,
      alerta,
      competenciaDetectada: competencia,
      detalhe,
    });
  } catch (e) {
    console.error("[api/vh/entrada] falha", e);
    await concluir("desconhecido", "Falha ao processar o arquivo.", "erro");
    return erro("Não consegui ler este arquivo.", 500);
  }
}
