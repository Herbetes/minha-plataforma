/**
 * Lógica do Radar: o que merece a sua atenção nesta semana.
 *
 * Tudo aqui é cálculo puro sobre datas e valores. O modelo entra depois, só
 * para escrever o resumo em cima destes fatos — nunca para descobri-los. Um
 * alerta inventado destrói a confiança no aviso semanal inteiro.
 */

export type Severidade = "critico" | "atencao" | "informativo";

export type Alerta = {
  tipo: "vencimento" | "reajuste" | "inadimplencia" | "fechamento";
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  /** Para ordenar: quanto menor, mais urgente. */
  ordem: number;
};

export type ContratoRadar = {
  id: string;
  imovel: string;
  locatario: string;
  valorCentavos: number;
  diaVencimento: number | null;
  vigenciaFim: string | null;
  mesReajuste: number | null;
  indiceReajuste: string | null;
  ativo: boolean;
};

/** Dias entre hoje e uma data, em dias inteiros. Negativo = já passou. */
export function diasAte(dataISO: string, hoje: string): number {
  const a = Date.UTC(
    Number(hoje.slice(0, 4)),
    Number(hoje.slice(5, 7)) - 1,
    Number(hoje.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(dataISO.slice(0, 4)),
    Number(dataISO.slice(5, 7)) - 1,
    Number(dataISO.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Contratos chegando ao fim da vigência.
 *
 * Sessenta dias é o horizonte porque renovação de locação costuma exigir aviso
 * prévio — descobrir no dia do vencimento já é tarde.
 */
export function alertasDeVencimento(contratos: ContratoRadar[], hoje: string): Alerta[] {
  return contratos
    .filter((c) => c.ativo && c.vigenciaFim)
    .map((c) => ({ c, dias: diasAte(c.vigenciaFim!, hoje) }))
    .filter(({ dias }) => dias <= 60)
    .map(({ c, dias }) => ({
      tipo: "vencimento" as const,
      severidade: (dias < 0 ? "critico" : dias <= 30 ? "critico" : "atencao") as Severidade,
      titulo:
        dias < 0
          ? `Contrato VENCIDO: ${c.locatario}`
          : `Contrato vence em ${dias} dia(s): ${c.locatario}`,
      detalhe:
        `${c.imovel} · ${reais(c.valorCentavos)} · ` +
        (dias < 0
          ? `venceu em ${c.vigenciaFim} e o contrato segue marcado como ativo`
          : `vigência até ${c.vigenciaFim}`),
      ordem: dias,
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

/**
 * Reajustes do mês corrente e do próximo.
 *
 * Reajuste esquecido é dinheiro que não volta: o aluguel fica defasado até
 * alguém lembrar, e não se cobra retroativo sem briga.
 */
export function alertasDeReajuste(contratos: ContratoRadar[], hoje: string): Alerta[] {
  const mesAtual = Number(hoje.slice(5, 7));
  const proximo = mesAtual === 12 ? 1 : mesAtual + 1;

  return contratos
    .filter((c) => c.ativo && c.mesReajuste !== null)
    .filter((c) => c.mesReajuste === mesAtual || c.mesReajuste === proximo)
    .map((c) => {
      const esteMes = c.mesReajuste === mesAtual;
      return {
        tipo: "reajuste" as const,
        severidade: (esteMes ? "critico" : "atencao") as Severidade,
        titulo: `Reajuste ${esteMes ? "ESTE MÊS" : "no mês que vem"}: ${c.locatario}`,
        detalhe:
          `${c.imovel} · valor atual ${reais(c.valorCentavos)}` +
          (c.indiceReajuste ? ` · índice ${c.indiceReajuste}` : " · índice não cadastrado"),
        ordem: esteMes ? 0 : 30,
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
}

/**
 * Aluguéis do mês que ainda não apareceram.
 *
 * Só cobra depois do vencimento mais uma folga de três dias: pagamento cai com
 * atraso de compensação, e avisar no dia seria alarme falso toda semana — o
 * jeito mais rápido de fazer alguém parar de ler o aviso.
 */
export function alertasDeInadimplencia(
  contratos: ContratoRadar[],
  recebidosPorContrato: Map<string, number>,
  hoje: string,
): Alerta[] {
  const diaDeHoje = Number(hoje.slice(8, 10));
  const TOLERANCIA = 3;

  return contratos
    .filter((c) => c.ativo && c.diaVencimento !== null)
    .filter((c) => diaDeHoje > c.diaVencimento! + TOLERANCIA)
    .map((c) => {
      const recebido = recebidosPorContrato.get(c.id) ?? 0;
      const falta = c.valorCentavos - recebido;
      return { c, recebido, falta, atraso: diaDeHoje - c.diaVencimento! };
    })
    // Diferença de até um real é arredondamento, não inadimplência.
    .filter(({ falta }) => falta > 100)
    .map(({ c, recebido, falta, atraso }) => ({
      tipo: "inadimplencia" as const,
      severidade: (atraso > 15 ? "critico" : "atencao") as Severidade,
      titulo:
        recebido === 0
          ? `Aluguel não recebido: ${c.locatario}`
          : `Aluguel recebido parcialmente: ${c.locatario}`,
      detalhe:
        `${c.imovel} · esperado ${reais(c.valorCentavos)}` +
        (recebido > 0 ? ` · recebido ${reais(recebido)}` : "") +
        ` · falta ${reais(falta)} · ${atraso} dia(s) de atraso`,
      ordem: -atraso,
    }))
    .sort((a, b) => a.ordem - b.ordem);
}

/** Meses passados que ainda não foram fechados. */
export function alertasDeFechamento(
  fechamentos: { competencia: string; status: string; pendencias: number }[],
  hoje: string,
): Alerta[] {
  const mesAtual = hoje.slice(0, 7);

  return fechamentos
    .filter((f) => f.competencia < mesAtual && f.status !== "fechado")
    .map((f) => ({
      tipo: "fechamento" as const,
      severidade: "atencao" as Severidade,
      titulo: `Mês ${f.competencia} ainda não fechado`,
      detalhe:
        f.pendencias > 0
          ? `${f.pendencias} ponto(s) esperando decisão`
          : "sem pendências — falta só fechar",
      ordem: 100,
    }));
}

const PESO: Record<Severidade, number> = { critico: 0, atencao: 1, informativo: 2 };

/** Junta tudo, do mais urgente ao menos. */
export function montarAlertas(partes: Alerta[][]): Alerta[] {
  return partes
    .flat()
    .sort((a, b) => PESO[a.severidade] - PESO[b.severidade] || a.ordem - b.ordem);
}

/**
 * Vale mandar e-mail?
 *
 * Aviso semanal que chega vazio treina a pessoa a ignorar o remetente. Sem
 * nada crítico nem em atenção, o silêncio é a informação.
 */
export function valeAvisar(alertas: Alerta[]): boolean {
  return alertas.some((a) => a.severidade !== "informativo");
}

/** Chave que impede o mesmo aviso sair duas vezes no mesmo dia. */
export function chaveDoDia(hoje: string): string {
  return hoje.slice(0, 10);
}
