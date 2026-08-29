import { describe, expect, it } from "vitest";
import {
  type Contrato,
  type Lancamento,
  candidatos,
  competencia,
  impressaoDigital,
  lerCSV,
  lerOFX,
  paraCentavos,
  paraDataISO,
  pontuar,
} from "./vh";

const contrato: Contrato = {
  id: "c1",
  imovel: "Rua A, 100",
  locatario: "João da Silva Souza",
  documento: "123.456.789-00",
  valorCentavos: 300000, // R$ 3.000,00
  diaVencimento: 5,
};

const lanc = (over: Partial<Lancamento> = {}): Lancamento => ({
  data: "2026-08-05",
  historico: "TED RECEBIDA JOAO SILVA SOUZA",
  documento: null,
  valorCentavos: 300000,
  ...over,
});

describe("paraCentavos", () => {
  it("lê o formato brasileiro com milhar e vírgula", () => {
    expect(paraCentavos("1.234,56")).toBe(123456);
    expect(paraCentavos("3.000,00")).toBe(300000);
  });

  it("lê valor simples e com R$", () => {
    expect(paraCentavos("250,00")).toBe(25000);
    expect(paraCentavos("R$ 1.500,00")).toBe(150000);
  });

  it("lê negativo, que é débito", () => {
    expect(paraCentavos("-450,90")).toBe(-45090);
  });

  it("lê o formato americano sem vírgula decimal", () => {
    expect(paraCentavos("3000.00")).toBe(300000);
  });

  it("não inventa número a partir de texto", () => {
    expect(paraCentavos("saldo anterior")).toBeNull();
    expect(paraCentavos("")).toBeNull();
  });

  it("arredonda para o centavo, sem sobra de ponto flutuante", () => {
    expect(paraCentavos("0,1")).toBe(10);
    expect(paraCentavos("1234,565")).toBe(123457);
  });
});

describe("paraDataISO", () => {
  it("lê dd/mm/aaaa", () => expect(paraDataISO("05/08/2026")).toBe("2026-08-05"));
  it("lê d/m/aa", () => expect(paraDataISO("5/8/26")).toBe("2026-08-05"));
  it("lê aaaa-mm-dd", () => expect(paraDataISO("2026-08-05")).toBe("2026-08-05"));
  it("lê o formato do OFX", () => expect(paraDataISO("20260805120000")).toBe("2026-08-05"));
  it("recusa mês impossível", () => expect(paraDataISO("05/13/2026")).toBeNull());
  it("recusa texto", () => expect(paraDataISO("ontem")).toBeNull());
});

describe("impressaoDigital", () => {
  it("é igual para o mesmo lançamento — não duplica ao reenviar o extrato", () => {
    expect(impressaoDigital(lanc())).toBe(impressaoDigital(lanc()));
  });

  it("ignora diferença só de espaço e caixa no histórico", () => {
    const a = impressaoDigital(lanc({ historico: "TED  JOAO" }));
    const b = impressaoDigital(lanc({ historico: "ted joao" }));
    expect(a).toBe(b);
  });

  it("muda quando o valor muda", () => {
    expect(impressaoDigital(lanc())).not.toBe(impressaoDigital(lanc({ valorCentavos: 300001 })));
  });

  it("muda quando a data muda", () => {
    expect(impressaoDigital(lanc())).not.toBe(impressaoDigital(lanc({ data: "2026-08-06" })));
  });
});

describe("lerCSV", () => {
  it("acha as colunas pelo nome, em qualquer ordem", () => {
    const csv = [
      "Valor;Data;Histórico;Documento",
      '3.000,00;05/08/2026;"TED JOAO SILVA";123',
    ].join("\n");

    const { lancamentos } = lerCSV(csv);
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0]).toMatchObject({
      data: "2026-08-05",
      valorCentavos: 300000,
      documento: "123",
    });
  });

  it("aceita vírgula como separador de coluna", () => {
    const csv = "Data,Historico,Valor\n05/08/2026,PIX ALUGUEL,3000.00";
    expect(lerCSV(csv).lancamentos).toHaveLength(1);
  });

  it("respeita aspas com separador dentro", () => {
    const csv = 'Data;Historico;Valor\n05/08/2026;"PIX; ALUGUEL AGOSTO";3.000,00';
    expect(lerCSV(csv).lancamentos[0].historico).toBe("PIX; ALUGUEL AGOSTO");
  });

  it("pula linha de saldo em vez de quebrar, e conta quantas ignorou", () => {
    const csv = [
      "Data;Historico;Valor",
      "05/08/2026;TED JOAO;3.000,00",
      ";SALDO ANTERIOR;",
      "06/08/2026;PIX MARIA;1.200,00",
    ].join("\n");

    const { lancamentos, ignoradas } = lerCSV(csv);
    expect(lancamentos).toHaveLength(2);
    expect(ignoradas).toBe(1);
  });

  it("não inventa lançamento quando o cabeçalho é irreconhecível", () => {
    expect(lerCSV("a;b;c\n1;2;3").lancamentos).toEqual([]);
  });

  it("devolve vazio para arquivo vazio", () => {
    expect(lerCSV("").lancamentos).toEqual([]);
  });
});

