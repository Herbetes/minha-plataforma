/**
 * Monta o repasse do mês: o pacote que a plataforma entrega para a skill
 * escrever a aba do MOVIMENTO VH.
 *
 * Por que existe uma peça só para isto. A plataforma concilia e você aprova;
 * quem escreve a planilha continua sendo a skill, que já preserva as células
 * mescladas, as alturas e a configuração de página do arquivo que vai para a
 * contabilidade. Um segundo programa reescrevendo esse .xlsx por outra
 * biblioteca corrompe formatação em silêncio — e silêncio, nesse documento, é
 * o pior defeito possível.
 *
 * Então o contrato entre os dois é este objeto. Ele é de CÓDIGO, não de
 * modelo: os números precisam somar igual toda vez.
 */

/** Sobe de 1 quando o formato mudar de um jeito que quebre quem lê. */
export const VERSAO_REPASSE = 1;

export type LancamentoRepasse = {
  data: string;
  valorCentavos: number;
  conta: string | null;
  historico: string;
  confianca: number | null;
  justificativa: string | null;
};

export type ImovelRepasse = {
  imovel: string;
  locatario: string;
  contaDestino: string | null;
  aluguelEsperadoCentavos: number;
  recebidoCentavos: number;
  diferencaCentavos: number;
  situacao: "recebido" | "parcial" | "excedente" | "nao_recebido";
  recebimentos: LancamentoRepasse[];
};

export type Repasse = {
  formato: "vh-fechamento";
  versao: number;
  competencia: string;
  geradoEm: string;
  status: string;
  moeda: "centavos";
  imoveis: ImovelRepasse[];
  dividendos: LancamentoRepasse[];
  tributos: LancamentoRepasse[];
  outros: LancamentoRepasse[];
  naoAtribuidos: LancamentoRepasse[];
  despesas: { tipo: string; descricao: string | null; valorCentavos: number }[];
  totais: {
    receitaBrutaCentavos: number;
    condominioCentavos: number;
    iptuCentavos: number;
    receitaLiquidaCentavos: number;
  };
  pendencias: {
    propostasSemDecisao: number;
    depositosNaoAtribuidos: number;
    imoveisSemRecebimento: number;
  };
};

// Entradas, no formato em que o banco devolve.
export type ContratoLinha = {
  id: string;
  imovel: string;
  locatario: string;
  valor_centavos: number;
  account_id: string | null;
  ativo: boolean;
};

export type ConciliacaoLinha = {
  categoria: string;
  status: string;
  confianca: number | null;
  justificativa: string | null;
  contract_id: string | null;
  transactions: {
    data: string;
    historico: string;
    valor_centavos: number;
    account_id: string | null;
  } | null;
};

export type TransacaoLinha = {
  data: string;
  historico: string;
  valor_centavos: number;
  account_id: string | null;
};

/** Um real de diferença é arredondamento, não falta de pagamento. */
const TOLERANCIA_CENTAVOS = 100;

function paraLancamento(
  l: ConciliacaoLinha,
  apelido: Map<string, string>,
): LancamentoRepasse {
  const t = l.transactions;
  return {
    data: t?.data ?? "",
    valorCentavos: Math.abs(Number(t?.valor_centavos ?? 0)),
    conta: t?.account_id ? (apelido.get(t.account_id) ?? null) : null,
    historico: t?.historico ?? "",
    confianca: l.confianca,
    justificativa: l.justificativa,
  };
}

