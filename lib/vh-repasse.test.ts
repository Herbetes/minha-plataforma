import { describe, expect, it } from "vitest";
import {
  VERSAO_REPASSE,
  type ConciliacaoLinha,
  type ContratoLinha,
  montarRepasse,
} from "./vh-repasse";

const CONTAS = [
  { id: "conta-vh", apelido: "VH" },
  { id: "conta-h", apelido: "Herbetes" },
];

function contrato(over: Partial<ContratoLinha> = {}): ContratoLinha {
  return {
    id: "c1",
    imovel: "FLAT 602",
    locatario: "João da Silva",
    valor_centavos: 280_000,
    account_id: "conta-h",
    ativo: true,
    ...over,
  };
}

function conciliacao(over: Partial<ConciliacaoLinha> = {}): ConciliacaoLinha {
  return {
    categoria: "aluguel",
    status: "aprovada",
    confianca: 92,
    justificativa: "valor e pagador batem",
    contract_id: "c1",
    transactions: {
      data: "2026-08-05",
      historico: "DEP JOAO DA SILVA",
      valor_centavos: 280_000,
      account_id: "conta-h",
    },
    ...over,
  };
}

function montar(over: Partial<Parameters<typeof montarRepasse>[0]> = {}) {
  return montarRepasse({
    competencia: "2026-08",
    status: "conferencia",
    geradoEm: "2026-09-01T12:00:00.000Z",
    contratos: [contrato()],
    conciliacoes: [conciliacao()],
    transacoes: [],
    despesas: [],
    contas: CONTAS,
    ...over,
  });
}

describe("montarRepasse — identificação do pacote", () => {
  it("carimba formato e versão, para a skill recusar o que não conhece", () => {
    const r = montar();
    expect(r.formato).toBe("vh-fechamento");
    expect(r.versao).toBe(VERSAO_REPASSE);
  });

  it("diz que o dinheiro está em centavos, em vez de deixar adivinhar", () => {
    expect(montar().moeda).toBe("centavos");
  });
});

describe("montarRepasse — imóveis", () => {
  it("traz o recebimento casado com o imóvel e traduz a conta", () => {
    const r = montar();
    expect(r.imoveis).toHaveLength(1);
    expect(r.imoveis[0]).toMatchObject({
      imovel: "FLAT 602",
      contaDestino: "Herbetes",
      aluguelEsperadoCentavos: 280_000,
      recebidoCentavos: 280_000,
      situacao: "recebido",
    });
    expect(r.imoveis[0].recebimentos[0].conta).toBe("Herbetes");
  });

  it("soma depósitos parcelados do mesmo imóvel", () => {
    const r = montar({
      conciliacoes: [
        conciliacao({ transactions: { data: "2026-08-05", historico: "DEP 1", valor_centavos: 140_000, account_id: "conta-h" } }),
        conciliacao({ transactions: { data: "2026-08-20", historico: "DEP 2", valor_centavos: 140_000, account_id: "conta-h" } }),
      ],
    });
    expect(r.imoveis[0].recebidoCentavos).toBe(280_000);
    expect(r.imoveis[0].situacao).toBe("recebido");
    expect(r.imoveis[0].recebimentos).toHaveLength(2);
  });

  it("ordena os recebimentos por data", () => {
    const r = montar({
      conciliacoes: [
        conciliacao({ transactions: { data: "2026-08-20", historico: "B", valor_centavos: 140_000, account_id: "conta-h" } }),
        conciliacao({ transactions: { data: "2026-08-05", historico: "A", valor_centavos: 140_000, account_id: "conta-h" } }),
      ],
    });
    expect(r.imoveis[0].recebimentos.map((x) => x.historico)).toEqual(["A", "B"]);
  });

  it("um real de diferença ainda é 'recebido' — isso é arredondamento", () => {
    const r = montar({
      conciliacoes: [
        conciliacao({ transactions: { data: "2026-08-05", historico: "DEP", valor_centavos: 279_900, account_id: "conta-h" } }),
      ],
    });
    expect(r.imoveis[0].situacao).toBe("recebido");
  });

  it("acima da tolerância vira parcial, com a diferença explícita", () => {
    const r = montar({
      conciliacoes: [
        conciliacao({ transactions: { data: "2026-08-05", historico: "DEP", valor_centavos: 200_000, account_id: "conta-h" } }),
      ],
    });
    expect(r.imoveis[0].situacao).toBe("parcial");
    expect(r.imoveis[0].diferencaCentavos).toBe(-80_000);
  });

  it("recebimento a mais é sinalizado, não escondido", () => {
    const r = montar({
      conciliacoes: [
        conciliacao({ transactions: { data: "2026-08-05", historico: "DEP", valor_centavos: 400_000, account_id: "conta-h" } }),
      ],
    });
    expect(r.imoveis[0].situacao).toBe("excedente");
  });

  it("imóvel que não recebeu nada APARECE — sumir esconderia a inadimplência", () => {
    const r = montar({ conciliacoes: [] });
    expect(r.imoveis).toHaveLength(1);
    expect(r.imoveis[0].situacao).toBe("nao_recebido");
    expect(r.imoveis[0].recebidoCentavos).toBe(0);
    expect(r.pendencias.imoveisSemRecebimento).toBe(1);
  });

  it("contrato inativo fica de fora", () => {
    const r = montar({ contratos: [contrato({ ativo: false })], conciliacoes: [] });
    expect(r.imoveis).toEqual([]);
  });

  it("proposta ainda não aprovada não conta como recebida", () => {
    const r = montar({ conciliacoes: [conciliacao({ status: "proposta" })] });
    expect(r.imoveis[0].recebidoCentavos).toBe(0);
    expect(r.pendencias.propostasSemDecisao).toBe(1);
  });

  it("proposta rejeitada também não conta", () => {
    const r = montar({ conciliacoes: [conciliacao({ status: "rejeitada" })] });
    expect(r.imoveis[0].recebidoCentavos).toBe(0);
    expect(r.pendencias.propostasSemDecisao).toBe(0);
  });
});

