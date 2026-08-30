import { describe, expect, it } from "vitest";
import {
  casarConta,
  dataParaISO,
  diaDeVencimento,
  documentoLimpo,
  lerCadastroImoveis,
  mesDeReajuste,
} from "./vh-cadastro";
import type { LinhaPlanilha } from "./vh-planilha";

describe("dataParaISO", () => {
  it("lê a data que o Excel devolve como objeto", () => {
    expect(dataParaISO(new Date(Date.UTC(2024, 7, 1)))).toBe("2024-08-01");
  });

  it("lê o formato brasileiro digitado à mão", () => {
    expect(dataParaISO("01/08/2024")).toBe("2024-08-01");
  });

  it("aceita um dígito no dia e no mês", () => {
    expect(dataParaISO("1/8/2024")).toBe("2024-08-01");
  });

  it("ano de dois dígitos é deste século — não existe locação de 1924", () => {
    expect(dataParaISO("31/07/26")).toBe("2026-07-31");
  });

  it("recusa data impossível em vez de arredondar para alguma coisa", () => {
    expect(dataParaISO("31/13/2024")).toBeNull();
  });

  it("devolve nulo para texto que não é data", () => {
    expect(dataParaISO("indeterminado")).toBeNull();
    expect(dataParaISO("")).toBeNull();
  });
});

describe("mesDeReajuste", () => {
  it("aceita o número puro", () => {
    expect(mesDeReajuste(7)).toBe(7);
  });

  it("aceita a abreviação com ano, como a planilha escreve", () => {
    expect(mesDeReajuste("JUL/2026")).toBe(7);
  });

  it("aceita o mês por extenso", () => {
    expect(mesDeReajuste("julho")).toBe(7);
  });

  it("aceita a data inteira do aniversário do contrato", () => {
    expect(mesDeReajuste("01/07/2026")).toBe(7);
  });

  it("entende março mesmo sem acento", () => {
    expect(mesDeReajuste("marco")).toBe(3);
    expect(mesDeReajuste("MARÇO")).toBe(3);
  });

  it("devolve nulo em vez de chutar", () => {
    expect(mesDeReajuste("anual")).toBeNull();
    expect(mesDeReajuste(13)).toBeNull();
  });
});

describe("diaDeVencimento", () => {
  it("aceita o número", () => {
    expect(diaDeVencimento(10)).toBe(10);
  });

  it("tira o dia de uma data inteira", () => {
    expect(diaDeVencimento("05/08/2024")).toBe(5);
  });

  it("tira o número de um texto como 'todo dia 15'", () => {
    expect(diaDeVencimento("todo dia 15")).toBe(15);
  });

  it("recusa dia fora do calendário", () => {
    expect(diaDeVencimento(45)).toBeNull();
  });
});

describe("documentoLimpo", () => {
  it("guarda só os dígitos do CPF", () => {
    expect(documentoLimpo("123.456.789-00")).toBe("12345678900");
  });

  it("guarda só os dígitos do CNPJ", () => {
    expect(documentoLimpo("12.345.678/0001-90")).toBe("12345678000190");
  });

  it("recusa número truncado, que casaria com o inquilino errado", () => {
    expect(documentoLimpo("123.456")).toBeNull();
  });
});

describe("casarConta", () => {
  const contas = ["VH", "Herbetes", "Cláudia"];

  it("casa pelo nome exato", () => {
    expect(casarConta("Herbetes", contas)).toBe("Herbetes");
  });

  it("ignora acento e caixa", () => {
    expect(casarConta("claudia", contas)).toBe("Cláudia");
  });

  it("aceita a inicial que a planilha abrevia", () => {
    expect(casarConta("H", contas)).toBe("Herbetes");
  });

  it("não escolhe quando a inicial serve para duas contas", () => {
    expect(casarConta("C", ["Cláudia", "Caixa"])).toBeNull();
  });

  it("devolve nulo em vez de adivinhar", () => {
    expect(casarConta("Itaú", contas)).toBeNull();
  });
});

