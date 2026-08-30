"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatarCentavos, paraCentavos } from "@/lib/vh";
import PortalHeader from "../../portal-header";
import ImportarPlanilha from "./importar-planilha";

export type Conta = {
  id: string;
  apelido: string;
  titular: string | null;
  tipo: "pj" | "pf";
  banco: string | null;
};

export type Contrato = {
  id: string;
  imovel: string;
  locatario: string;
  documento: string | null;
  valor_centavos: number;
  dia_vencimento: number | null;
  indice_reajuste: string | null;
  account_id: string | null;
  padroes: string[] | null;
  ativo: boolean;
};

export type Proposta = {
  id: string;
  categoria: "aluguel" | "dividendo" | "darf" | "outro";
  competencia: string | null;
  confianca: number;
  justificativa: string;
  status: "proposta" | "aprovada" | "rejeitada";
  contract_id: string | null;
  transactions: { data: string; historico: string; valor_centavos: number } | null;
};

const CATEGORIAS: Record<Proposta["categoria"], string> = {
  aluguel: "Aluguel",
  dividendo: "Dividendo",
  darf: "DARF / tributo",
  outro: "Outro",
};

/**
 * A confiança precisa ser lida de relance. Cor sozinha não basta para quem
 * enxerga pouca diferença entre tons, por isso vem sempre com o número e uma
 * palavra.
 */
function faixaConfianca(c: number) {
  if (c >= 90) return { rotulo: "alta", classe: "bg-marca-100 text-marca-700" };
  if (c >= 70) return { rotulo: "boa", classe: "bg-marca-50 text-marca-600" };
  if (c >= 40) return { rotulo: "revisar", classe: "bg-realce-500/10 text-realce-600" };
  return { rotulo: "incerta", classe: "bg-realce-600/15 text-realce-600" };
}

