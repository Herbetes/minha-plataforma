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

const COLUNA_IMOVEL = [
  "imovel", "imóvel", "unidade", "apartamento", "apto", "sala",
  "descricao", "descrição", "referencia", "referência",
  // A planilha da Fabiana é uma lista de pagamentos: a coluna do imóvel se
  // chama só "Nome". Fica por último para não ganhar de um nome mais preciso.
  "nome",
];

/**
 * Valor do condomínio. BRUTO vem primeiro de propósito.
 *
 * A planilha traz BRUTO, DESCONTO e LÍQUIDO. A despesa do imóvel é a taxa
 * cheia — o desconto é negociação pontual (pontualidade, acordo) e some no mês
 * seguinte. Lançar o líquido faria a despesa do imóvel oscilar por um motivo
 * que não é do imóvel, e é a regra que a skill já seguia.
 */
const COLUNA_VALOR = [
  "bruto", "r$ bruto", "valor bruto",
  "condominio", "condomínio", "valor total", "valor", "total",
];

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
/**
 * Palavras que aparecem em quase toda linha e não identificam imóvel nenhum.
 *
 * Elas não atrapalham por estarem presentes — atrapalham por entrarem na
 * conta. "CONDOMÍNIO VIA CAPIBARIBE + TX EXTRA" e "APTO 402 - VIA CAPIBARIBE"
 * são o mesmo imóvel, mas as três palavras de enfeite derrubavam a proporção
 * de palavras em comum para baixo do corte.
 */
const PALAVRAS_VAZIAS = new Set([
  "condominio", "cond", "taxa", "tx", "extra", "edf", "edificio", "adm",
  "administradora", "parcela", "mensal", "ref", "referente", "do", "da", "de",
  "dos", "das", "apto", "apartamento", "flat", "sala", "unidade", "res",
]);

/**
 * Palavras do nome de um imóvel, prontas para comparar.
 *
 * O zero à esquerda cai: a planilha de pagamentos escreve "0602" e o cadastro
 * escreve "602". São o mesmo apartamento, e sem isto o número — que é o dado
 * mais identificador que existe aqui — deixava de casar.
 */
function palavrasDoImovel(nome: string): string[] {
  return normalizar(nome)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2)
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p))
    .filter((p) => !PALAVRAS_VAZIAS.has(p));
}

/** Número da unidade: 3 ou 4 dígitos, como 602, 1801, 2907. */
function numeroDaUnidade(palavras: string[]): string | null {
  return palavras.find((p) => /^\d{3,4}$/.test(p)) ?? null;
}

/**
 * Casa o nome do imóvel da planilha com o do cadastro.
 *
 * As duas fontes escrevem o mesmo imóvel de formas diferentes — a planilha de
 * pagamentos diz "COND. EDF BEACH CLASS EXECUTIVE 0602 Controlar" e o cadastro
 * diz "FLAT 602 - BEACH CLASS EXECUTIVE" —, então a comparação é por palavras
 * em comum, não por igualdade.
 *
 * O número da unidade vale mais que o resto: "RM TRADE CENTER - A 0804" e
 * "SALA 804 - RIO MAR TORRE A" quase não compartilham palavras, mas o 804
 * decide sozinho. Em contrapartida, número DIFERENTE elimina o candidato: sem
 * isso as duas salas da Lorena (1801 e 1802) se confundiriam, e o condomínio
 * de uma iria para a outra.
 */
export type ImovelDoCadastro = {
  id: string;
  imovel: string;
  /** Outros nomes pelos quais este imóvel aparece na planilha de despesas. */
  apelidos?: string[] | null;
};

export function casarImovel<T extends ImovelDoCadastro>(
  nomePlanilha: string,
  cadastro: T[],
): T | null {
  const palavrasAlvo = palavrasDoImovel(nomePlanilha);
  const alvo = new Set(palavrasAlvo);
  if (alvo.size === 0) return null;
  const numeroAlvo = numeroDaUnidade(palavrasAlvo);

  let melhor: T | null = null;
  let melhorScore = 0;

  for (const c of cadastro) {
    // O apelido vale como se fosse o nome. É a saída para sigla — "IBC" e
    // "INTER BUSINESS CENTER" são o mesmo prédio e não têm letra em comum.
    const nomes = [c.imovel, ...(c.apelidos ?? [])];

    for (const nome of nomes) {
      const partes = palavrasDoImovel(nome);
      if (partes.length === 0) continue;

      const numeroCadastro = numeroDaUnidade(partes);

      // Números presentes nos dois lados e diferentes: são imóveis diferentes.
      if (numeroAlvo && numeroCadastro && numeroAlvo !== numeroCadastro) continue;

      const comuns = partes.filter((p) => alvo.has(p)).length;
      let score = comuns / Math.max(partes.length, alvo.size);

      // O número bate: é identificação, não coincidência de palavra.
      if (numeroAlvo && numeroAlvo === numeroCadastro) score = Math.max(score, 0.75);

      if (score > melhorScore) {
        melhorScore = score;
        melhor = c;
      }
    }
  }

  // Abaixo de metade das palavras em comum é chute, e chute em despesa vira
  // condomínio lançado no imóvel errado.
  return melhorScore >= 0.5 ? melhor : null;
}
