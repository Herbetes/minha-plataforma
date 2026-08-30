/**
 * Leitura da aba CADASTRO DE IMÓVEIS da planilha "Movimento Contábil da VH".
 *
 * O motivo de existir: os contratos já estão digitados nessa planilha há anos.
 * Pedir para redigitá-los na plataforma seria pedir para fazer duas vezes o
 * mesmo trabalho — e, o que é pior, criar duas verdades que divergem no mês
 * seguinte.
 *
 * A leitura é por CABEÇALHO, nunca por posição de coluna. A planilha é editada
 * por gente, e gente insere coluna no meio; um leitor que confia em "a coluna F
 * é o aluguel" passa a importar o número errado sem avisar ninguém.
 *
 * Nada aqui grava no banco. A função devolve o que entendeu — inclusive o que
 * NÃO entendeu — e a decisão continua sendo de quem olha a tela.
 */

import { type LinhaPlanilha, acharColuna, normalizar, valorParaCentavos } from "@/lib/vh-planilha";

export type ContratoImportado = {
  imovel: string;
  locatario: string;
  documento: string | null;
  valorCentavos: number;
  diaVencimento: number | null;
  indiceReajuste: string | null;
  mesReajuste: number | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  tipoImovel: string | null;
  garantia: string | null;
  contaApelido: string | null;
  observacoes: string | null;
  linha: number;
  /** O que ficou incerto nesta linha. Não impede importar; pede conferência. */
  avisos: string[];
};

export type LinhaDescartada = {
  linha: number;
  identificacao: string;
  motivo: string;
};

export type LeituraCadastro = {
  contratos: ContratoImportado[];
  descartadas: LinhaDescartada[];
  cabecalho: string[] | null;
  camposEncontrados: string[];
  camposAusentes: string[];
};

// Sinônimos aceitos por campo. Vale a variação que a planilha real usa e as
// que planilhas parecidas costumam usar — errar para o lado de reconhecer
// demais custa um aviso na tela; errar para menos custa digitação à mão.
const COLUNAS = {
  imovel: ["imovel", "imóvel", "unidade", "sala", "apartamento", "apto", "flat", "descricao", "descrição"],
  locatario: ["locatario", "locatário", "inquilino", "locataria", "locatária", "cliente", "nome"],
  documento: ["cpf/cnpj", "cpf / cnpj", "cnpj/cpf", "documento", "cpf", "cnpj"],
  valor: ["aluguel", "valor do aluguel", "valor aluguel", "aluguel mensal", "valor", "locacao", "locação"],
  condominio: ["condominio", "condomínio", "taxa de condominio", "taxa condominial"],
  iptu: ["iptu", "iptu mensal"],
  vencimento: ["vencimento", "dia de vencimento", "dia vencimento", "dia"],
  indice: ["indice", "índice", "indice de reajuste", "índice de reajuste", "reajuste por", "correcao", "correção"],
  reajuste: ["mes de reajuste", "mês de reajuste", "reajuste", "proximo reajuste", "próximo reajuste", "aniversario", "aniversário"],
  inicio: ["inicio", "início", "inicio da vigencia", "início da vigência", "vigencia inicio", "vigência início", "data inicial"],
  fim: ["fim", "fim da vigencia", "fim da vigência", "vigencia fim", "vigência fim", "termino", "término", "data final", "vigencia", "vigência"],
  garantia: ["garantia", "tipo de garantia", "detalhes da garantia"],
  tipo: ["tipo de imovel", "tipo de imóvel", "tipo"],
  conta: ["conta", "conta destino", "banco", "recebimento", "titular"],
  status: ["status", "situacao", "situação", "ativo"],
  observacoes: ["observacoes", "observações", "obs", "observacao", "observação"],
} as const;

type Campo = keyof typeof COLUNAS;

const MESES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Texto que indica imóvel sem contrato vigente. */
const VAGO = /^(vago|vaga|disponivel|desocupad[oa]|sem locat|livre|-+)$/;

/** Texto que indica contrato encerrado numa coluna de situação. */
const ENCERRADO = /encerrad|inativ|rescindid|desativad|finalizad|sa[íi]u/;

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, " ").trim();
}

/**
 * Data em ISO a partir do que a célula devolver.
 *
 * O Excel devolve `Date` quando a célula é data de verdade e texto quando
 * alguém digitou. Os dois caminhos precisam funcionar — na mesma planilha,
 * uma coluna costuma ter os dois.
 */
