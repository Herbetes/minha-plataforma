"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatarCentavos } from "@/lib/vh";

export type Fechamento = {
  id: string;
  competencia: string;
  status: "aberto" | "conferencia" | "fechado";
  receita_bruta_centavos: number;
  condominio_centavos: number;
  iptu_centavos: number;
  pendencias: number;
  relatorio_md: string | null;
};

export type Arquivo = {
  id: string;
  direcao: "entrada" | "saida";
  tipo: string;
  nome: string;
  storage_path: string | null;
  status: "pendente" | "processado" | "erro";
  detalhe: string | null;
};

export type PropostaVH = {
  id: string;
  categoria: string;
  confianca: number;
  justificativa: string;
  status: "proposta" | "aprovada" | "rejeitada";
  contract_id: string | null;
  transactions: { data: string; historico: string; valor_centavos: number } | null;
};

const MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function faixa(c: number) {
  if (c >= 90) return { rotulo: "alta", classe: "bg-marca-100 text-marca-700" };
  if (c >= 70) return { rotulo: "boa", classe: "bg-marca-50 text-marca-600" };
  if (c >= 40) return { rotulo: "revisar", classe: "bg-realce-500/10 text-realce-600" };
  return { rotulo: "incerta", classe: "bg-realce-600/15 text-realce-600" };
}

