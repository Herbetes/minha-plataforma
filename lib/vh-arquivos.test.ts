import { describe, expect, it } from "vitest";
import {
  classificarArquivo,
  competenciaDominante,
  conferirSaldo,
  identificarConta,
  lerExtratoPDF,
  valoresConferem,
} from "./vh-arquivos";

/** Texto no formato que o pdf devolve: uma linha por movimento. */
const EXTRATO_PDF = `
Banco do Brasil
Extrato de Conta Corrente
Agência: 1234-5   Conta corrente: 98765-4
Período: 01/08/2026 a 31/08/2026

Data       Histórico                    Documento    Valor      Saldo
01/08/2026 Saldo Anterior                                     12.500,00 C
03/08/2026 TED-CREDITO JOAO SILVA        123456       3.000,00 C 15.500,00 C
05/08/2026 PIX RECEBIDO MARIA SOUZA      789012       1.200,00 C 16.700,00 C
10/08/2026 TARIFA PACOTE SERVICOS                        45,90 D 16.654,10 C
15/08/2026 DARF RECEITA FEDERAL          445566        890,32 D 15.763,78 C
31/08/2026 Saldo Final                                        15.763,78 C
`;

describe("classificarArquivo", () => {
  it("reconhece extrato pelo conteúdo, mesmo com nome sem sentido", () => {
    expect(classificarArquivo("doc1.pdf", EXTRATO_PDF)).toBe("extrato");
  });

  it("reconhece contrato de locação", () => {
    const c = "CONTRATO DE LOCAÇÃO\nLOCADOR: VH Participações\nLOCATÁRIA: Maria\nCLÁUSULA PRIMEIRA";
    expect(classificarArquivo("arquivo.pdf", c)).toBe("contrato");
  });

  it("reconhece planilha pela extensão", () => {
    expect(classificarArquivo("Fabiana Financeiro.xlsx", "")).toBe("planilha");
  });

  it("reconhece OFX pelo bloco de transação", () => {
    expect(classificarArquivo("x.txt", "<STMTTRN><TRNAMT>10.00</STMTTRN>")).toBe("extrato");
  });

  it("admite não saber, em vez de chutar", () => {
    expect(classificarArquivo("foto.pdf", "receita de bolo de fubá")).toBe("desconhecido");
  });
});

describe("identificarConta", () => {
  it("acha agência e conta no cabeçalho", () => {
    const r = identificarConta(EXTRATO_PDF);
    expect(r.agencia).toBe("1234-5");
    expect(r.conta).toBe("98765-4");
  });

  it("devolve nulo quando não há cabeçalho", () => {
    expect(identificarConta("qualquer texto")).toEqual({ agencia: null, conta: null });
  });
});

describe("lerExtratoPDF", () => {
  const r = lerExtratoPDF(EXTRATO_PDF);

  it("lê os quatro movimentos, sem contar as linhas de saldo", () => {
    expect(r.lancamentos).toHaveLength(4);
  });

  it("pega o valor do movimento, não o saldo corrido da linha", () => {
    expect(r.lancamentos[0].valorCentavos).toBe(300000);
    expect(r.lancamentos[1].valorCentavos).toBe(120000);
  });

  it("entende o marcador D como débito", () => {
    expect(r.lancamentos[2].valorCentavos).toBe(-4590);
    expect(r.lancamentos[3].valorCentavos).toBe(-89032);
  });

  it("limpa o histórico dos números", () => {
    expect(r.lancamentos[0].historico).toContain("JOAO SILVA");
    expect(r.lancamentos[0].historico).not.toContain("3.000,00");
  });

  it("captura o documento quando existe", () => {
    expect(r.lancamentos[0].documento).toBe("123456");
  });

  it("captura saldo inicial e final para a conferência", () => {
    expect(r.saldoInicial).toBe(1250000);
    expect(r.saldoFinal).toBe(1576378);
  });

  it("devolve vazio para texto que não é extrato", () => {
    expect(lerExtratoPDF("nada aqui").lancamentos).toEqual([]);
  });
});

describe("conferirSaldo", () => {
  it("fecha quando todos os lançamentos foram lidos", () => {
    const r = conferirSaldo(lerExtratoPDF(EXTRATO_PDF));
    expect(r.confere).toBe(true);
    expect(r.diferencaCentavos).toBe(0);
  });

  it("acusa quando falta um lançamento", () => {
    const leitura = lerExtratoPDF(EXTRATO_PDF);
    leitura.lancamentos.pop(); // some com o DARF
    const r = conferirSaldo(leitura);
    expect(r.confere).toBe(false);
    expect(r.diferencaCentavos).toBe(-89032);
  });

  it("não afirma nada quando o PDF não trouxe saldo", () => {
    const r = conferirSaldo({ lancamentos: [], ignoradas: 0, saldoInicial: null, saldoFinal: null });
    expect(r.confere).toBeNull();
  });
});

describe("valoresConferem — a trava contra número inventado", () => {
  const leitura = lerExtratoPDF(EXTRATO_PDF);

  it("aprova valores que estão no documento", () => {
    expect(valoresConferem(EXTRATO_PDF, leitura.lancamentos).ok).toBe(true);
  });

  it("rejeita valor que não aparece no texto, e diz qual", () => {
    const inventado = [
      ...leitura.lancamentos,
      { data: "2026-08-20", historico: "PIX INVENTADO", documento: null, valorCentavos: 999999 },
    ];
    const r = valoresConferem(EXTRATO_PDF, inventado);
    expect(r.ok).toBe(false);
    expect(r.ausentes).toContain("9.999,99");
  });

  it("aceita valor escrito sem separador de milhar no documento", () => {
    const texto = "05/08/2026 PIX 3000,00 C";
    const l = [{ data: "2026-08-05", historico: "PIX", documento: null, valorCentavos: 300000 }];
    expect(valoresConferem(texto, l).ok).toBe(true);
  });

  it("lista vazia passa", () => {
    expect(valoresConferem("", []).ok).toBe(true);
  });
});

describe("competenciaDominante", () => {
  it("usa o mês da maioria dos lançamentos", () => {
    expect(competenciaDominante(lerExtratoPDF(EXTRATO_PDF).lancamentos)).toBe("2026-08");
  });

  it("ignora um lançamento perdido de outro mês", () => {
    const l = lerExtratoPDF(EXTRATO_PDF).lancamentos;
    l.push({ data: "2026-07-31", historico: "X", documento: null, valorCentavos: 100 });
    expect(competenciaDominante(l)).toBe("2026-08");
  });

  it("devolve nulo para lista vazia", () => {
    expect(competenciaDominante([])).toBeNull();
  });
});