export function dataParaISO(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }

  const t = texto(v);
  if (!t) return null;

  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (br) {
    const [, d, m, a] = br;
    // Dois dígitos no ano: 24 é 2024, não 1924. Contrato de locação com
    // vigência no século passado não existe nesta planilha.
    const ano = a.length === 2 ? 2000 + Number(a) : Number(a);
    const mes = Number(m);
    const dia = Number(d);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

/**
 * Mês do reajuste, a partir de qualquer forma em que ele apareça.
 *
 * Na planilha real essa coluna às vezes traz "JUL/2026", às vezes a data
 * inteira do aniversário, às vezes só o número. Todas querem dizer a mesma
 * coisa, e o que importa para o Radar é só o mês.
 */
export function mesDeReajuste(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12) return v;

  const data = dataParaISO(v);
  if (data) return Number(data.slice(5, 7));

  const t = normalizar(v);
  if (!t) return null;

  const soNumero = t.match(/^(\d{1,2})$/);
  if (soNumero) {
    const n = Number(soNumero[1]);
    return n >= 1 && n <= 12 ? n : null;
  }

  // "jul", "julho", "JUL/2026", "julho de 2026"
  for (let i = 0; i < MESES.length; i += 1) {
    if (t.startsWith(MESES[i].slice(0, 3)) || t.includes(MESES[i])) return i + 1;
  }

  return null;
}

/** Dia do vencimento, aceitando número ou data. */
export function diaDeVencimento(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31) return v;

  const data = dataParaISO(v);
  if (data) return Number(data.slice(8, 10));

  const t = texto(v).match(/(\d{1,2})/);
  if (!t) return null;
  const n = Number(t[1]);
  return n >= 1 && n <= 31 ? n : null;
}

/** Só os dígitos, no formato que o resto do módulo já usa para comparar. */
export function documentoLimpo(v: unknown): string | null {
  const digitos = texto(v).replace(/\D/g, "");
  if (digitos.length !== 11 && digitos.length !== 14) return null;
  return digitos;
}

/**
 * Casa o apelido da conta da planilha com as contas cadastradas.
 *
 * A planilha abrevia — "H" para Herbetes, "C" para Cláudia. Aceitar a inicial
 * é o que evita ter que corrigir dezenas de linhas na mão; devolver `null`
 * quando há dúvida é o que evita jogar o aluguel na conta errada, que é o erro
 * caro (uma receita atribuída à conta errada estraga a conciliação do mês).
 */
export function casarConta(bruto: string, apelidos: string[]): string | null {
  const alvo = normalizar(bruto);
  if (!alvo) return null;

  const exato = apelidos.find((a) => normalizar(a) === alvo);
  if (exato) return exato;

  const contem = apelidos.filter(
    (a) => normalizar(a).includes(alvo) || alvo.includes(normalizar(a)),
  );
  if (contem.length === 1) return contem[0];

  // Uma letra só: vale como inicial, mas apenas se resolver para uma conta.
  if (alvo.length === 1) {
    const iniciais = apelidos.filter((a) => normalizar(a).startsWith(alvo));
    if (iniciais.length === 1) return iniciais[0];
  }

  return null;
}

/** Acha a linha de cabeçalho. Essas planilhas começam com título e logo. */
function acharCabecalho(linhas: LinhaPlanilha[]): number {
  for (let i = 0; i < Math.min(linhas.length, 30); i += 1) {
    const linha = linhas[i];
    const temImovel = acharColuna(linha, [...COLUNAS.imovel]) !== -1;
    const temLocatario = acharColuna(linha, [...COLUNAS.locatario]) !== -1;
    const temValor = acharColuna(linha, [...COLUNAS.valor]) !== -1;
    if (temImovel && (temLocatario || temValor)) return i;
  }
  return -1;
}

/**
 * Lê a aba de cadastro e devolve contratos prontos para conferência.
 *
 * `apelidosDeConta` são as contas já cadastradas na plataforma, usadas só para
 * traduzir a abreviação da planilha. Sem elas a leitura funciona igual — o
 * contrato entra sem conta e você aponta depois.
 */