export function montarRepasse(entrada: {
  competencia: string;
  status: string;
  geradoEm: string;
  contratos: ContratoLinha[];
  conciliacoes: ConciliacaoLinha[];
  transacoes: TransacaoLinha[];
  despesas: { tipo: string; descricao: string | null; valor_centavos: number }[];
  contas: { id: string; apelido: string }[];
}): Repasse {
  const apelido = new Map(entrada.contas.map((c) => [c.id, c.apelido]));

  // Só o que foi APROVADO entra. Proposta pendente é opinião do agente, e
  // opinião não pode virar linha da planilha que vai para a contabilidade.
  const aprovadas = entrada.conciliacoes.filter((l) => l.status === "aprovada");
  const porCategoria = (c: string) => aprovadas.filter((l) => l.categoria === c);

  const alugueis = porCategoria("aluguel");
  const recebidoPorContrato = new Map<string, ConciliacaoLinha[]>();
  for (const l of alugueis) {
    if (!l.contract_id) continue;
    recebidoPorContrato.set(l.contract_id, [...(recebidoPorContrato.get(l.contract_id) ?? []), l]);
  }

  // TODO imóvel ativo aparece, inclusive o que não recebeu nada. Omitir o que
  // ficou em zero faria a planilha parecer que o imóvel não existe, quando o
  // que houve foi inadimplência — informação que some justamente no mês em
  // que ela importa.
  const imoveis: ImovelRepasse[] = entrada.contratos
    .filter((c) => c.ativo)
    .map((c) => {
      const itens = recebidoPorContrato.get(c.id) ?? [];
      const recebidoCentavos = itens.reduce(
        (s, l) => s + Math.abs(Number(l.transactions?.valor_centavos ?? 0)),
        0,
      );
      const esperado = Number(c.valor_centavos);
      const diferenca = recebidoCentavos - esperado;

      const situacao: ImovelRepasse["situacao"] =
        recebidoCentavos === 0
          ? "nao_recebido"
          : Math.abs(diferenca) <= TOLERANCIA_CENTAVOS
            ? "recebido"
            : diferenca < 0
              ? "parcial"
              : "excedente";

      return {
        imovel: c.imovel,
        locatario: c.locatario,
        contaDestino: c.account_id ? (apelido.get(c.account_id) ?? null) : null,
        aluguelEsperadoCentavos: esperado,
        recebidoCentavos,
        diferencaCentavos: diferenca,
        situacao,
        recebimentos: itens
          .map((l) => paraLancamento(l, apelido))
          .sort((a, b) => a.data.localeCompare(b.data)),
      };
    })
    .sort((a, b) => a.imovel.localeCompare(b.imovel, "pt-BR"));

  // Crédito do período que ninguém sequer propôs classificar. É a lista que
  // impede uma receita de sumir por esquecimento.
  const comProposta = new Set(
    entrada.conciliacoes.map((l) => `${l.transactions?.data}|${l.transactions?.valor_centavos}`),
  );
  const naoAtribuidos: LancamentoRepasse[] = entrada.transacoes
    .filter((t) => Number(t.valor_centavos) > 0 && !comProposta.has(`${t.data}|${t.valor_centavos}`))
    .map((t) => ({
      data: t.data,
      valorCentavos: Number(t.valor_centavos),
      conta: t.account_id ? (apelido.get(t.account_id) ?? null) : null,
      historico: t.historico,
      confianca: null,
      justificativa: null,
    }));

  const receitaBruta = imoveis.reduce((s, i) => s + i.recebidoCentavos, 0);
  const somar = (tipo: string) =>
    entrada.despesas
      .filter((d) => d.tipo === tipo)
      .reduce((s, d) => s + Math.abs(Number(d.valor_centavos)), 0);
  const condominio = somar("condominio");
  const iptu = somar("iptu");

  return {
    formato: "vh-fechamento",
    versao: VERSAO_REPASSE,
    competencia: entrada.competencia,
    geradoEm: entrada.geradoEm,
    status: entrada.status,
    moeda: "centavos",
    imoveis,
    dividendos: porCategoria("dividendo").map((l) => paraLancamento(l, apelido)),
    tributos: porCategoria("darf").map((l) => paraLancamento(l, apelido)),
    outros: porCategoria("outro").map((l) => paraLancamento(l, apelido)),
    naoAtribuidos,
    despesas: entrada.despesas.map((d) => ({
      tipo: d.tipo,
      descricao: d.descricao,
      valorCentavos: Math.abs(Number(d.valor_centavos)),
    })),
    totais: {
      receitaBrutaCentavos: receitaBruta,
      condominioCentavos: condominio,
      iptuCentavos: iptu,
      receitaLiquidaCentavos: receitaBruta - condominio - iptu,
    },
    pendencias: {
      propostasSemDecisao: entrada.conciliacoes.filter((l) => l.status === "proposta").length,
      depositosNaoAtribuidos: naoAtribuidos.length,
      imoveisSemRecebimento: imoveis.filter((i) => i.situacao === "nao_recebido").length,
    },
  };
}
