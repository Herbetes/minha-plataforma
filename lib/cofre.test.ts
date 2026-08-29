import { describe, expect, it } from "vitest";
import {
  MAX_TRECHO,
  caminhoStorage,
  dividirEmTrechos,
  montarConsulta,
  perguntaSchema,
} from "./cofre";

describe("montarConsulta", () => {
  it("une os termos com OU, para pergunta específica não voltar vazia", () => {
    expect(montarConsulta("qual o reajuste")).toBe("reajuste");
    expect(montarConsulta("reajuste anual IGPM")).toBe("reajuste | anual | igpm");
  });

  it("descarta palavras vazias e termos curtos", () => {
    expect(montarConsulta("qual é o valor do aluguel")).toBe("valor | aluguel");
  });

  it("remove termos repetidos", () => {
    expect(montarConsulta("aluguel aluguel ALUGUEL")).toBe("aluguel");
  });

  it("preserva acentos, que o dicionário português usa", () => {
    expect(montarConsulta("locatário vigência")).toBe("locatário | vigência");
  });

  it("não deixa passar operador de tsquery vindo do usuário", () => {
    const q = montarConsulta("reajuste & (DROP | tabela):*");
    expect(q).toBe("reajuste | drop | tabela");
    expect(q).not.toMatch(/[&():*!]/);
  });

  it("devolve null quando não sobra nenhum termo útil", () => {
    expect(montarConsulta("o que é")).toBeNull();
    expect(montarConsulta("!!! ??")).toBeNull();
  });
});

describe("dividirEmTrechos", () => {
  it("abre um trecho novo a cada cláusula", () => {
    const contrato = [
      "CLÁUSULA PRIMEIRA - DO OBJETO",
      "Locação do imóvel situado na Rua A, 100.",
      "CLÁUSULA SEGUNDA - DO ALUGUEL",
      "O aluguel mensal é de R$ 3.000,00.",
    ].join("\n");

    const trechos = dividirEmTrechos(contrato);
    const texto = trechos.map((t) => t.content).join("\n");

    expect(trechos.length).toBeGreaterThan(0);
    expect(texto).toContain("CLÁUSULA PRIMEIRA");
    expect(texto).toContain("R$ 3.000,00");
  });

  it("mantém a cláusula junto do texto dela", () => {
    const contrato =
      "CLÁUSULA TERCEIRA - DO REAJUSTE\nO valor será reajustado pelo IGP-M.";
    const [primeiro] = dividirEmTrechos(contrato);

    expect(primeiro.content).toContain("CLÁUSULA TERCEIRA");
    expect(primeiro.content).toContain("IGP-M");
  });

  it("parte bloco maior que o limite, respeitando o tamanho", () => {
    const gigante = "A ".repeat(MAX_TRECHO * 2);
    const trechos = dividirEmTrechos(gigante);

    expect(trechos.length).toBeGreaterThan(1);
    for (const t of trechos) expect(t.content.length).toBeLessThanOrEqual(MAX_TRECHO);
  });

  it("numera os trechos em sequência a partir de zero", () => {
    const trechos = dividirEmTrechos("X ".repeat(MAX_TRECHO * 2));
    expect(trechos.map((t) => t.ordinal)).toEqual(trechos.map((_, i) => i));
  });

  it("não devolve trechos vazios", () => {
    const trechos = dividirEmTrechos("linha\n\n\n\n\noutra linha");
    for (const t of trechos) expect(t.content.trim().length).toBeGreaterThan(0);
  });

  it("devolve lista vazia para texto em branco", () => {
    expect(dividirEmTrechos("")).toEqual([]);
    expect(dividirEmTrechos("   \n\n  ")).toEqual([]);
  });
});

describe("caminhoStorage", () => {
  it("põe o id do usuário como pasta, que é o que o RLS confere", () => {
    const p = caminhoStorage("abc-123", "contrato.pdf");
    expect(p.startsWith("abc-123/")).toBe(true);
  });

  it("neutraliza acento, espaço e tentativa de subir de pasta", () => {
    const p = caminhoStorage("u1", "../../contrato de locação (2024).pdf");
    expect(p).toMatch(/^u1\/\d+-[a-zA-Z0-9.\-_]+$/);
    expect(p).not.toContain("..");
    expect(p).not.toContain(" ");
  });
});

describe("perguntaSchema", () => {
  it("aceita uma pergunta normal", () => {
    expect(perguntaSchema.safeParse({ pergunta: "qual o reajuste?" }).success).toBe(true);
  });

  it("recusa pergunta vazia ou curta demais", () => {
    expect(perguntaSchema.safeParse({ pergunta: "" }).success).toBe(false);
    expect(perguntaSchema.safeParse({ pergunta: "oi" }).success).toBe(false);
  });
});