describe("lerOFX", () => {
  it("lê os lançamentos do bloco STMTTRN", () => {
    const ofx = `
      <STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260805<TRNAMT>3000.00
      <MEMO>TED JOAO SILVA<CHECKNUM>987</STMTTRN>
      <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260810<TRNAMT>-450.90
      <MEMO>TARIFA</STMTTRN>`;

    const { lancamentos } = lerOFX(ofx);
    expect(lancamentos).toHaveLength(2);
    expect(lancamentos[0]).toMatchObject({ valorCentavos: 300000, documento: "987" });
    expect(lancamentos[1].valorCentavos).toBe(-45090);
  });

  it("devolve vazio quando não há bloco nenhum", () => {
    expect(lerOFX("<OFX></OFX>").lancamentos).toEqual([]);
  });
});

describe("pontuar", () => {
  it("dá nota alta quando valor, data e nome batem", () => {
    const r = pontuar(lanc(), contrato);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.motivos.join(" ")).toContain("valor idêntico");
  });

  it("desconta quando o valor difere", () => {
    const exato = pontuar(lanc(), contrato).score;
    const diferente = pontuar(lanc({ valorCentavos: 250000 }), contrato).score;
    expect(diferente).toBeLessThan(exato);
  });

  it("reconhece o final do CPF no histórico", () => {
    const r = pontuar(lanc({ historico: "PIX RECEBIDO 456.789 REF ALUGUEL" }), contrato);
    expect(r.motivos.join(" ")).toContain("CPF/CNPJ");
  });

  it("não passa de 100", () => {
    const r = pontuar(lanc({ historico: "TED JOAO SILVA SOUZA 456789" }), contrato);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("dá nota zero e explica quando nada bate", () => {
    const r = pontuar(lanc({ historico: "TARIFA BANCARIA", valorCentavos: 5000 }), contrato);
    expect(r.score).toBe(0);
    expect(r.motivos[0]).toContain("nada em comum");
  });

  it("não pontua por data quando o valor não bate — coincidência não é indício", () => {
    // Tarifa que caiu exatamente no dia do vencimento.
    const r = pontuar(lanc({ historico: "TARIFA MENSALIDADE", valorCentavos: 3500 }), contrato);
    expect(r.score).toBe(0);
  });

  it("sempre devolve pelo menos um motivo", () => {
    expect(pontuar(lanc({ historico: "X", valorCentavos: 1 }), contrato).motivos.length)
      .toBeGreaterThan(0);
  });
});

describe("candidatos", () => {
  it("ordena do mais provável para o menos", () => {
    const outro: Contrato = { ...contrato, id: "c2", locatario: "Maria Souza", valorCentavos: 120000 };
    const lista = candidatos(lanc(), [outro, contrato]);
    expect(lista[0].contratoId).toBe("c1");
    expect(lista[0].score).toBeGreaterThan(lista[1].score);
  });

  it("respeita o limite pedido", () => {
    const muitos = Array.from({ length: 10 }, (_, i) => ({ ...contrato, id: `c${i}` }));
    expect(candidatos(lanc(), muitos, 3)).toHaveLength(3);
  });
});

describe("competencia", () => {
  it("usa o próprio mês no caso comum", () => {
    expect(competencia("2026-08-05", 5)).toBe("2026-08");
  });

  it("joga pagamento adiantado do fim do mês para o mês seguinte", () => {
    expect(competencia("2026-08-28", 5)).toBe("2026-09");
  });

  it("vira o ano corretamente em dezembro", () => {
    expect(competencia("2026-12-30", 5)).toBe("2027-01");
  });

  it("não adianta quando o vencimento é no fim do mês", () => {
    expect(competencia("2026-08-28", 30)).toBe("2026-08");
  });

  it("usa o próprio mês quando não há dia de vencimento", () => {
    expect(competencia("2026-08-28", null)).toBe("2026-08");
  });
});