export function lerCadastroImoveis(
  linhas: LinhaPlanilha[],
  apelidosDeConta: string[] = [],
): LeituraCadastro {
  const iCabecalho = acharCabecalho(linhas);
  if (iCabecalho === -1) {
    return {
      contratos: [],
      descartadas: [],
      cabecalho: null,
      camposEncontrados: [],
      camposAusentes: Object.keys(COLUNAS),
    };
  }

  const cabecalho = linhas[iCabecalho];
  const indice = {} as Record<Campo, number>;
  for (const campo of Object.keys(COLUNAS) as Campo[]) {
    indice[campo] = acharColuna(cabecalho, [...COLUNAS[campo]]);
  }

  const contratos: ContratoImportado[] = [];
  const descartadas: LinhaDescartada[] = [];

  const ler = (linha: LinhaPlanilha, campo: Campo): unknown =>
    indice[campo] === -1 ? null : linha[indice[campo]];

  for (let i = iCabecalho + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const numero = i + 1;

    const imovel = texto(ler(linha, "imovel"));
    const locatario = texto(ler(linha, "locatario"));
    const valorCentavos = valorParaCentavos(ler(linha, "valor"));

    // Linha em branco entre blocos é estrutura da planilha, não erro digno de
    // relatório — só ruído se aparecesse na lista de descartadas.
    if (!imovel && !locatario && valorCentavos === null) continue;

    const identificacao = imovel || locatario || `linha ${numero}`;

    if (!imovel) {
      descartadas.push({ linha: numero, identificacao, motivo: "sem o nome do imóvel" });
      continue;
    }
    if (!locatario || VAGO.test(normalizar(locatario))) {
      descartadas.push({
        linha: numero,
        identificacao,
        motivo: locatario ? "imóvel sem locatário no momento" : "sem locatário",
      });
      continue;
    }
    if (valorCentavos === null || valorCentavos <= 0) {
      // Acontece de propósito na planilha: célula mesclada com a linha de cima
      // (a SALA 1802 é assim). Cair aqui é o certo — inventar valor não é.
      descartadas.push({
        linha: numero,
        identificacao,
        motivo: "sem valor de aluguel legível (célula vazia ou mesclada)",
      });
      continue;
    }

    const avisos: string[] = [];

    const situacao = normalizar(ler(linha, "status"));
    if (situacao && ENCERRADO.test(situacao)) {
      descartadas.push({ linha: numero, identificacao, motivo: `marcado como "${texto(ler(linha, "status"))}"` });
      continue;
    }

    const contaBruta = texto(ler(linha, "conta"));
    const contaApelido = contaBruta ? casarConta(contaBruta, apelidosDeConta) : null;
    if (contaBruta && !contaApelido) {
      avisos.push(
        apelidosDeConta.length === 0
          ? `conta "${contaBruta}" — nenhuma conta cadastrada ainda`
          : `não reconheci a conta "${contaBruta}"`,
      );
    }

    const vigenciaFim = dataParaISO(ler(linha, "fim"));
    if (indice.fim !== -1 && texto(ler(linha, "fim")) && !vigenciaFim) {
      avisos.push("não entendi a data de fim da vigência");
    }

    const mesReajuste = mesDeReajuste(ler(linha, "reajuste"));
    if (indice.reajuste !== -1 && texto(ler(linha, "reajuste")) && mesReajuste === null) {
      avisos.push("não entendi o mês de reajuste");
    }

    const observacoesPartes = [texto(ler(linha, "observacoes"))];
    const condominio = valorParaCentavos(ler(linha, "condominio"));
    const iptu = valorParaCentavos(ler(linha, "iptu"));
    if (condominio !== null) observacoesPartes.push(`Condomínio: ${(condominio / 100).toFixed(2)}`);
    if (iptu !== null) observacoesPartes.push(`IPTU: ${(iptu / 100).toFixed(2)}`);

    contratos.push({
      imovel,
      locatario,
      documento: documentoLimpo(ler(linha, "documento")),
      valorCentavos,
      diaVencimento: diaDeVencimento(ler(linha, "vencimento")),
      indiceReajuste: texto(ler(linha, "indice")) || null,
      mesReajuste,
      vigenciaInicio: dataParaISO(ler(linha, "inicio")),
      vigenciaFim,
      tipoImovel: texto(ler(linha, "tipo")) || null,
      garantia: texto(ler(linha, "garantia")) || null,
      contaApelido,
      observacoes: observacoesPartes.filter(Boolean).join(" · ") || null,
      linha: numero,
      avisos,
    });
  }

  const camposEncontrados = (Object.keys(COLUNAS) as Campo[]).filter((c) => indice[c] !== -1);
  const camposAusentes = (Object.keys(COLUNAS) as Campo[]).filter((c) => indice[c] === -1);

  return {
    contratos,
    descartadas,
    cabecalho: cabecalho.map((c) => texto(c)),
    camposEncontrados,
    camposAusentes,
  };
}