export default function FechamentoClient({
  fechamento,
  arquivosIniciais,
  propostasIniciais,
  contas,
  contratos,
}: {
  fechamento: Fechamento;
  arquivosIniciais: Arquivo[];
  propostasIniciais: PropostaVH[];
  contas: { id: string; apelido: string; tipo: string }[];
  contratos: { id: string; locatario: string; valor_centavos: number }[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [contaEscolhida, setContaEscolhida] = useState("");
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});

  const [ano, mes] = fechamento.competencia.split("-");
  const titulo = `${MES[Number(mes) - 1] ?? mes} de ${ano}`;
  const fechado = fechamento.status === "fechado";

  const entrada = arquivosIniciais.filter((a) => a.direcao === "entrada");
  const saida = arquivosIniciais.filter((a) => a.direcao === "saida");
  const pendentes = propostasIniciais.filter((p) => p.status === "proposta");
  const liquida =
    Number(fechamento.receita_bruta_centavos) -
    Number(fechamento.condominio_centavos) -
    Number(fechamento.iptu_centavos);

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

  /** Aceita vários arquivos de uma vez — é assim que o mês chega na prática. */
  async function enviarArquivos(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? []);
    if (arquivos.length === 0) return;

    setErro(null);
    setAvisos([]);
    setOcupado("entrada");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const novos: string[] = [];

    for (const arquivo of arquivos) {
      try {
        if (!user) throw new Error("Sessão expirada.");
        const seguro = arquivo.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const caminho = `${user.id}/${fechamento.competencia}/${Date.now()}-${seguro}`;

        const { error: up } = await supabase.storage.from("vh").upload(caminho, arquivo);
        if (up) throw new Error(up.message);

        const r = await pedir(`/api/vh/fechamentos/${fechamento.id}/entrada`, "POST", {
          storagePath: caminho,
          nome: arquivo.name,
          bytes: arquivo.size,
          contaId: contaEscolhida || null,
        });
        novos.push(`${arquivo.name}: ${r.detalhe ?? "processado"}`);
      } catch (e) {
        novos.push(`${arquivo.name}: ${e instanceof Error ? e.message : "falhou"}`);
      }
    }

    setAvisos(novos);
    setOcupado(null);
    evento.target.value = "";
    router.refresh();
  }

  async function baixar(a: Arquivo) {
    if (!a.storage_path) return;
    await acao(`baixar-${a.id}`, async () => {
      const supabase = createClient();
      const { data } = await supabase.storage.from("vh").createSignedUrl(a.storage_path!, 60, {
        download: a.nome,
      });
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    });
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <Link href="/app/vh" className="text-sm font-medium text-marca-600 underline underline-offset-2">
        ← Todos os meses
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold capitalize text-marca-900">{titulo}</h1>
        <span className="rounded-full bg-marca-50 px-3 py-1 text-xs font-medium text-marca-600">
          {fechado ? "fechado" : fechamento.status === "conferencia" ? "em conferência" : "aberto"}
        </span>
      </div>

      {erro && (
        <p role="alert" className="mt-4 rounded-md bg-realce-500/10 px-3 py-2 text-sm text-realce-600">
          {erro}
        </p>
      )}

      {/* ------------------------------------------------------------ números */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Receita bruta", formatarCentavos(Number(fechamento.receita_bruta_centavos))],
          ["Condomínios", `(${formatarCentavos(Number(fechamento.condominio_centavos))})`],
          ["IPTU", `(${formatarCentavos(Number(fechamento.iptu_centavos))})`],
          ["Líquida", formatarCentavos(liquida)],
        ].map(([rotulo, valor], i) => (
          <div
            key={rotulo}
            className={
              i === 3
                ? "rounded-lg border border-marca-300 bg-marca-50 p-3"
                : "rounded-lg border border-marca-100 bg-white p-3"
            }
          >
            <p className="text-xs text-marca-700/60">{rotulo}</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-marca-900">{valor}</p>
          </div>
        ))}
      </section>

      {/* ------------------------------------------------------------ entrada */}
      {!fechado && (
        <section className="mt-8 rounded-lg border border-dashed border-marca-300 bg-white p-5">
          <h2 className="text-sm font-semibold text-marca-900">Arquivos do mês</h2>
          <p className="mt-1 text-xs text-marca-700/60">
            Arraste tudo de uma vez: extratos em PDF, CSV ou OFX, e a planilha de
            condomínios. Cada arquivo é reconhecido pelo conteúdo.
          </p>

          <label htmlFor="conta" className="mt-3 block text-xs font-medium text-marca-900">
            Conta (opcional — só se o extrato não disser)
          </label>
          <select
            id="conta"
            value={contaEscolhida}
            onChange={(e) => setContaEscolhida(e.target.value)}
            className="mt-1 w-full rounded-md border border-marca-300 bg-white px-3 py-2 text-sm text-marca-700"
          >
            <option value="">Deduzir do próprio extrato</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido} {c.tipo === "pf" ? "(pessoa física)" : "(empresa)"}
              </option>
            ))}
          </select>

          <input
            type="file"
            multiple
            accept=".pdf,.csv,.ofx,.txt,.xlsx,.xls"
            onChange={enviarArquivos}
            disabled={ocupado === "entrada"}
            className="mt-3 block w-full text-sm text-marca-700 file:mr-3 file:rounded-md file:border-0 file:bg-marca-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-marca-700 disabled:opacity-60"
          />

          {ocupado === "entrada" && (
            <p className="mt-3 text-sm text-marca-700">Lendo os arquivos...</p>
          )}
          {avisos.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-marca-700/80">
              {avisos.map((a, i) => (
                <li key={i}>· {a}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {entrada.length > 0 && (
        <ul className="mt-4 divide-y divide-marca-100 rounded-lg border border-marca-100 bg-white">
          {entrada.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-marca-900">{a.nome}</p>
                <span
                  className={
                    a.status === "erro"
                      ? "shrink-0 rounded-full bg-realce-500/10 px-2.5 py-0.5 text-xs text-realce-600"
                      : "shrink-0 rounded-full bg-marca-100 px-2.5 py-0.5 text-xs text-marca-700"
                  }
                >
                  {a.tipo}
                </span>
              </div>
              {a.detalhe && <p className="mt-1 text-xs text-marca-700/70">{a.detalhe}</p>}
              <button
                type="button"
                onClick={() => baixar(a)}
                className="mt-1.5 text-xs font-medium text-marca-600 underline underline-offset-2"
              >
                Baixar
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------------------- ações */}
      <section className="mt-8 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={fechado || ocupado !== null || contratos.length === 0}
          onClick={() =>
            acao("conciliar", async () => {
              const r = await pedir("/api/vh/conciliar", "POST", { fechamentoId: fechamento.id });
              setAvisos([`${r.propostas} propostas geradas.`, r.resumo]);
            })
          }
          className="rounded-md bg-marca-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
        >
          {ocupado === "conciliar" ? "Conciliando..." : "Conciliar"}
        </button>

        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() =>
            acao("relatorio", async () => {
              await pedir(`/api/vh/fechamentos/${fechamento.id}/relatorio`, "POST");
            })
          }
          className="rounded-md border border-marca-300 px-5 py-2.5 text-sm font-medium text-marca-700 transition hover:bg-marca-50 disabled:opacity-50"
        >
          {ocupado === "relatorio" ? "Gerando..." : "Gerar conferência"}
        </button>

        <a
          href={`/api/vh/fechamentos/${fechamento.id}/exportar`}
          className="rounded-md border border-marca-300 px-5 py-2.5 text-sm font-medium text-marca-700 transition hover:bg-marca-50"
        >
          Baixar repasse para a skill
        </a>

        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() =>
            acao("estado", async () => {
              await pedir(`/api/vh/fechamentos/${fechamento.id}`, "PATCH", {
                status: fechado ? "conferencia" : "fechado",
              });
            })
          }
          className="rounded-md border border-marca-300 px-5 py-2.5 text-sm font-medium text-marca-700 transition hover:bg-marca-50 disabled:opacity-50"
        >
          {fechado ? "Reabrir mês" : "Fechar mês"}
        </button>
      </section>

      {/* ---------------------------------------------------------- propostas */}
      {pendentes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-marca-900">
            Para revisar ({pendentes.length})
          </h2>
          <ul className="mt-3 space-y-3">
            {pendentes.map((p) => {
              const f = faixa(p.confianca);
              const t = p.transactions;
              return (
                <li key={p.id} className="rounded-lg border border-marca-100 bg-white p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-marca-900">
                      {t ? formatarCentavos(Number(t.valor_centavos)) : "—"}
                      <span className="ml-2 font-normal text-marca-700/60">{t?.data}</span>
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.classe}`}>
                      {p.confianca}% · {f.rotulo}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-marca-700/70">{t?.historico}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-marca-700">
                    {p.justificativa}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={escolhas[p.id] ?? p.contract_id ?? ""}
                      onChange={(e) => setEscolhas({ ...escolhas, [p.id]: e.target.value })}
                      className="rounded-md border border-marca-300 bg-white px-2 py-1.5 text-xs text-marca-700"
                    >
                      <option value="">Sem contrato</option>
                      {contratos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.locatario} — {formatarCentavos(Number(c.valor_centavos))}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() =>
                        acao(`d-${p.id}`, async () => {
                          await pedir(`/api/vh/conciliacoes/${p.id}`, "PATCH", {
                            status: "aprovada",
                            contratoId: escolhas[p.id] ?? p.contract_id ?? null,
                          });
                        })
                      }
                      className="rounded-md bg-marca-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={ocupado !== null}
                      onClick={() =>
                        acao(`d-${p.id}`, async () => {
                          await pedir(`/api/vh/conciliacoes/${p.id}`, "PATCH", {
                            status: "rejeitada",
                          });
                        })
                      }
                      className="rounded-md border border-marca-300 px-4 py-1.5 text-xs font-medium text-marca-700 disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------------- saída */}
      {saida.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-marca-900">Arquivos gerados</h2>
          <ul className="mt-3 divide-y divide-marca-100 rounded-lg border border-marca-100 bg-white">
            {saida.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <p className="min-w-0 truncate text-sm text-marca-900">{a.nome}</p>
                <button
                  type="button"
                  onClick={() => baixar(a)}
                  className="shrink-0 text-xs font-medium text-marca-600 underline underline-offset-2"
                >
                  Baixar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fechamento.relatorio_md && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-marca-900">Conferência</h2>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-marca-100 bg-white p-4 text-xs leading-relaxed text-marca-900">
            {fechamento.relatorio_md}
          </pre>
        </section>
      )}
    </main>
  );
}
