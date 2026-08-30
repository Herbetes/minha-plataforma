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

const DINHEIRO = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
const DATA_NA_LINHA = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.*)$/;

/** Linhas que são saldo, não movimento. */
const LINHA_DE_SALDO = /saldo\s+(anterior|do\s+dia|final|em|atual)/i;

export type LeituraExtrato = {
  lancamentos: Lancamento[];
  ignoradas: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
};

/**
 * Lê o texto de um extrato em PDF.
 *
 * O PDF não é tabela: é texto posicionado numa página. A regra que funciona é
 * "linha que começa com data é movimento", e o valor é o primeiro número em
 * formato de dinheiro — quando há um segundo, ele é o saldo corrido da conta,
 * não outro lançamento.
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

  for (const linha of linhas) {
    const m = linha.match(DATA_NA_LINHA);

    if (!m) {
      // Fora das linhas de movimento, ainda interessa capturar os saldos.
      if (LINHA_DE_SALDO.test(linha)) {
        const v = linha.match(DINHEIRO);
        if (v?.length) {
          const centavos = paraCentavos(v[v.length - 1]);
          if (centavos !== null) {
            if (saldoInicial === null && /anterior/i.test(linha)) saldoInicial = centavos;
            else saldoFinal = centavos;
          }
        }
      }
      continue;
    }

    const data = paraDataISO(m[1]);
    const resto = m[2];
    const valores = resto.match(DINHEIRO);

    if (!data || !valores?.length) {
      ignoradas++;
      continue;
    }

    if (LINHA_DE_SALDO.test(resto)) {
      const centavos = paraCentavos(valores[valores.length - 1]);
      if (centavos !== null) {
        if (saldoInicial === null && /anterior/i.test(resto)) saldoInicial = centavos;
        else saldoFinal = centavos;
      }
      continue;
    }

    const bruto = paraCentavos(valores[0]);
    if (bruto === null) {
      ignoradas++;
      continue;
    }

    // O extrato do BB marca o sinal com C (crédito) ou D (débito) depois do
    // valor, em vez de usar número negativo.
    const marcador = resto.slice(resto.lastIndexOf(valores[0]) + valores[0].length).trim();
    const ehDebito = /^d\b/i.test(marcador) || bruto < 0;
    const valorCentavos = ehDebito ? -Math.abs(bruto) : Math.abs(bruto);

    const historico = resto
      .replace(DINHEIRO, " ")
      .replace(/\s+[CD]\s*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (historico.length < 2) {
      ignoradas++;
      continue;
    }

    const documento = historico.match(/\b(\d{6,})\b/)?.[1] ?? null;

    lancamentos.push({ data, historico, documento, valorCentavos });
  }

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
