import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Lógica pura do módulo VH: ler extrato, pontuar candidatos, calcular
 * competência. Sem rede, sem banco, sem modelo.
 *
 * É de propósito que a pontuação viva aqui e não no prompt. Comparar valor e
 * data é aritmética: código faz igual toda vez, de graça, e dá para testar.
 * O modelo entra onde ele é melhor — ler um histórico bagunçado e decidir o
 * caso ambíguo.
 */

// ---------------------------------------------------------------- dinheiro

/**
 * Converte valor brasileiro em centavos.
 *
 * Centavos inteiros, nunca decimal: ponto flutuante acumula erro de
 * arredondamento e um centavo de diferença vira divergência inexplicável.
 */
export function paraCentavos(texto: string): number | null {
  const limpo = texto
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // separador de milhar
    .replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;

  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;

  return Math.round(n * 100);
}

export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

// ------------------------------------------------------------------- datas

/** Aceita dd/mm/aaaa, dd/mm/aa e aaaa-mm-dd. Devolve sempre aaaa-mm-dd. */
export function paraDataISO(texto: string): string | null {
  const t = texto.trim();

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const dia = br[1].padStart(2, "0");
    const mes = br[2].padStart(2, "0");
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    if (Number(mes) < 1 || Number(mes) > 12) return null;
    if (Number(dia) < 1 || Number(dia) > 31) return null;
    return `${ano}-${mes}-${dia}`;
  }

  // OFX: aaaammdd, às vezes com hora colada
  const ofx = t.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) return `${ofx[1]}-${ofx[2]}-${ofx[3]}`;

  return null;
}

// -------------------------------------------------------------- lançamentos

export type Lancamento = {
  data: string;
  historico: string;
  documento: string | null;
  valorCentavos: number;
  /** Conta em que o lançamento caiu. Os aluguéis chegam por mais de uma. */
  contaId?: string | null;
};

/**
 * Impressão digital do lançamento, para não importar o mesmo duas vezes.
 *
 * Subir o mesmo extrato de novo é acidente comum — e sem isto dobraria a
 * receita do mês em silêncio.
 */
export function impressaoDigital(l: Lancamento): string {
  const base = [
    l.contaId ?? "sem-conta",
    l.data,
    l.valorCentavos,
    l.historico.replace(/\s+/g, " ").trim().toLowerCase(),
  ].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

const CABECALHOS = {
  data: ["data", "data lancamento", "data movimento", "dt", "date"],
  historico: ["historico", "histórico", "descricao", "descrição", "lancamento", "memo"],
  valor: ["valor", "valor (r$)", "montante", "amount"],
  documento: ["documento", "doc", "numero documento", "nº documento", "n° documento"],
};

function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/["']/g, "")
    .trim()
    .toLowerCase();
}

function acharColuna(cabecalhos: string[], candidatos: string[]): number {
  const norm = cabecalhos.map(normalizarCabecalho);
  for (const c of candidatos) {
    const i = norm.indexOf(normalizarCabecalho(c));
    if (i !== -1) return i;
  }
  // Tolerância: casa por prefixo quando o banco acrescenta sufixo à coluna.
  for (const c of candidatos) {
    const alvo = normalizarCabecalho(c);
    const i = norm.findIndex((h) => h.startsWith(alvo));
    if (i !== -1) return i;
  }
  return -1;
}

/** Divide uma linha de CSV respeitando aspas. */
function dividirLinha(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (c === separador && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim().replace(/^"|"$/g, ""));
}

/**
 * Lê o CSV do extrato.
 *
 * Descobre as colunas pelo nome do cabeçalho em vez de exigir posição fixa —
 * cada banco exporta numa ordem, e o do Banco do Brasil já mudou de layout
 * mais de uma vez.
 */
export function lerCSV(texto: string): { lancamentos: Lancamento[]; ignoradas: number } {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (linhas.length < 2) return { lancamentos: [], ignoradas: 0 };

  const separador = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0)
    ? ";"
    : ",";

  const cabecalhos = dividirLinha(linhas[0], separador);
  const iData = acharColuna(cabecalhos, CABECALHOS.data);
  const iHist = acharColuna(cabecalhos, CABECALHOS.historico);
  const iValor = acharColuna(cabecalhos, CABECALHOS.valor);
  const iDoc = acharColuna(cabecalhos, CABECALHOS.documento);

  if (iData === -1 || iHist === -1 || iValor === -1) {
    return { lancamentos: [], ignoradas: linhas.length - 1 };
  }

  const lancamentos: Lancamento[] = [];
  let ignoradas = 0;

  for (const linha of linhas.slice(1)) {
    const campos = dividirLinha(linha, separador);
    const data = paraDataISO(campos[iData] ?? "");
    const valor = paraCentavos(campos[iValor] ?? "");
    const historico = (campos[iHist] ?? "").trim();

    if (!data || valor === null || historico.length === 0) {
      ignoradas++;
      continue;
    }

    lancamentos.push({
      data,
      historico,
      documento: iDoc !== -1 ? (campos[iDoc] || null) : null,
      valorCentavos: valor,
    });
  }

  return { lancamentos, ignoradas };
}