describe("montarRepasse — outras categorias", () => {
  it("separa dividendo, tributo e outro em listas próprias", () => {
    const r = montar({
      conciliacoes: [
        conciliacao({ categoria: "dividendo", contract_id: null }),
        conciliacao({ categoria: "darf", contract_id: null }),
        conciliacao({ categoria: "outro", contract_id: null }),
      ],
    });
    expect(r.dividendos).toHaveLength(1);
    expect(r.tributos).toHaveLength(1);
    expect(r.outros).toHaveLength(1);
    expect(r.imoveis[0].situacao).toBe("nao_recebido");
  });

  it("guarda a conta de onde o DARF saiu — é o que distingue empréstimo do sócio", () => {
    const r = montar({
      conciliacoes: [
        conciliacao({
          categoria: "darf",
          contract_id: null,
          transactions: { data: "2026-08-20", historico: "DARF", valor_centavos: -50_000, account_id: "conta-h" },
        }),
      ],
    });
    expect(r.tributos[0].conta).toBe("Herbetes");
    expect(r.tributos[0].valorCentavos).toBe(50_000);
  });
});

describe("montarRepasse — não atribuídos", () => {
  it("lista o crédito que ninguém sequer propôs classificar", () => {
    const r = montar({
      conciliacoes: [],
      transacoes: [
        { data: "2026-08-11", historico: "DEP DESCONHECIDO", valor_centavos: 90_000, account_id: "conta-vh" },
      ],
    });
    expect(r.naoAtribuidos).toHaveLength(1);
    expect(r.naoAtribuidos[0].conta).toBe("VH");
    expect(r.pendencias.depositosNaoAtribuidos).toBe(1);
  });

  it("não repete o que já tem proposta, mesmo pendente", () => {
    const r = montar({
      conciliacoes: [conciliacao({ status: "proposta" })],
      transacoes: [
        { data: "2026-08-05", historico: "DEP JOAO DA SILVA", valor_centavos: 280_000, account_id: "conta-h" },
      ],
    });
    expect(r.naoAtribuidos).toEqual([]);
  });

  it("débito não entra: a lista é de receita que pode se perder", () => {
    const r = montar({
      conciliacoes: [],
      transacoes: [
        { data: "2026-08-11", historico: "TARIFA", valor_centavos: -3_000, account_id: "conta-vh" },
      ],
    });
    expect(r.naoAtribuidos).toEqual([]);
  });
});

describe("montarRepasse — totais", () => {
  it("fecha receita bruta, despesas e líquida", () => {
    const r = montar({
      despesas: [
        { tipo: "condominio", descricao: "FLAT 602", valor_centavos: 42_000 },
        { tipo: "iptu", descricao: "FLAT 602", valor_centavos: 9_500 },
      ],
    });
    expect(r.totais.receitaBrutaCentavos).toBe(280_000);
    expect(r.totais.condominioCentavos).toBe(42_000);
    expect(r.totais.iptuCentavos).toBe(9_500);
    expect(r.totais.receitaLiquidaCentavos).toBe(280_000 - 42_000 - 9_500);
  });

  it("despesa gravada como negativa não inverte o total", () => {
    const r = montar({
      despesas: [{ tipo: "condominio", descricao: null, valor_centavos: -42_000 }],
    });
    expect(r.totais.condominioCentavos).toBe(42_000);
  });

  it("a receita bruta é a soma dos imóveis, não dos lançamentos soltos", () => {
    const r = montar({
      contratos: [contrato(), contrato({ id: "c2", imovel: "SALA 1801", locatario: "Lorena", valor_centavos: 420_000, account_id: "conta-vh" })],
      conciliacoes: [
        conciliacao(),
        conciliacao({ contract_id: "c2", transactions: { data: "2026-08-06", historico: "DEP LORENA", valor_centavos: 420_000, account_id: "conta-vh" } }),
      ],
    });
    expect(r.totais.receitaBrutaCentavos).toBe(700_000);
    expect(r.imoveis.map((i) => i.imovel)).toEqual(["FLAT 602", "SALA 1801"]);
  });
});