export default function VhClient({
  email,
  contratosIniciais,
  propostasIniciais,
  contasIniciais,
}: {
  email: string;
  contratosIniciais: Contrato[];
  propostasIniciais: Proposta[];
  contasIniciais: Conta[];
}) {
  const router = useRouter();

  const [aba, setAba] = useState<"propostas" | "contratos" | "contas">("propostas");
  /** De qual conta veio o extrato que está sendo enviado. */
  const [contaExtrato, setContaExtrato] = useState<string>("");
  const [novaConta, setNovaConta] = useState({ apelido: "", titular: "", tipo: "pj" as "pj" | "pf" });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  /** Correção de contrato escolhida na tela, ainda não aprovada. */
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});

  const [novo, setNovo] = useState({
    imovel: "",
    locatario: "",
    documento: "",
    valor: "",
    diaVencimento: "",
    indiceReajuste: "",
    contaId: "",
    padroes: "",
  });

  const pendentes = useMemo(
    () => propostasIniciais.filter((p) => p.status === "proposta"),
    [propostasIniciais],
  );
  const decididas = propostasIniciais.length - pendentes.length;

  async function pedir(url: string, metodo: string, corpo?: unknown) {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await r.json().catch(() => null);
    if (!r.ok) throw new Error(dados?.error ?? `Falha ${r.status}`);
    return dados;
  }

  async function acao(chave: string, fn: () => Promise<void>) {
    setErro(null);
    setAviso(null);
    setOcupado(chave);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setOcupado(null);
    }
  }

  // ------------------------------------------------------------- contratos

  async function criarContrato(evento: React.FormEvent) {
    evento.preventDefault();
    const centavos = paraCentavos(novo.valor);
    if (centavos === null || centavos <= 0) {
      setErro("Valor do aluguel inválido. Escreva como 3.000,00");
      return;
    }

    await acao("novo-contrato", async () => {
      await pedir("/api/vh/contratos", "POST", {
        imovel: novo.imovel,
        locatario: novo.locatario,
        documento: novo.documento || null,
        valorCentavos: centavos,
        diaVencimento: novo.diaVencimento ? Number(novo.diaVencimento) : null,
        indiceReajuste: novo.indiceReajuste || null,
        contaId: novo.contaId || null,
        padroes: novo.padroes
          .split(/[,;\n]/)
          .map((p) => p.trim())
          .filter((p) => p.length >= 2),
      });
      setNovo({
        imovel: "", locatario: "", documento: "", valor: "",
        diaVencimento: "", indiceReajuste: "", contaId: "", padroes: "",
      });
    });
  }

  async function apagarContrato(c: Contrato) {
    if (!window.confirm(`Apagar o contrato de ${c.locatario}?`)) return;
    await acao(`apagar-${c.id}`, async () => {
      await pedir(`/api/vh/contratos/${c.id}`, "DELETE");
    });
  }

  // ----------------------------------------------------------------- contas

  async function criarConta(evento: React.FormEvent) {
    evento.preventDefault();
    if (!novaConta.apelido.trim()) return;

    await acao("nova-conta", async () => {
      await pedir("/api/vh/contas", "POST", {
        apelido: novaConta.apelido,
        titular: novaConta.titular || null,
        tipo: novaConta.tipo,
      });
      setNovaConta({ apelido: "", titular: "", tipo: "pj" });
    });
  }

  // --------------------------------------------------------------- extrato

  async function enviarExtrato(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    if (!contaExtrato) {
      setErro("Escolha primeiro de qual conta veio este extrato.");
      evento.target.value = "";
      return;
    }

    await acao("extrato", async () => {
      const conteudo = await arquivo.text();
      const r = await pedir("/api/vh/extratos", "POST", {
        nome: arquivo.name,
        conteudo,
        contaId: contaExtrato,
      });
      setAviso(
        `${r.lidos} lançamentos lidos · ${r.novos} novos · ${r.repetidos} já existiam` +
          (r.ignoradas ? ` · ${r.ignoradas} linhas ignoradas` : ""),
      );
    });
    evento.target.value = "";
  }

  // -------------------------------------------------------------- conciliar

  async function rodarAgente() {
    await acao("conciliar", async () => {
      const r = await pedir("/api/vh/conciliar", "POST", {});
      setResumo(r.resumo);
      setAviso(
        `${r.propostas} propostas · ${r.iteracoes} idas ao modelo · ` +
          `${r.inputTokens + r.outputTokens} tokens`,
      );
    });
  }

  async function decidir(p: Proposta, status: "aprovada" | "rejeitada", contratoId?: string | null) {
    await acao(`decidir-${p.id}`, async () => {
      await pedir(`/api/vh/conciliacoes/${p.id}`, "PATCH", {
        status,
        ...(contratoId !== undefined ? { contratoId } : {}),
      });
    });
  }

  // ---------------------------------------------------------------- visual

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader email={email} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold text-marca-900">Cadastro</h1>
          <Link href="/app/vh" className="text-sm font-medium text-marca-600 underline underline-offset-2">
            Voltar aos meses
          </Link>
        </div>
        <p className="mt-2 text-marca-700/75">
          Contas que recebem, contratos de locação e as propostas do agente. É a
          base contra a qual cada extrato é conferido.
        </p>

        {erro && (
          <p role="alert" className="mt-4 rounded-md bg-realce-500/10 px-3 py-2 text-sm text-realce-600">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="mt-4 rounded-md bg-marca-50 px-3 py-2 text-sm text-marca-700">{aviso}</p>
        )}

        {/* ---------------------------------------------------------- abas */}
        <div className="mt-8 flex gap-2 border-b border-marca-100">
          {(
            [
              ["propostas", `Para revisar (${pendentes.length})`],
              ["contratos", `Contratos (${contratosIniciais.length})`],
              ["contas", `Contas (${contasIniciais.length})`],
            ] as const
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              onClick={() => setAba(chave)}
              className={
                aba === chave
                  ? "-mb-px border-b-2 border-marca-600 px-3 py-2 text-sm font-semibold text-marca-700"
                  : "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-marca-700/60"
              }
            >
              {rotulo}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------ propostas */}
        {aba === "propostas" && (
          <section className="mt-6">
            {pendentes.length === 0 ? (
              <p className="text-sm text-marca-700/60">
                Nada para revisar.{" "}
                {decididas > 0 && `${decididas} proposta(s) já decidida(s).`}
              </p>
            ) : (
              <ul className="space-y-3">
                {pendentes.map((p) => {
                  const faixa = faixaConfianca(p.confianca);
                  const t = p.transactions;
                  return (
                    <li key={p.id} className="rounded-lg border border-marca-100 bg-white p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-marca-900">
                            {t ? formatarCentavos(Number(t.valor_centavos)) : "—"}
                            <span className="ml-2 font-normal text-marca-700/60">
                              {t?.data}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-xs text-marca-700/70">
                            {t?.historico}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${faixa.classe}`}>
                          {p.confianca}% · {faixa.rotulo}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-marca-50 px-2 py-1 font-medium text-marca-700">
                          {CATEGORIAS[p.categoria]}
                        </span>
                        {p.competencia && (
                          <span className="text-marca-700/60">competência {p.competencia}</span>
                        )}
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-marca-700">
                        {p.justificativa}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`contrato-${p.id}`}>
                          Contrato da proposta
                        </label>
                        <select
                          id={`contrato-${p.id}`}
                          value={escolhas[p.id] ?? p.contract_id ?? ""}
                          onChange={(e) =>
                            setEscolhas((atual) => ({ ...atual, [p.id]: e.target.value }))
                          }
                          disabled={ocupado === `decidir-${p.id}`}
                          className="rounded-md border border-marca-300 bg-white px-2 py-1.5 text-xs text-marca-700"
                        >
                          <option value="">Sem contrato</option>
                          {contratosIniciais.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.locatario} — {formatarCentavos(Number(c.valor_centavos))}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            decidir(p, "aprovada", escolhas[p.id] ?? p.contract_id ?? null)
                          }
                          disabled={ocupado === `decidir-${p.id}`}
                          className="rounded-md bg-marca-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          onClick={() => decidir(p, "rejeitada")}
                          disabled={ocupado === `decidir-${p.id}`}
                          className="rounded-md border border-marca-300 px-4 py-1.5 text-xs font-medium text-marca-700 transition hover:bg-marca-50 disabled:opacity-50"
                        >
                          Rejeitar
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-marca-700/50">
                        Corrija o contrato no seletor se o agente errou; só o
                        botão Aprovar registra a decisão.
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ------------------------------------------------------ contratos */}
        {aba === "contratos" && (
          <section className="mt-6 space-y-6">
            <ImportarPlanilha contas={contasIniciais.map((c) => c.apelido)} />

            <form
              onSubmit={criarContrato}
              className="grid gap-3 rounded-lg border border-marca-100 bg-white p-4 sm:grid-cols-2"
            >
              <input
                required
                value={novo.locatario}
                onChange={(e) => setNovo({ ...novo, locatario: e.target.value })}
                placeholder="Locatário *"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <input
                required
                value={novo.imovel}
                onChange={(e) => setNovo({ ...novo, imovel: e.target.value })}
                placeholder="Imóvel *"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <input
                required
                inputMode="decimal"
                value={novo.valor}
                onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
                placeholder="Valor do aluguel * (3.000,00)"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <input
                inputMode="numeric"
                value={novo.diaVencimento}
                onChange={(e) => setNovo({ ...novo, diaVencimento: e.target.value })}
                placeholder="Dia do vencimento (5)"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <input
                value={novo.documento}
                onChange={(e) => setNovo({ ...novo, documento: e.target.value })}
                placeholder="CPF/CNPJ do locatário"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <input
                value={novo.indiceReajuste}
                onChange={(e) => setNovo({ ...novo, indiceReajuste: e.target.value })}
                placeholder="Índice de reajuste (IGP-M)"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <select
                value={novo.contaId}
                onChange={(e) => setNovo({ ...novo, contaId: e.target.value })}
                className="rounded-md border border-marca-300 bg-white px-3 py-2 text-sm text-marca-700 outline-none focus:border-marca-600"
              >
                <option value="">Conta que recebe este aluguel...</option>
                {contasIniciais.map((c) => (
                  <option key={c.id} value={c.id}>{c.apelido}</option>
                ))}
              </select>
              <input
                value={novo.padroes}
                onChange={(e) => setNovo({ ...novo, padroes: e.target.value })}
                placeholder="Como aparece no extrato (separe por vírgula)"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600 sm:col-span-2"
              />
              <button
                type="submit"
                disabled={ocupado === "novo-contrato"}
                className="rounded-md bg-marca-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
              >
                Adicionar contrato
              </button>
              <p className="text-xs text-marca-700/60 sm:col-span-2">
                CPF/CNPJ e dia de vencimento não são obrigatórios, mas melhoram
                muito a pontuação. <strong>A conta que recebe</strong> evita que o
                agente confunda imóveis de contas diferentes. E os{" "}
                <strong>padrões de extrato</strong> são o que mais ajuda: escreva
                como o pagador aparece no banco, que costuma ser diferente do nome
                do contrato — por exemplo <code>J S SOUZA, SOUZA COMERCIO</code>.
              </p>
            </form>

            {contratosIniciais.length > 0 && (
              <ul className="mt-4 divide-y divide-marca-100 rounded-lg border border-marca-100 bg-white">
                {contratosIniciais.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-marca-900">{c.locatario}</p>
                      <p className="mt-0.5 truncate text-xs text-marca-700/60">
                        {c.imovel} · {formatarCentavos(Number(c.valor_centavos))}
                        {c.dia_vencimento && ` · vence dia ${c.dia_vencimento}`}
                        {c.indice_reajuste && ` · ${c.indice_reajuste}`}
                        {c.account_id &&
                          ` · ${contasIniciais.find((a) => a.id === c.account_id)?.apelido ?? "conta"}`}
                        {c.padroes && c.padroes.length > 0 &&
                          ` · ${c.padroes.length} padrão(ões) de extrato`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => apagarContrato(c)}
                      disabled={ocupado === `apagar-${c.id}`}
                      className="shrink-0 text-xs font-medium text-realce-600 underline underline-offset-2 disabled:opacity-50"
                    >
                      Apagar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {/* --------------------------------------------------------- contas */}
        {aba === "contas" && (
          <section className="mt-6">
            <p className="text-sm text-marca-700/75">
              Os aluguéis chegam por mais de uma conta, e cada imóvel recebe na
              sua. Cadastrar as contas evita que o agente confunda imóveis — e é
              o que permite reconhecer um tributo pago por pessoa física como
              empréstimo do sócio à empresa.
            </p>

            <form
              onSubmit={criarConta}
              className="mt-4 grid gap-3 rounded-lg border border-marca-100 bg-white p-4 sm:grid-cols-3"
            >
              <input
                required
                value={novaConta.apelido}
                onChange={(e) => setNovaConta({ ...novaConta, apelido: e.target.value })}
                placeholder="Apelido * (VH, Herbetes...)"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <input
                value={novaConta.titular}
                onChange={(e) => setNovaConta({ ...novaConta, titular: e.target.value })}
                placeholder="Titular"
                className="rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600"
              />
              <select
                value={novaConta.tipo}
                onChange={(e) =>
                  setNovaConta({ ...novaConta, tipo: e.target.value as "pj" | "pf" })
                }
                className="rounded-md border border-marca-300 bg-white px-3 py-2 text-sm text-marca-700"
              >
                <option value="pj">Empresa</option>
                <option value="pf">Pessoa física</option>
              </select>
              <button
                type="submit"
                disabled={ocupado === "nova-conta"}
                className="rounded-md bg-marca-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50 sm:col-span-3 sm:justify-self-start"
              >
                Adicionar conta
              </button>
            </form>

            {contasIniciais.length > 0 && (
              <ul className="mt-4 divide-y divide-marca-100 rounded-lg border border-marca-100 bg-white">
                {contasIniciais.map((c) => (
                  <li key={c.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-marca-900">{c.apelido}</p>
                      {c.titular && (
                        <p className="mt-0.5 truncate text-xs text-marca-700/60">{c.titular}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-marca-50 px-2.5 py-0.5 text-xs font-medium text-marca-600">
                      {c.tipo === "pf" ? "pessoa física" : "empresa"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