/** Lê OFX, o formato que a maioria dos bancos exporta para software contábil. */
export function lerOFX(texto: string): { lancamentos: Lancamento[]; ignoradas: number } {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const lancamentos: Lancamento[] = [];
  let ignoradas = 0;

  const campo = (bloco: string, tag: string) =>
    bloco.match(new RegExp(`<${tag}>([^<\r\n]*)`, "i"))?.[1]?.trim() ?? "";

  for (const bloco of blocos) {
    const data = paraDataISO(campo(bloco, "DTPOSTED"));
    const valor = paraCentavos(campo(bloco, "TRNAMT"));
    const historico = campo(bloco, "MEMO") || campo(bloco, "NAME");

    if (!data || valor === null || historico.length === 0) {
      ignoradas++;
      continue;
    }

    lancamentos.push({
      data,
      historico,
      documento: campo(bloco, "CHECKNUM") || null,
      valorCentavos: valor,
    });
  }

  return { lancamentos, ignoradas };
}

// -------------------------------------------------------------- pontuação

export type Contrato = {
  id: string;
  imovel: string;
  locatario: string;
  documento: string | null;
  valorCentavos: number;
  diaVencimento: number | null;
  /** Conta em que ESTE imóvel recebe. Cada um tem a sua. */
  contaId?: string | null;
  /**
   * Como o pagador aparece no extrato.
   *
   * O locatário assina como "João da Silva Souza" e paga como "J S SOUZA", ou
   * pela empresa dele, ou pela esposa. Comparar só com o nome do contrato erra
   * justamente nesses casos, que são a maioria.
   */
  padroes?: string[];
};

export type Candidato = {
  contratoId: string;
  locatario: string;
  score: number;
  motivos: string[];
};

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Só os dígitos, para comparar CPF/CNPJ escrito de formas diferentes. */
function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Pontua o quanto um lançamento parece ser o pagamento de um contrato.
 *
 * A soma vai a 100 e cada parcela vem com um motivo em português, porque a
 * pontuação vai aparecer na tela de aprovação: número sem explicação não
 * ajuda ninguém a decidir.
 */
export function pontuar(l: Lancamento, c: Contrato): Candidato {
  const motivos: string[] = [];
  let score = 0;

  // --- valor (até 50)
  const diff = Math.abs(l.valorCentavos - c.valorCentavos);
  const proporcao = c.valorCentavos > 0 ? diff / c.valorCentavos : 1;

  if (diff === 0) {
    score += 50;
    motivos.push("valor idêntico ao do contrato");
  } else if (proporcao <= 0.02) {
    score += 35;
    motivos.push(`valor a menos de 2% do contrato (${formatarCentavos(diff)} de diferença)`);
  } else if (proporcao <= 0.1) {
    score += 15;
    motivos.push(`valor a menos de 10% do contrato (${formatarCentavos(diff)} de diferença)`);
  }

  // --- data (até 25)
  //
  // Só conta se o valor já pontuou. Data isolada é coincidência: uma tarifa
  // que caiu no dia do vencimento não tem nada a ver com o aluguel, e pontuar
  // por isso enche a tela de candidato falso.
  if (c.diaVencimento && score > 0) {
    const dia = Number(l.data.slice(8, 10));
    const distancia = Math.min(
      Math.abs(dia - c.diaVencimento),
      31 - Math.abs(dia - c.diaVencimento),
    );
    if (distancia <= 3) {
      score += 25;
      motivos.push(`caiu a ${distancia} dia(s) do vencimento (dia ${c.diaVencimento})`);
    } else if (distancia <= 10) {
      score += 10;
      motivos.push(`caiu a ${distancia} dias do vencimento (dia ${c.diaVencimento})`);
    }
  }

  // --- quem pagou (até 25)
  const hist = normalizarTexto(l.historico);

  // Padrão cadastrado vem primeiro: foi você que confirmou que aquele texto
  // no extrato é este locatário, então vale mais que semelhança de nome.
  const padraoQueBateu = (c.padroes ?? [])
    .map((p) => normalizarTexto(p))
    .filter((p) => p.length >= 3)
    .find((p) => hist.includes(p));

  if (padraoQueBateu) {
    score += 25;
    motivos.push(`padrão de pagador cadastrado bate ("${padraoQueBateu}")`);
  } else {
    const partes = normalizarTexto(c.locatario)
      .split(" ")
      .filter((p) => p.length >= 4);
    const encontradas = partes.filter((p) => hist.includes(p));

    if (partes.length > 0 && encontradas.length === partes.length) {
      score += 25;
      motivos.push("nome do locatário aparece inteiro no histórico");
    } else if (encontradas.length > 0) {
      score += 15;
      motivos.push(`parte do nome do locatário no histórico (${encontradas.join(", ")})`);
    }
  }

  // --- documento (até 15)
  if (c.documento) {
    const doc = apenasDigitos(c.documento);
    const digitosHist = apenasDigitos(l.historico);

    // O extrato quase sempre mascara o documento, e cada banco esconde uma
    // parte diferente (***.456.789-**). Procurar só o final erraria na maioria
    // das vezes; qualquer trecho de 6 dígitos seguidos já é específico o
    // bastante para não dar falso positivo.
    if (doc.length >= 6) {
      for (let i = 0; i + 6 <= doc.length; i++) {
        if (digitosHist.includes(doc.slice(i, i + 6))) {
          score += 15;
          motivos.push("um trecho do CPF/CNPJ aparece no histórico");
          break;
        }
      }
    }
  }

  // --- conta destino
  //
  // Cada imóvel recebe numa conta específica. Um crédito que caiu noutra conta
  // dificilmente é o aluguel dele, por mais que valor e data batam — então a
  // divergência derruba o candidato em vez de só descontar pontos.
  if (l.contaId && c.contaId && l.contaId !== c.contaId) {
    return {
      contratoId: c.id,
      locatario: c.locatario,
      score: Math.min(Math.round(score * 0.2), 20),
      motivos: [
        "o lançamento caiu numa conta diferente da conta deste imóvel",
        ...motivos,
      ],
    };
  }

  if (l.contaId && c.contaId && l.contaId === c.contaId && score > 0) {
    motivos.push("caiu na conta certa deste imóvel");
  }

  if (motivos.length === 0) motivos.push("nada em comum além de ser um crédito");

  return {
    contratoId: c.id,
    locatario: c.locatario,
    score: Math.min(score, 100),
    motivos,
  };
}

