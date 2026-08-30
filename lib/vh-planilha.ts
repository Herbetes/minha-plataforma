/**
 * Leitura da planilha de condomínios.
 *
 * A parte que depende do Excel (abrir o arquivo, virar linhas) fica na rota.
 * Aqui mora só a interpretação das linhas — que é onde estão as decisões, e
 * portanto o que precisa de teste.
 */

export type LinhaPlanilha = (string | number | null)[];

export type Condominio = {
  imovel: string;
  valorCentavos: number;
  linha: number;
};

export type LeituraPlanilha = {
  condominios: Condominio[];
  cabecalhoEncontrado: string[] | null;
  ignoradas: number;
};

const COLUNA_IMOVEL = ["imovel", "imóvel", "unidade", "apartamento", "apto", "sala", "descricao", "descrição"];
const COLUNA_VALOR = ["valor", "total", "valor total", "bruto", "valor bruto", "condominio", "condomínio"];

export function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function acharColuna(cabecalho: LinhaPlanilha, candidatos: string[]): number {
  const norm = cabecalho.map(normalizar);
  for (const c of candidatos) {
    const i = norm.indexOf(normalizar(c));
    if (i !== -1) return i;
  }
  for (const c of candidatos) {
    const alvo = normalizar(c);
    const i = norm.findIndex((h) => h.length > 0 && h.includes(alvo));
    if (i !== -1) return i;
  }
  return -1;
}

/** Aceita número vindo da célula ou texto no formato brasileiro. */
export function valorParaCentavos(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);

  const texto = String(v ?? "").trim();
  if (!texto) return null;

  const limpo = texto
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Lê os condomínios de uma aba.
 *
 * Procura a linha de cabeçalho em vez de exigir que ela seja a primeira: essas
 * planilhas quase sempre começam com título, logo e linhas em branco.
 *
 * Quando o mesmo imóvel aparece mais de uma vez, os valores são SOMADOS — é a
 * taxa principal mais a extra, e a skill já tratava assim. Somar é o certo;
 * pegar só a primeira linha subestimaria a despesa.
 */
export function lerCondominios(linhas: LinhaPlanilha[]): LeituraPlanilha {
  let iCabecalho = -1;
  let iImovel = -1;
  let iValor = -1;

  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const imovel = acharColuna(linhas[i], COLUNA_IMOVEL);
    const valor = acharColuna(linhas[i], COLUNA_VALOR);
    if (imovel !== -1 && valor !== -1 && imovel !== valor) {
      iCabecalho = i;
      iImovel = imovel;
      iValor = valor;
      break;
    }
  }

  if (iCabecalho === -1) {
    return {
      condominios: [],
      cabecalhoEncontrado: linhas[0]?.map((c) => String(c ?? "")) ?? null,
      ignoradas: linhas.length,
    };
  }

  const somados = new Map<string, Condominio>();
  let ignoradas = 0;

  for (let i = iCabecalho + 1; i < linhas.length; i++) {
    const imovel = String(linhas[i][iImovel] ?? "").trim();
    const centavos = valorParaCentavos(linhas[i][iValor]);

    if (!imovel || centavos === null || centavos === 0) {
      ignoradas++;
      continue;
    }

    const chave = normalizar(imovel);
    const existente = somados.get(chave);

    if (existente) {
      existente.valorCentavos += centavos;
    } else {
      somados.set(chave, { imovel, valorCentavos: centavos, linha: i + 1 });
    }
  }

  return {
    condominios: [...somados.values()],
    cabecalhoEncontrado: linhas[iCabecalho].map((c) => String(c ?? "")),
    ignoradas,
  };
}

/**
 * Casa o nome do imóvel da planilha com o do cadastro.
 *
 * As duas fontes escrevem o mesmo imóvel de formas diferentes ("FLAT 602" e
 * "Flat 602 - Beach Class"), então a comparação é por palavras em comum, não
 * por igualdade.
 */
export function casarImovel(
  nomePlanilha: string,
  cadastro: { id: string; imovel: string }[],
): { id: string; imovel: string } | null {
  const alvo = new Set(
    normalizar(nomePlanilha)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 2),
  );
  if (alvo.size === 0) return null;

  let melhor: { id: string; imovel: string } | null = null;
  let melhorScore = 0;

  for (const c of cadastro) {
    const partes = normalizar(c.imovel)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 2);
    if (partes.length === 0) continue;

    const comuns = partes.filter((p) => alvo.has(p)).length;
    const score = comuns / Math.max(partes.length, alvo.size);

    if (score > melhorScore) {
      melhorScore = score;
      melhor = c;
    }
  }

  // Abaixo de metade das palavras em comum é chute, e chute em despesa vira
  // condomínio lançado no imóvel errado.
  return melhorScore >= 0.5 ? melhor : null;
}
