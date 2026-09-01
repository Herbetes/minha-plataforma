import { type Lancamento, paraCentavos, paraDataISO } from "./vh";

/**
 * Leitura dos arquivos que entram no fechamento: extrato em PDF e planilha.
 *
 * Tudo aqui é determinístico e testável. A leitura assistida pelo modelo é o
 * plano B, e mesmo ela passa pela validação daqui antes de virar lançamento.
 */

// ------------------------------------------------------- classificação

export type TipoArquivo = "extrato" | "planilha" | "contrato" | "desconhecido";

/**
 * Descobre o que é o arquivo pelo conteúdo, não pelo nome.
 *
 * Nome de arquivo é a informação menos confiável que existe — todo mundo
 * renomeia. O conteúdo não mente.
 */
export function classificarArquivo(nome: string, texto: string): TipoArquivo {
  const n = nome.toLowerCase();
  const t = texto.slice(0, 6000).toLowerCase();

  if (/\.(xlsx|xls|xlsm)$/.test(n)) return "planilha";
  if (/\.ofx$/.test(n) || /<stmttrn>/i.test(texto)) return "extrato";

  const pareceContrato =
    /\blocador\b/.test(t) &&
    (/\blocat[áa]ri[oa]\b/.test(t) || /\bcl[áa]usula\b/.test(t));
  if (pareceContrato) return "contrato";

  const pareceExtrato =
    /extrato/.test(t) ||
    /saldo\s+anterior/.test(t) ||
    (/ag[êe]ncia/.test(t) && /conta\s+corrente/.test(t)) ||
    /hist[óo]rico/.test(t);
  if (pareceExtrato) return "extrato";

  if (/\.csv$/.test(n)) return "extrato";

  return "desconhecido";
}

/** Agência e conta que aparecem no cabeçalho do extrato, quando aparecem. */
export function identificarConta(texto: string): { agencia: string | null; conta: string | null } {
  const cabecalho = texto.slice(0, 3000);
  const agencia = cabecalho.match(/ag[êe]ncia[:\s]*([\d.-]{3,10})/i)?.[1] ?? null;
  const conta = cabecalho.match(/conta[:\s]*(?:corrente[:\s]*)?([\d.-]{4,15})/i)?.[1] ?? null;
  return { agencia, conta };
}

// ------------------------------------------------------- extrato em PDF

/**
 * O extrato do BB em PDF vem em DOIS arranjos de coluna, e os dois precisam
 * funcionar. Descobri isso comparando os extratos reais da VH (PJ) com os de
 * pessoa física — o cabeçalho denuncia a diferença:
 *
 *   PJ:  "Dia Lote Documento Histórico Valor"   → o valor vem por último e o
 *        extrator de texto o joga na linha ANTERIOR à data:
 *            2.900,00 (-)
 *            03/08/2026 13105 80301
 *            Pix - Enviado
 *            02/08 05:32 HEITOR VIEIRA DE HOLLANDA
 *
 *   PF:  "Dia Documento ValorLote Histórico"    → data e valor na MESMA linha:
 *            03/08/2026 500,00 (-)13105 80301
 *            Pix - Enviado
 *            03/08 16:11 HERBETES DE HOLLANDA
 *
 * Nos dois casos o histórico continua nas linhas seguintes, e é lá que está o
 * pagador — inclusive o CPF/CNPJ dele, que é o que permite casar o depósito
 * com o contrato.
 */

/** Valor em reais seguido do sinal entre parênteses: "1.234,56 (+)". */
const VALOR_COM_SINAL = String.raw`([\d.]*\d,\d{2})\s*\((\+|-)\)`;

/** PF: data, valor e sinal na mesma linha. */
const MOVIMENTO_PF = new RegExp(String.raw`^(\d{2}/\d{2}/\d{4})\s+` + VALOR_COM_SINAL + String.raw`\s*(.*)$`);

/** PJ: o valor vem sozinho, uma linha antes da data. */
const VALOR_ISOLADO = new RegExp(String.raw`^` + VALOR_COM_SINAL + String.raw`\s*(.*)$`);

/** PJ: a linha da data, sem valor. */
const DATA_ISOLADA = /^(\d{2}\/\d{2}\/\d{4})\s+(.*)$/;

/** Lote e número do documento no começo do resto: "13105 80301 Pagamento...". */
const LOTE_E_DOCUMENTO = /^(\d{3,6})\s+(\d+)\s*(.*)$/;

