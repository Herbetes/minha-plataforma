import { describe, expect, it } from "vitest";
import {
  alertasDeFechamento,
  alertasDeInadimplencia,
  alertasDeReajuste,
  alertasDeVencimento,
  chaveDoDia,
  diasAte,
  montarAlertas,
  valeAvisar,
  type Alerta,
  type ContratoRadar,
} from "./radar";

function contrato(over: Partial<ContratoRadar> = {}): ContratoRadar {
  return {
    id: "c1",
    imovel: "Sala 302",
    locatario: "Padaria do Zé",
    valorCentavos: 150_000,
    diaVencimento: 10,
    vigenciaFim: null,
    mesReajuste: null,
    indiceReajuste: null,
    ativo: true,
    ...over,
  };
}

describe("diasAte", () => {
  it("conta dias inteiros para frente", () => {
    expect(diasAte("2026-09-10", "2026-09-01")).toBe(9);
  });

  it("devolve negativo para data que já passou", () => {
    expect(diasAte("2026-08-20", "2026-09-01")).toBe(-12);
  });

  it("hoje é zero", () => {
    expect(diasAte("2026-09-01", "2026-09-01")).toBe(0);
  });

  it("atravessa a virada do ano", () => {
    expect(diasAte("2027-01-01", "2026-12-31")).toBe(1);
  });

  // Em 2026 o Brasil não tem horário de verão, mas o cálculo não pode depender
  // disso: usar UTC evita o dia que "some" quando o relógio adianta.
  it("não perde um dia em virada de mês", () => {
    expect(diasAte("2026-11-01", "2026-10-31")).toBe(1);
  });
});

describe("alertasDeVencimento", () => {
  it("avisa contrato que vence dentro de 60 dias", () => {
    const a = alertasDeVencimento([contrato({ vigenciaFim: "2026-10-15" })], "2026-09-01");
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toContain("44 dia(s)");
    expect(a[0].severidade).toBe("atencao");
  });

  it("ignora contrato que vence depois do horizonte", () => {
    expect(alertasDeVencimento([contrato({ vigenciaFim: "2027-03-01" })], "2026-09-01")).toEqual([]);
  });

  it("trata os últimos 30 dias como crítico", () => {
    const a = alertasDeVencimento([contrato({ vigenciaFim: "2026-09-20" })], "2026-09-01");
    expect(a[0].severidade).toBe("critico");
  });

  it("marca como VENCIDO o contrato que passou da data e continua ativo", () => {
    const a = alertasDeVencimento([contrato({ vigenciaFim: "2026-07-01" })], "2026-09-01");
    expect(a[0].titulo).toContain("VENCIDO");
    expect(a[0].severidade).toBe("critico");
    expect(a[0].ordem).toBeLessThan(0);
  });

  it("não fala de contrato inativo", () => {
    expect(
      alertasDeVencimento([contrato({ vigenciaFim: "2026-09-05", ativo: false })], "2026-09-01"),
    ).toEqual([]);
  });

  it("não fala de contrato sem data de fim", () => {
    expect(alertasDeVencimento([contrato({ vigenciaFim: null })], "2026-09-01")).toEqual([]);
  });

  it("põe o mais urgente primeiro", () => {
    const a = alertasDeVencimento(
      [
        contrato({ id: "b", vigenciaFim: "2026-10-20" }),
        contrato({ id: "a", vigenciaFim: "2026-09-05" }),
      ],
      "2026-09-01",
    );
    expect(a.map((x) => x.ordem)).toEqual([4, 49]);
  });
});

describe("alertasDeReajuste", () => {
  it("avisa reajuste do mês corrente como crítico", () => {
    const a = alertasDeReajuste([contrato({ mesReajuste: 9, indiceReajuste: "IPCA" })], "2026-09-01");
    expect(a[0].severidade).toBe("critico");
    expect(a[0].titulo).toContain("ESTE MÊS");
    expect(a[0].detalhe).toContain("IPCA");
  });

  it("avisa reajuste do mês seguinte com antecedência", () => {
    const a = alertasDeReajuste([contrato({ mesReajuste: 10 })], "2026-09-01");
    expect(a[0].severidade).toBe("atencao");
    expect(a[0].titulo).toContain("mês que vem");
  });

  it("em dezembro, o mês seguinte é janeiro", () => {
    const a = alertasDeReajuste([contrato({ mesReajuste: 1 })], "2026-12-05");
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toContain("mês que vem");
  });

  it("cala sobre meses distantes", () => {
    expect(alertasDeReajuste([contrato({ mesReajuste: 3 })], "2026-09-01")).toEqual([]);
  });

  it("diz quando o índice não está cadastrado, em vez de omitir", () => {
    const a = alertasDeReajuste([contrato({ mesReajuste: 9, indiceReajuste: null })], "2026-09-01");
    expect(a[0].detalhe).toContain("não cadastrado");
  });

  it("o do mês corrente vem antes do próximo", () => {
    const a = alertasDeReajuste(
      [contrato({ id: "prox", mesReajuste: 10 }), contrato({ id: "hoje", mesReajuste: 9 })],
      "2026-09-01",
    );
    expect(a[0].titulo).toContain("ESTE MÊS");
  });
});