describe("lerCadastroImoveis", () => {
  const planilha: LinhaPlanilha[] = [
    ["VH PARTICIPAÇÕES LTDA", null, null, null, null, null, null],
    ["CADASTRO DE IMÓVEIS", null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    ["IMÓVEL", "LOCATÁRIO", "CPF/CNPJ", "ALUGUEL", "REAJUSTE", "ÍNDICE", "VIGÊNCIA", "CONTA"],
    ["FLAT 602", "João da Silva", "123.456.789-00", 2800, "JUL/2026", "IPCA", "31/07/2026", "H"],
    ["SALA 1801", "Lorena Ltda", "12.345.678/0001-90", "4.200,00", 6, "IGP-M", "30/06/2027", "VH"],
    ["SALA 1802", null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["FLAT 101", "VAGO", null, null, null, null, null, null],
  ];

  const contas = ["VH", "Herbetes", "Cláudia"];

  it("acha o cabeçalho abaixo do título e das linhas em branco", () => {
    const r = lerCadastroImoveis(planilha, contas);
    expect(r.cabecalho).toContain("IMÓVEL");
  });

  it("traz os contratos completos", () => {
    const r = lerCadastroImoveis(planilha, contas);
    expect(r.contratos).toHaveLength(2);
    expect(r.contratos[0]).toMatchObject({
      imovel: "FLAT 602",
      locatario: "João da Silva",
      documento: "12345678900",
      valorCentavos: 280_000,
      mesReajuste: 7,
      indiceReajuste: "IPCA",
      vigenciaFim: "2026-07-31",
      contaApelido: "Herbetes",
    });
  });

  it("lê valor escrito como texto em formato brasileiro", () => {
    const r = lerCadastroImoveis(planilha, contas);
    expect(r.contratos[1].valorCentavos).toBe(420_000);
  });

  it("descarta a linha da célula mesclada em vez de inventar valor", () => {
    const r = lerCadastroImoveis(planilha, contas);
    const d = r.descartadas.find((x) => x.identificacao === "SALA 1802");
    expect(d).toBeDefined();
    expect(d?.motivo).toContain("sem locatário");
  });

  it("descarta imóvel marcado como vago, dizendo o porquê", () => {
    const r = lerCadastroImoveis(planilha, contas);
    const d = r.descartadas.find((x) => x.identificacao === "FLAT 101");
    expect(d?.motivo).toContain("sem locatário no momento");
  });

  it("linha totalmente em branco não vira relatório de erro", () => {
    const r = lerCadastroImoveis(planilha, contas);
    expect(r.descartadas.some((d) => d.identificacao.startsWith("linha"))).toBe(false);
  });

  it("avisa quando não reconhece a conta, em vez de escolher uma", () => {
    const r = lerCadastroImoveis(
      [
        ["IMÓVEL", "LOCATÁRIO", "ALUGUEL", "CONTA"],
        ["FLAT 900", "Maria", 1000, "Bradesco"],
      ],
      contas,
    );
    expect(r.contratos[0].contaApelido).toBeNull();
    expect(r.contratos[0].avisos[0]).toContain("Bradesco");
  });

  it("avisa quando a data de vigência está ilegível, mas não perde o contrato", () => {
    const r = lerCadastroImoveis([
      ["IMÓVEL", "LOCATÁRIO", "ALUGUEL", "VIGÊNCIA"],
      ["FLAT 900", "Maria", 1000, "indeterminado"],
    ]);
    expect(r.contratos).toHaveLength(1);
    expect(r.contratos[0].vigenciaFim).toBeNull();
    expect(r.contratos[0].avisos.join(" ")).toContain("fim da vigência");
  });

  it("descarta contrato marcado como encerrado", () => {
    const r = lerCadastroImoveis([
      ["IMÓVEL", "LOCATÁRIO", "ALUGUEL", "STATUS"],
      ["FLAT 900", "Maria", 1000, "Encerrado"],
    ]);
    expect(r.contratos).toHaveLength(0);
    expect(r.descartadas[0].motivo).toContain("Encerrado");
  });

  it("guarda condomínio e IPTU nas observações, que é onde cabem hoje", () => {
    const r = lerCadastroImoveis([
      ["IMÓVEL", "LOCATÁRIO", "ALUGUEL", "CONDOMÍNIO", "IPTU"],
      ["FLAT 900", "Maria", 1000, 420, 95],
    ]);
    expect(r.contratos[0].observacoes).toContain("420.00");
    expect(r.contratos[0].observacoes).toContain("95.00");
  });

  it("diz quais campos não achou, para a tela poder avisar", () => {
    const r = lerCadastroImoveis([
      ["IMÓVEL", "LOCATÁRIO", "ALUGUEL"],
      ["FLAT 900", "Maria", 1000],
    ]);
    expect(r.camposEncontrados).toContain("imovel");
    expect(r.camposAusentes).toContain("garantia");
  });

  it("sem cabeçalho reconhecível, devolve vazio em vez de importar lixo", () => {
    const r = lerCadastroImoveis([["a", "b", "c"], [1, 2, 3]]);
    expect(r.contratos).toEqual([]);
    expect(r.cabecalho).toBeNull();
  });
});