/** Ordena os contratos do mais provável ao menos, para o agente investigar. */
export function candidatos(l: Lancamento, contratos: Contrato[], limite = 5): Candidato[] {
  return contratos
    .map((c) => pontuar(l, c))
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

/**
 * Competência do pagamento: a que mês ele se refere.
 *
 * Pagamento adiantado, feito nos últimos dias do mês para um aluguel que vence
 * no início do seguinte, pertence ao mês seguinte. Sem essa regra, dezembro
 * fica com dois aluguéis e janeiro com nenhum.
 */
export function competencia(dataISO: string, diaVencimento: number | null): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);

  if (diaVencimento && diaVencimento <= 10 && dia >= 25) {
    const proximoMes = mes === 12 ? 1 : mes + 1;
    const proximoAno = mes === 12 ? ano + 1 : ano;
    return `${proximoAno}-${String(proximoMes).padStart(2, "0")}`;
  }

  return `${ano}-${String(mes).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ schemas

export const contratoSchema = z.object({
  imovel: z.string().trim().min(1, "Informe o imóvel").max(200),
  locatario: z.string().trim().min(1, "Informe o locatário").max(200),
  documento: z.string().trim().max(30).nullable().optional(),
  valorCentavos: z.number().int().positive("O valor do aluguel precisa ser maior que zero"),
  diaVencimento: z.number().int().min(1).max(31).nullable().optional(),
  indiceReajuste: z.string().trim().max(30).nullable().optional(),
  mesReajuste: z.number().int().min(1).max(12).nullable().optional(),
  vigenciaInicio: z.string().trim().nullable().optional(),
  vigenciaFim: z.string().trim().nullable().optional(),
  ativo: z.boolean().optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(),
  contaId: z.uuid().nullable().optional(),
  padroes: z.array(z.string().trim().min(2).max(80)).max(20).optional(),
  tipoImovel: z.string().trim().max(40).nullable().optional(),
  garantia: z.string().trim().max(200).nullable().optional(),
});

export const contaSchema = z.object({
  apelido: z.string().trim().min(1, "Informe um apelido para a conta").max(40),
  titular: z.string().trim().max(120).nullable().optional(),
  tipo: z.enum(["pj", "pf"]),
  banco: z.string().trim().max(40).nullable().optional(),
  agencia: z.string().trim().max(20).nullable().optional(),
  numero: z.string().trim().max(30).nullable().optional(),
});

export const decisaoSchema = z.object({
  status: z.enum(["aprovada", "rejeitada"]),
  contratoId: z.uuid().nullable().optional(),
});