/** O saldo corrido de cada dia. É informação do banco, não movimento. */
const SALDO_DO_DIA = /saldo\s+do\s+dia/i;
const SALDO_ANTERIOR = /saldo\s+anterior/i;
/** O banco escreve o saldo final espaçado: "S A L D O". */
const SALDO_FINAL = /^s\s*a\s*l\s*d\s*o\b/i;

/** Data que o banco usa para linha de totalização, não para movimento. */
const DATA_NULA = "00/00/0000";

/**
 * CPF ou CNPJ do pagador, como aparece na linha de detalhe do Pix.
 *
 * O BB escreve zero à esquerda até completar 14 dígitos, então um CPF chega
 * como "00007597761996". Guardamos os dígitos como vieram: quem compara já
 * desliza uma janela de 6 dígitos, justamente porque cada banco mascara uma
 * parte diferente do documento.
 */
const DOCUMENTO_PAGADOR = /\b(\d{11}|\d{14})\b/;

/** Onde o extrato deixa de listar movimento e começa a falar de outra coisa. */
const FIM_DOS_LANCAMENTOS = /informa[çc][õo]es adicionais|aplica[çc][õo]es financeiras|limite.*cheque|cet\b/i;

/** Quantas linhas de continuação um histórico pode ter. */
const MAX_CONTINUACAO = 3;

export type LeituraExtrato = {
  lancamentos: Lancamento[];
  ignoradas: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
};

type EmMontagem = {
  data: string;
  valorCentavos: number;
  documentoBanco: string | null;
  partes: string[];
};

/**
 * Lê o texto de um extrato do BB em PDF.
 *
 * Devolve débito como número NEGATIVO. O sinal vem do marcador (+)/(-) do
 * próprio extrato, não do contexto: deduzir sinal por palavra do histórico
 * erraria em transferência entre contas do mesmo dono.
 */
export function lerExtratoPDF(texto: string): LeituraExtrato {
  const linhas = texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);

  const lancamentos: Lancamento[] = [];
  let ignoradas = 0;
  let saldoInicial: number | null = null;
  let saldoFinal: number | null = null;

  let pendente: number | null = null;
  // Caixa em volta do lançamento em montagem: as funções abaixo escrevem nele,
  // e uma variável solta faria o compilador achar que ele nunca é preenchido.
  const aberto: { atual: EmMontagem | null } = { atual: null };

  function fechar() {
    const atual = aberto.atual;
    if (!atual) return;
    const historico = atual.partes.join(" ").replace(/\s+/g, " ").trim();
    // O documento que interessa é o do PAGADOR, achado nas linhas de detalhe —
    // nunca o número de documento do banco, que é sequencial e casaria com
    // qualquer coisa.
    const detalhe = atual.partes.slice(1).join(" ");
    const documento = detalhe.match(DOCUMENTO_PAGADOR)?.[1] ?? null;

    if (historico.length >= 2) {
      lancamentos.push({
        data: atual.data,
        historico,
        documento,
        valorCentavos: atual.valorCentavos,
      });
    } else {
      ignoradas += 1;
    }
    aberto.atual = null;
  }

  function assinado(valor: string, sinal: string): number | null {
    const centavos = paraCentavos(valor);
    if (centavos === null) return null;
    return sinal === "-" ? -Math.abs(centavos) : Math.abs(centavos);
  }

  function abrir(dataBR: string, valorCentavos: number, resto: string) {
    const data = paraDataISO(dataBR);
    if (!data) {
      ignoradas += 1;
      return;
    }
    const m = resto.match(LOTE_E_DOCUMENTO);
    aberto.atual = {
      data,
      valorCentavos,
      documentoBanco: m ? m[2] : null,
      partes: [(m ? m[3] : resto).trim()].filter(Boolean),
    };
  }

  for (const linha of linhas) {
    if (FIM_DOS_LANCAMENTOS.test(linha)) {
      fechar();
      pendente = null;
      continue;
    }

    // ------------------------------------------------------- formato PF
    const pf = linha.match(MOVIMENTO_PF);
    if (pf) {
      fechar();
      pendente = null;
      const valor = assinado(pf[2], pf[3]);
      const resto = pf[4].trim();

      if (valor === null) {
        ignoradas += 1;
        continue;
      }
      if (SALDO_ANTERIOR.test(resto)) {
        saldoInicial = valor;
        continue;
      }
      if (SALDO_FINAL.test(resto)) {
        saldoFinal = valor;
        continue;
      }
      if (SALDO_DO_DIA.test(resto)) continue;

      abrir(pf[1], valor, resto);
      continue;
    }

    // -------------------------------------------- formato PJ: valor solto
    const solto = linha.match(VALOR_ISOLADO);
    if (solto) {
      const valor = assinado(solto[1], solto[2]);
      const resto = solto[3].trim();

      // Saldo do dia do formato PF vem assim: "1.349,81 (+)Saldo do dia".
      if (SALDO_DO_DIA.test(resto)) {
        fechar();
        pendente = null;
        continue;
      }
      if (SALDO_FINAL.test(resto)) {
        fechar();
        saldoFinal = valor;
        pendente = null;
        continue;
      }

      fechar();
      pendente = valor;
      continue;
    }

    // --------------------------------------------- formato PJ: data solta
    const dt = linha.match(DATA_ISOLADA);
    if (dt) {
      const resto = dt[2].trim();

      // Linha de totalização do banco. Consome o valor pendente sem gravar.
      if (dt[1] === DATA_NULA || SALDO_DO_DIA.test(resto)) {
        pendente = null;
        continue;
      }
      if (SALDO_ANTERIOR.test(resto)) {
        if (pendente !== null) saldoInicial = pendente;
        pendente = null;
        continue;
      }
      if (SALDO_FINAL.test(resto)) {
        if (pendente !== null) saldoFinal = pendente;
        pendente = null;
        continue;
      }

      if (pendente === null) {
        ignoradas += 1;
        continue;
      }

      abrir(dt[1], pendente, resto);
      pendente = null;
      continue;
    }

    // ------------------------------------------ continuação do histórico
    if (aberto.atual && aberto.atual.partes.length <= MAX_CONTINUACAO) {
      aberto.atual.partes.push(linha);
    }
  }

  fechar();

  return { lancamentos, ignoradas, saldoInicial, saldoFinal };
}

