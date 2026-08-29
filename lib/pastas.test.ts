import { describe, expect, it } from "vitest";
import {
  criarPastaSchema,
  moverDocumentoSchema,
  nomeJaExiste,
  normalizarNomePasta,
  perguntaComPastaSchema,
} from "./pastas";

describe("normalizarNomePasta", () => {
  it("remove espaço nas pontas", () => {
    expect(normalizarNomePasta("  VH  ")).toBe("VH");
  });

  it("colapsa espaços repetidos, que seriam invisíveis na tela", () => {
    expect(normalizarNomePasta("Contratos   de    Locação")).toBe("Contratos de Locação");
  });

  it("troca quebra de linha e tabulação por espaço", () => {
    expect(normalizarNomePasta("Saúde\n\tExames")).toBe("Saúde Exames");
  });
});

describe("criarPastaSchema", () => {
  it("aceita e já devolve normalizado", () => {
    expect(criarPastaSchema.parse({ nome: "  VH  " }).nome).toBe("VH");
  });

  it("recusa nome que só tem espaço", () => {
    expect(criarPastaSchema.safeParse({ nome: "   " }).success).toBe(false);
  });

  it("recusa nome longo demais", () => {
    expect(criarPastaSchema.safeParse({ nome: "a".repeat(61) }).success).toBe(false);
  });

  it("aceita exatamente no limite", () => {
    expect(criarPastaSchema.safeParse({ nome: "a".repeat(60) }).success).toBe(true);
  });
});

describe("nomeJaExiste", () => {
  it("ignora maiúsculas: VH e vh são a mesma pasta", () => {
    expect(nomeJaExiste("vh", ["VH", "Saúde"])).toBe(true);
  });

  it("ignora espaço sobrando", () => {
    expect(nomeJaExiste("  Saúde ", ["Saúde"])).toBe(true);
  });

  it("deixa passar nome realmente novo", () => {
    expect(nomeJaExiste("IRPF", ["VH", "Saúde"])).toBe(false);
  });

  it("lida com lista vazia", () => {
    expect(nomeJaExiste("VH", [])).toBe(false);
  });
});

describe("moverDocumentoSchema", () => {
  it("aceita null, que é tirar o documento de toda pasta", () => {
    expect(moverDocumentoSchema.parse({ pastaId: null }).pastaId).toBeNull();
  });

  it("recusa id que não é uuid", () => {
    expect(moverDocumentoSchema.safeParse({ pastaId: "vh" }).success).toBe(false);
  });
});

describe("perguntaComPastaSchema", () => {
  it("aceita pergunta sem pasta — procura em tudo", () => {
    const r = perguntaComPastaSchema.parse({ pergunta: "qual o reajuste?" });
    expect(r.pastaId).toBeUndefined();
  });

  it("aceita pergunta com pasta", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(perguntaComPastaSchema.parse({ pergunta: "reajuste", pastaId: id }).pastaId).toBe(id);
  });

  it("recusa pergunta curta demais", () => {
    expect(perguntaComPastaSchema.safeParse({ pergunta: "oi" }).success).toBe(false);
  });
});
