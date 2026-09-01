import { describe, expect, it } from "vitest";
import { assunto, corpoHtml, corpoTexto, escaparHtml } from "./radar-email";
import type { Alerta } from "./radar";

function alerta(over: Partial<Alerta> = {}): Alerta {
  return {
    tipo: "vencimento",
    severidade: "critico",
    titulo: "Contrato vence",
    detalhe: "Sala 302",
    ordem: 0,
    ...over,
  };
}

describe("escaparHtml", () => {
  it("neutraliza tag vinda do banco", () => {
    expect(escaparHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("escapa aspas, que quebrariam o atributo href", () => {
    expect(escaparHtml('a"b')).toBe("a&quot;b");
  });
});

describe("assunto", () => {
  it("conta os críticos, que é o que se lê na notificação", () => {
    expect(assunto([alerta(), alerta()], "2026-09-01")).toBe("Radar VH 01/09: 2 críticos");
  });

  it("usa o singular quando é um só", () => {
    expect(assunto([alerta()], "2026-09-01")).toBe("Radar VH 01/09: 1 crítico");
  });

  it("soma as duas faixas", () => {
    const a = assunto([alerta(), alerta({ severidade: "atencao" })], "2026-09-01");
    expect(a).toBe("Radar VH 01/09: 1 crítico, 1 em atenção");
  });

  it("diz que está tudo em ordem quando não há nada", () => {
    expect(assunto([], "2026-09-01")).toContain("tudo em ordem");
  });

  it("informativo sozinho não vira contagem no assunto", () => {
    expect(assunto([alerta({ severidade: "informativo" })], "2026-09-01")).toContain("tudo em ordem");
  });
});

describe("corpoTexto", () => {
  it("traz o resumo e cada alerta", () => {
    const t = corpoTexto([alerta()], "Dois contratos pedem atenção.", "2026-09-01");
    expect(t).toContain("Dois contratos pedem atenção.");
    expect(t).toContain("[CRÍTICO] Contrato vence");
    expect(t).toContain("Sala 302");
  });

  it("diz explicitamente quando não há nada, em vez de ficar em branco", () => {
    expect(corpoTexto([], "", "2026-09-01")).toContain("Nada exigindo atenção");
  });
});

describe("corpoHtml", () => {
  it("escapa o conteúdo dos alertas", () => {
    const h = corpoHtml([alerta({ titulo: "<b>x</b>" })], "", "2026-09-01", "https://ex.com");
    expect(h).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("leva o link de volta para a plataforma", () => {
    expect(corpoHtml([], "", "2026-09-01", "https://ex.com/app/radar")).toContain(
      "https://ex.com/app/radar",
    );
  });

  it("omite o bloco de resumo quando não há resumo", () => {
    expect(corpoHtml([alerta()], "", "2026-09-01", "https://ex.com")).not.toContain("#f1f5f9");
  });
});
