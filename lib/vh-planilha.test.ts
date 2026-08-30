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
