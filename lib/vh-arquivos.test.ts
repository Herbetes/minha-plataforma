import { describe, expect, it } from "vitest";
import {
  classificarArquivo,
  competenciaDominante,
  conferirSaldo,
  identificarConta,
  lerExtratoPDF,
  valoresConferem,
} from "./vh-arquivos";

/**
 * Layout REAL do extrato do BB, conferido contra extratos de verdade.
 * Os nomes e valores são inventados; o formato é o do banco.
 *
 * Variante PJ: cabeçalho "Dia Lote Documento Histórico Valor" — o valor sai
 * na linha ANTERIOR à data.
 */
const EXTRATO_PJ = `
Extrato de Conta Corrente
Cliente EXEMPLO PARTICIPACOES S-A
Agência: 1234-5 Conta: 98765-4
Lançamentos
Dia Lote Documento Histórico Valor
1.000,00 (+)
31/07/2026 Saldo Anterior
3.000,00 (+)
03/08/2026 14397 41602423362072
Pix - Recebido
03/08 16:02 12345678000199 EMPRESA EXEM
45,90 (-)
03/08/2026 13113 882151100354056
Tarifa Pacote de Serviços
Cobrança referente 03/08/2026
3.954,10 (+)
00/00/0000 14397 Saldo do dia
890,32 (-)
15/08/2026 13105 81501 Pagamento de Impostos
RFB-DARF CODIGO DE BARRAS
3.063,78 (+)
31/08/2026 S A L D O
Informações Adicionais
3.063,78 (+)Saldo
`;

/**
 * Variante PF: cabeçalho "Dia Documento ValorLote Histórico" — data e valor
 * na MESMA linha. É o mesmo relatório do banco, com as colunas em outra ordem.
 */
const EXTRATO_PF = `
Extrato de Conta Corrente
Cliente FULANO DE TAL
Agência: 3237-9 Conta: 219685-9Período: 01 a 31/08/2026
Lançamentos
Dia Documento ValorLote Histórico
31/07/2026 1.849,81 (+)Saldo Anterior
05/08/2026 2.900,00 (+)14397 51132137894702
Pix - Recebido
05/08 11:32 00007597761996 ISABELA SIZ
06/08/2026 132,00 (-)13105 80601
Pix - Enviado
06/08 14:57 ADMILTON CAMPELO VILELA F
4.617,81 (+)Saldo do dia
31/08/2026 4.617,81 (+)S A L D O
`;

/** O que o resto dos testes usa quando o formato não é o assunto. */
const EXTRATO_PDF = EXTRATO_PJ;

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

describe("lerExtratoPDF — variante PJ (valor antes da data)", () => {
  const r = lerExtratoPDF(EXTRATO_PJ);

  it("lê os três movimentos, sem confundir com as linhas de saldo", () => {
    expect(r.lancamentos).toHaveLength(3);
    expect(r.ignoradas).toBe(0);
  });

  it("crédito é positivo e débito é negativo, pelo marcador do próprio extrato", () => {
    expect(r.lancamentos[0].valorCentavos).toBe(300000);
    expect(r.lancamentos[1].valorCentavos).toBe(-4590);
    expect(r.lancamentos[2].valorCentavos).toBe(-89032);
  });

  it("junta as linhas de continuação, que é onde está o pagador", () => {
    expect(r.lancamentos[0].historico).toContain("Pix - Recebido");
    expect(r.lancamentos[0].historico).toContain("EMPRESA EXEM");
  });

  it("não deixa o valor vazar para dentro do histórico", () => {
    expect(r.lancamentos[0].historico).not.toContain("3.000,00");
  });

  it("guarda o documento do PAGADOR, não o do banco", () => {
    expect(r.lancamentos[0].documento).toBe("12345678000199");
    expect(r.lancamentos[0].documento).not.toBe("41602423362072");
  });

  it("deixa o documento nulo quando o pagador não traz CPF nem CNPJ", () => {
    expect(r.lancamentos[1].documento).toBeNull();
  });

  it("descarta o 'Saldo do dia' com data 00/00/0000", () => {
    expect(r.lancamentos.some((l) => l.data.startsWith("0000"))).toBe(false);
    expect(r.lancamentos.some((l) => l.valorCentavos === 395410)).toBe(false);
  });

  it("captura saldo inicial e final para a conferência", () => {
    expect(r.saldoInicial).toBe(100000);
    expect(r.saldoFinal).toBe(306378);
  });

  it("para de ler quando o extrato passa a falar de outra coisa", () => {
    // "Informações Adicionais" repete o saldo; lê-lo viraria um lançamento
    // fantasma que estouraria a conferência.
    expect(r.lancamentos).toHaveLength(3);
  });
});

describe("lerExtratoPDF — variante PF (data e valor na mesma linha)", () => {
  const r = lerExtratoPDF(EXTRATO_PF);

  it("lê os dois movimentos", () => {
    expect(r.lancamentos).toHaveLength(2);
    expect(r.ignoradas).toBe(0);
  });

  it("respeita o sinal", () => {
    expect(r.lancamentos[0].valorCentavos).toBe(290000);
    expect(r.lancamentos[1].valorCentavos).toBe(-13200);
  });

  it("acha o CPF do pagador mesmo com os zeros à esquerda que o BB põe", () => {
    expect(r.lancamentos[0].documento).toBe("00007597761996");
  });

  it("não conta o 'Saldo do dia' que vem sem data", () => {
    expect(r.lancamentos.some((l) => l.valorCentavos === 461781)).toBe(false);
  });

  it("captura os saldos", () => {
    expect(r.saldoInicial).toBe(184981);
    expect(r.saldoFinal).toBe(461781);
  });
});

describe("conferirSaldo", () => {
  it("fecha no centavo nas duas variantes", () => {
    for (const texto of [EXTRATO_PJ, EXTRATO_PF]) {
      const r = conferirSaldo(lerExtratoPDF(texto));
      expect(r.confere).toBe(true);
      expect(r.diferencaCentavos).toBe(0);
    }
  });

  it("acusa quando falta um lançamento", () => {
    const leitura = lerExtratoPDF(EXTRATO_PJ);
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
