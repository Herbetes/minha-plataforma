import { describe, expect, it } from "vitest";
import { casarImovel, lerCondominios, type LinhaPlanilha } from "./vh-planilha";

const PLANILHA: LinhaPlanilha[] = [
  ["HERBETES FABIANA FINANCEIRO", null, null],
  [null, null, null],
  ["AGOSTO 2026", null, null],
  ["Imóvel", "Vencimento", "Valor"],
  ["FLAT 602 - BEACH CLASS", "10/08/2026", 420.5],
  ["SALA 1801", "10/08/2026", "1.250,00"],
  ["FLAT 602 - BEACH CLASS", "10/08/2026", 80],
  [null, null, null],
  ["APT 301", "10/08/2026", "R$ 690,00"],
];

describe("lerCondominios", () => {
  const r = lerCondominios(PLANILHA);

  it("acha o cabeçalho mesmo com título e linhas em branco antes", () => {
    expect(r.cabecalhoEncontrado).toContain("Imóvel");
  });

  it("lê valor que veio como número da célula", () => {
    expect(r.condominios.find((c) => c.imovel.includes("APT 301"))?.valorCentavos).toBe(69000);
  });

  it("lê valor que veio como texto no formato brasileiro", () => {
    expect(r.condominios.find((c) => c.imovel === "SALA 1801")?.valorCentavos).toBe(125000);
  });

  it("SOMA quando o imóvel aparece duas vezes — taxa principal mais extra", () => {
    const flat = r.condominios.find((c) => c.imovel.includes("FLAT 602"));
    expect(flat?.valorCentavos).toBe(42050 + 8000);
  });

  it("não repete o imóvel na saída", () => {
    const nomes = r.condominios.map((c) => c.imovel);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("pula linha em branco e conta quantas ignorou", () => {
    expect(r.ignoradas).toBeGreaterThan(0);
  });

  it("quando não acha cabeçalho, devolve vazio e mostra o que encontrou", () => {
    const r2 = lerCondominios([["a", "b"], ["1", "2"]]);
    expect(r2.condominios).toEqual([]);
    expect(r2.cabecalhoEncontrado).toEqual(["a", "b"]);
  });
});

describe("casarImovel", () => {
  const cadastro = [
    { id: "1", imovel: "Flat 602 - Beach Class Executive" },
    { id: "2", imovel: "Sala 1801 - Empresarial Center" },
    { id: "3", imovel: "Apartamento 301 - Boa Viagem" },
  ];

  it("casa mesmo com o nome escrito diferente nas duas fontes", () => {
    expect(casarImovel("FLAT 602 - BEACH CLASS", cadastro)?.id).toBe("1");
  });

  it("casa por número quando o nome é curto", () => {
    expect(casarImovel("SALA 1801", cadastro)?.id).toBe("2");
  });

  it("prefere não casar a casar errado", () => {
    expect(casarImovel("GARAGEM AVULSA", cadastro)).toBeNull();
  });

  it("devolve nulo para nome vazio", () => {
    expect(casarImovel("", cadastro)).toBeNull();
  });

  it("devolve nulo com cadastro vazio", () => {
    expect(casarImovel("FLAT 602", [])).toBeNull();
  });
});

describe("casarImovel — casos que a planilha real trouxe", () => {
  const cadastro = [
    { id: "a", imovel: "FLAT 602 - BEACH CLASS EXECUTIVE" },
    { id: "b", imovel: "APTO 402 - VIA CAPIBARIBE" },
    { id: "c", imovel: "SALA 804 - RIO MAR TORRE A" },
    { id: "d", imovel: "SALA 1801 - RIO MAR TORRE C" },
    { id: "e", imovel: "SALA 1802 - RIO MAR TORRE C" },
    { id: "f", imovel: "APTO 701 - MARIA YONE" },
  ];

  it("ignora o zero à esquerda que a planilha de pagamentos usa", () => {
    expect(casarImovel("COND. EDF BEACH CLASS EXECUTIVE 0602 Controlar", cadastro)?.id).toBe("a");
  });

  it("casa a taxa extra no mesmo imóvel da taxa principal", () => {
    expect(casarImovel("COND. EDF BEACH CLASS EXECUTIVE 0602 TAXA EXTRA", cadastro)?.id).toBe("a");
  });

  it("o número da unidade decide mesmo quando o resto do nome não bate", () => {
    // "RM TRADE CENTER" e "RIO MAR TORRE" não compartilham palavra nenhuma.
    expect(casarImovel("CONDOMÍNIO RM TRADE CENTER - A 0804", cadastro)?.id).toBe("c");
  });

  it("não confunde 1801 com 1802 — número diferente é imóvel diferente", () => {
    expect(casarImovel("CONDOMÍNIO RM TRADE CENTER - SALA 1801", cadastro)?.id).toBe("d");
    expect(casarImovel("CONDOMÍNIO RM TRADE CENTER - SALA 1802", cadastro)?.id).toBe("e");
  });

  it("palavras de enfeite não derrubam o casamento", () => {
    expect(casarImovel("CONDOMÍNIO VIA CAPIBARIBE + TX EXTRA", cadastro)?.id).toBe("b");
  });

  it("casa sem número quando o nome próprio basta", () => {
    expect(casarImovel("CONDOMÍNIO MARIA YONE", cadastro)?.id).toBe("f");
  });

  it("recusa despesa que não é de imóvel nenhum", () => {
    expect(casarImovel("BRADESCO SAÚDE - 4.374,06", cadastro)).toBeNull();
    expect(casarImovel("CURSO DE INGLÊS - HEITOR VIEIRA", cadastro)).toBeNull();
    expect(casarImovel("E. SOCIAL", cadastro)).toBeNull();
  });

  it("recusa condomínio de imóvel que não está no cadastro", () => {
    expect(casarImovel("CONDOMÍNIO PIER DE NASSAU", cadastro)).toBeNull();
    expect(casarImovel("CONDOMÍNIO RES.ASA BRANCA - GRAVATÁ", cadastro)).toBeNull();
  });
});

describe("lerCondominios — a aba de pagamentos da Fabiana", () => {
  const aba: LinhaPlanilha[] = [
    ["PAGAMENTOS MENSAIS HERBETES - AGOSTO/2026", null, null, null, null],
    ["Nome ", "Vencimento", "R$ BRUTO", "DESCONTO", "LÍQUIDO"],
    ["CONDOMÍNIO MARIA YONE", 10, 1790, 150, 1640],
    ["COND. EDF BEACH CLASS EXECUTIVE 0602 Controlar", 10, 1218.54, null, 1218.54],
  ];

  it("acha o cabeçalho abaixo do título, com a coluna chamada só 'Nome'", () => {
    const r = lerCondominios(aba);
    expect(r.cabecalhoEncontrado?.[0]?.trim()).toBe("Nome");
    expect(r.condominios).toHaveLength(2);
  });

  it("pega o BRUTO, não o LÍQUIDO — desconto é negociação, não despesa menor", () => {
    const r = lerCondominios(aba);
    expect(r.condominios[0].valorCentavos).toBe(179_000);
    expect(r.condominios[0].valorCentavos).not.toBe(164_000);
  });
});
