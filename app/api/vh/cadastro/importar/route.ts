import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { erro, exigirUsuario } from "@/lib/api";
import { lerCadastroImoveis } from "@/lib/vh-cadastro";
import type { LinhaPlanilha } from "@/lib/vh-planilha";

export const runtime = "nodejs";
export const maxDuration = 60;

const LIMITE_BYTES = 15 * 1024 * 1024;

/** Converte uma aba do Excel em linhas simples, que é o que a leitura espera. */
function paraLinhas(aba: ExcelJS.Worksheet): LinhaPlanilha[] {
  const linhas: LinhaPlanilha[] = [];
  aba.eachRow({ includeEmpty: true }, (row) => {
    const valores: LinhaPlanilha = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) valores.push(null);
      else if (v instanceof Date) valores.push(v.toISOString().slice(0, 10));
      else if (typeof v === "object" && "result" in v) valores.push(String(v.result ?? ""));
      else if (typeof v === "object" && "text" in v) valores.push(String(v.text ?? ""));
      else valores.push(v as string | number);
    });
    linhas.push(valores);
  });
  return linhas;
}

/**
 * Lê a aba de cadastro da planilha e devolve o que entendeu — sem gravar nada.
 *
 * A gravação é um segundo passo, com você olhando a lista. Importar direto
 * seria mais rápido e seria pior: cadastro errado só aparece um mês depois, na
 * conciliação, quando já não dá para saber de onde veio o número.
 */
export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return erro("Envio inválido.", 400);
  }

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return erro("Escolha a planilha.", 400);
  if (arquivo.size > LIMITE_BYTES) return erro("A planilha passa de 15 MB.", 413);
  if (!/\.(xlsx|xlsm)$/i.test(arquivo.name)) {
    return erro("Envie a planilha em .xlsx (o formato do Excel atual).", 415);
  }

  // As contas já cadastradas servem só para traduzir a abreviação da planilha.
  const { data: contas } = await supabase
    .from("accounts")
    .select("id, apelido")
    .eq("user_id", user.id);
  const apelidos = (contas ?? []).map((c) => String(c.apelido));

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await arquivo.arrayBuffer());
  } catch {
    return erro("Não consegui abrir a planilha. Ela está corrompida ou protegida por senha?", 422);
  }

  const abas = wb.worksheets.map((w) => w.name);
  if (abas.length === 0) return erro("A planilha não tem nenhuma aba.", 422);

  const pedida = String(form.get("aba") ?? "").trim();

  // Sem aba escolhida, tenta a que se chama "cadastro" e, se ela não render,
  // percorre as demais. Numa planilha com 40 abas de meses, exigir que a pessoa
  // acerte o nome de primeira seria transformar um clique em adivinhação.
  const ordem = pedida
    ? wb.worksheets.filter((w) => w.name === pedida)
    : [
        ...wb.worksheets.filter((w) => /cadastro|im[óo]ve/i.test(w.name)),
        ...wb.worksheets.filter((w) => !/cadastro|im[óo]ve/i.test(w.name)),
      ];

  if (ordem.length === 0) return erro(`A planilha não tem a aba "${pedida}".`, 404);

  for (const aba of ordem) {
    const leitura = lerCadastroImoveis(paraLinhas(aba), apelidos);
    if (leitura.contratos.length > 0 || (pedida && leitura.cabecalho)) {
      return NextResponse.json({ aba: aba.name, abas, ...leitura });
    }
  }

  return NextResponse.json({
    aba: null,
    abas,
    contratos: [],
    descartadas: [],
    cabecalho: null,
    camposEncontrados: [],
    camposAusentes: [],
    aviso:
      "Não encontrei nenhuma aba com colunas de imóvel, locatário e aluguel. " +
      "Escolha a aba na lista acima e tente de novo.",
  });
}