/**
 * Confere que todo valor extraído aparece LITERALMENTE no texto do documento.
 *
 * Esta é a trava mais importante do módulo. Quando a leitura assistida pelo
 * modelo entra em ação, ela pode produzir um número plausível que não está no
 * PDF. Em conciliação bancária, número inventado é o pior defeito possível — e
 * o mais difícil de perceber depois.
 */
export function valoresConferem(
  texto: string,
  lancamentos: Lancamento[],
): { ok: boolean; ausentes: string[] } {
  const semEspaco = texto.replace(/\s/g, "");

  const ausentes = lancamentos
    .map((l) => {
      const abs = Math.abs(l.valorCentavos);
      const formatado = (abs / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const semMilhar = (abs / 100).toFixed(2).replace(".", ",");
      return semEspaco.includes(formatado.replace(/\s/g, "")) || semEspaco.includes(semMilhar)
        ? null
        : formatado;
    })
    .filter((v): v is string => v !== null);

  return { ok: ausentes.length === 0, ausentes };
}

/**
 * Confere o fechamento do extrato: saldo inicial + créditos − débitos = final.
 *
 * Diferença acima de um centavo significa que algum lançamento não foi lido.
 * É melhor avisar do que fechar o mês com número faltando.
 */
export function conferirSaldo(leitura: LeituraExtrato): {
  confere: boolean | null;
  diferencaCentavos: number | null;
} {
  if (leitura.saldoInicial === null || leitura.saldoFinal === null) {
    return { confere: null, diferencaCentavos: null };
  }

  const movimento = leitura.lancamentos.reduce((s, l) => s + l.valorCentavos, 0);
  const esperado = leitura.saldoInicial + movimento;
  const diferenca = leitura.saldoFinal - esperado;

  return { confere: Math.abs(diferenca) <= 1, diferencaCentavos: diferenca };
}

/** A que mês pertence o lote — o mês da maioria dos lançamentos. */
export function competenciaDominante(lancamentos: Lancamento[]): string | null {
  if (lancamentos.length === 0) return null;

  const contagem = new Map<string, number>();
  for (const l of lancamentos) {
    const mes = l.data.slice(0, 7);
    contagem.set(mes, (contagem.get(mes) ?? 0) + 1);
  }

  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