describe("alertasDeInadimplencia", () => {
  const semRecebimento = new Map<string, number>();

  it("cobra quando passou o vencimento mais a folga de 3 dias", () => {
    const a = alertasDeInadimplencia([contrato({ diaVencimento: 10 })], semRecebimento, "2026-09-14");
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toContain("não recebido");
    expect(a[0].detalhe).toContain("4 dia(s) de atraso");
  });

  it("fica quieto dentro da folga de 3 dias", () => {
    expect(
      alertasDeInadimplencia([contrato({ diaVencimento: 10 })], semRecebimento, "2026-09-13"),
    ).toEqual([]);
  });

  it("fica quieto no próprio dia do vencimento", () => {
    expect(
      alertasDeInadimplencia([contrato({ diaVencimento: 10 })], semRecebimento, "2026-09-10"),
    ).toEqual([]);
  });

  it("não cobra o que já foi recebido inteiro", () => {
    const recebidos = new Map([["c1", 150_000]]);
    expect(
      alertasDeInadimplencia([contrato({ diaVencimento: 5 })], recebidos, "2026-09-20"),
    ).toEqual([]);
  });

  it("diferença de até um real é arredondamento, não calote", () => {
    const recebidos = new Map([["c1", 149_900]]);
    expect(
      alertasDeInadimplencia([contrato({ diaVencimento: 5 })], recebidos, "2026-09-20"),
    ).toEqual([]);
  });

  it("acima de um real vira alerta de recebimento parcial", () => {
    const recebidos = new Map([["c1", 149_800]]);
    const a = alertasDeInadimplencia([contrato({ diaVencimento: 5 })], recebidos, "2026-09-20");
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toContain("parcialmente");
    expect(a[0].detalhe).toContain("2,00");
  });

  it("atraso longo é crítico", () => {
    const a = alertasDeInadimplencia([contrato({ diaVencimento: 5 })], semRecebimento, "2026-09-25");
    expect(a[0].severidade).toBe("critico");
  });

  it("atraso curto ainda é só atenção", () => {
    const a = alertasDeInadimplencia([contrato({ diaVencimento: 5 })], semRecebimento, "2026-09-15");
    expect(a[0].severidade).toBe("atencao");
  });

  it("ignora contrato inativo e contrato sem dia de vencimento", () => {
    expect(
      alertasDeInadimplencia(
        [
          contrato({ id: "a", ativo: false }),
          contrato({ id: "b", diaVencimento: null }),
        ],
        semRecebimento,
        "2026-09-25",
      ),
    ).toEqual([]);
  });

  it("o atraso maior aparece primeiro", () => {
    const a = alertasDeInadimplencia(
      [contrato({ id: "novo", diaVencimento: 15 }), contrato({ id: "velho", diaVencimento: 1 })],
      semRecebimento,
      "2026-09-25",
    );
    expect(a[0].detalhe).toContain("24 dia(s)");
  });
});

describe("alertasDeFechamento", () => {
  it("cobra mês passado ainda aberto", () => {
    const a = alertasDeFechamento(
      [{ competencia: "2026-08", status: "aberto", pendencias: 2 }],
      "2026-09-01",
    );
    expect(a[0].titulo).toContain("2026-08");
    expect(a[0].detalhe).toContain("2 ponto(s)");
  });

  it("não cobra o mês corrente, que ainda está acontecendo", () => {
    expect(
      alertasDeFechamento([{ competencia: "2026-09", status: "aberto", pendencias: 0 }], "2026-09-20"),
    ).toEqual([]);
  });

  it("não cobra mês já fechado", () => {
    expect(
      alertasDeFechamento([{ competencia: "2026-07", status: "fechado", pendencias: 0 }], "2026-09-01"),
    ).toEqual([]);
  });

  it("sem pendências, diz que falta só fechar", () => {
    const a = alertasDeFechamento(
      [{ competencia: "2026-08", status: "conferencia", pendencias: 0 }],
      "2026-09-01",
    );
    expect(a[0].detalhe).toContain("falta só fechar");
  });
});

describe("montarAlertas", () => {
  function alerta(severidade: Alerta["severidade"], ordem: number, titulo: string): Alerta {
    return { tipo: "vencimento", severidade, titulo, detalhe: "", ordem };
  }

  it("crítico vem antes de atenção, mesmo com ordem pior", () => {
    const a = montarAlertas([[alerta("atencao", -99, "atencao")], [alerta("critico", 99, "critico")]]);
    expect(a.map((x) => x.titulo)).toEqual(["critico", "atencao"]);
  });

  it("dentro da mesma severidade, desempata pela ordem", () => {
    const a = montarAlertas([[alerta("critico", 5, "b"), alerta("critico", 1, "a")]]);
    expect(a.map((x) => x.titulo)).toEqual(["a", "b"]);
  });

  it("informativo fica por último", () => {
    const a = montarAlertas([[alerta("informativo", -100, "info"), alerta("atencao", 100, "at")]]);
    expect(a.map((x) => x.titulo)).toEqual(["at", "info"]);
  });

  it("lista vazia continua vazia", () => {
    expect(montarAlertas([[], []])).toEqual([]);
  });
});

describe("valeAvisar", () => {
  it("não manda e-mail quando não há nada", () => {
    expect(valeAvisar([])).toBe(false);
  });

  it("não manda e-mail só por informativo", () => {
    expect(
      valeAvisar([{ tipo: "fechamento", severidade: "informativo", titulo: "x", detalhe: "", ordem: 0 }]),
    ).toBe(false);
  });

  it("manda quando há algo em atenção", () => {
    expect(
      valeAvisar([{ tipo: "reajuste", severidade: "atencao", titulo: "x", detalhe: "", ordem: 0 }]),
    ).toBe(true);
  });
});

describe("chaveDoDia", () => {
  it("mesma data gera a mesma chave, o que barra o envio repetido", () => {
    expect(chaveDoDia("2026-09-01T23:59:59.000Z")).toBe(chaveDoDia("2026-09-01"));
  });

  it("dias diferentes geram chaves diferentes", () => {
    expect(chaveDoDia("2026-09-01")).not.toBe(chaveDoDia("2026-09-02"));
  });
});
