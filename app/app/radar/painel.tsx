"use client";

import { useCallback, useEffect, useState } from "react";
import type { Alerta } from "@/lib/radar";

type Prefs = { ativo: boolean; email: string | null; dia_semana: number };

type Run = {
  id: string;
  chave: string;
  origem: string;
  criticos: number;
  atencoes: number;
  resumo: string | null;
  enviado: boolean;
  email: string | null;
  erro: string | null;
  created_at: string;
};

const ESTILO: Record<Alerta["severidade"], { faixa: string; rotulo: string; texto: string }> = {
  critico: { faixa: "border-l-red-600", rotulo: "text-red-700", texto: "CRÍTICO" },
  atencao: { faixa: "border-l-amber-500", rotulo: "text-amber-700", texto: "ATENÇÃO" },
  informativo: { faixa: "border-l-marca-300", rotulo: "text-marca-600", texto: "INFORMATIVO" },
};

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PainelRadar({ emailPadrao }: { emailPadrao: string }) {
  const [carregando, setCarregando] = useState(true);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [historico, setHistorico] = useState<Run[]>([]);
  const [ativo, setAtivo] = useState(false);
  const [email, setEmail] = useState(emailPadrao);
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await fetch("/api/radar");
      const dados = await resposta.json();
      if (!resposta.ok) {
        setAviso(dados.error ?? "Não foi possível carregar o Radar.");
        return;
      }
      setAlertas(dados.alertas ?? []);
      setHistorico(dados.historico ?? []);
      const prefs: Prefs = dados.prefs ?? {};
      setAtivo(Boolean(prefs.ativo));
      setEmail(prefs.email || emailPadrao);
    } catch {
      setAviso("Sem conexão com o servidor.");
    } finally {
      setCarregando(false);
    }
  }, [emailPadrao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvar(novoAtivo: boolean) {
    setSalvando(true);
    setAviso("");
    try {
      const resposta = await fetch("/api/radar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novoAtivo, email, diaSemana: 1 }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setAviso(dados.error ?? "Não foi possível salvar.");
        return;
      }
      setAtivo(Boolean(dados.prefs?.ativo));
      setAviso(dados.prefs?.ativo ? "Radar ligado." : "Radar desligado.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAgora() {
    setEnviando(true);
    setAviso("");
    try {
      const resposta = await fetch("/api/radar/enviar", { method: "POST" });
      const dados = await resposta.json();
      setAviso(!resposta.ok ? (dados.error ?? "Falha ao enviar.") : dados.motivo);
      if (resposta.ok) await carregar();
    } catch {
      setAviso("Sem conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const criticos = alertas.filter((a) => a.severidade === "critico").length;
  const atencoes = alertas.filter((a) => a.severidade === "atencao").length;

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-xl border border-marca-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-marca-900">Aviso semanal por e-mail</h2>
            <p className="mt-1 text-sm text-marca-700/70">
              Toda segunda-feira, 8h. Semana sem nada relevante não gera e-mail.
            </p>
          </div>
          <span
            className={
              ativo
                ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                : "rounded-full bg-marca-100 px-3 py-1 text-xs font-semibold text-marca-600"
            }
          >
            {ativo ? "ligado" : "desligado"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="para qual e-mail enviar"
            className="min-w-56 flex-1 rounded-md border border-marca-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void salvar(!ativo)}
            disabled={salvando}
            className="rounded-md bg-marca-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-800 disabled:opacity-50"
          >
            {salvando ? "salvando…" : ativo ? "Desligar" : "Ligar"}
          </button>
          <button
            type="button"
            onClick={() => void enviarAgora()}
            disabled={enviando}
            className="rounded-md border border-marca-300 px-4 py-2 text-sm font-medium text-marca-700 transition hover:bg-marca-50 disabled:opacity-50"
          >
            {enviando ? "enviando…" : "Enviar agora (teste)"}
          </button>
        </div>

        {aviso && <p className="mt-3 text-sm text-marca-700">{aviso}</p>}
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-marca-900">Agora</h2>
          <span className="text-sm text-marca-700/60">
            {criticos} crítico(s) · {atencoes} em atenção
          </span>
        </div>

        {carregando ? (
          <p className="mt-3 text-sm text-marca-700/60">Calculando…</p>
        ) : alertas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-marca-200 bg-white p-4 text-sm text-marca-700/70">
            Nada exigindo atenção. Contratos em dia, reajustes fora da janela e
            nenhum mês passado em aberto.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {alertas.map((a, i) => {
              const estilo = ESTILO[a.severidade];
              return (
                <li
                  key={`${a.tipo}-${i}`}
                  className={`rounded-lg border border-marca-200 border-l-4 bg-white p-4 ${estilo.faixa}`}
                >
                  <span className={`text-[11px] font-bold tracking-wide ${estilo.rotulo}`}>
                    {estilo.texto}
                  </span>
                  <p className="mt-0.5 font-medium text-marca-900">{a.titulo}</p>
                  <p className="mt-0.5 text-sm text-marca-700/75">{a.detalhe}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-marca-900">Execuções</h2>
        <p className="mt-1 text-sm text-marca-700/70">
          Fica gravado até quando não há e-mail — assim dá para diferenciar
          semana calma de automação parada.
        </p>

        {historico.length === 0 ? (
          <p className="mt-3 text-sm text-marca-700/60">Ainda não rodou nenhuma vez.</p>
        ) : (
          <ul className="mt-3 divide-y divide-marca-100 rounded-lg border border-marca-200 bg-white">
            {historico.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-marca-900">{quando(r.created_at)}</span>
                  <span className="ml-2 text-xs text-marca-700/60">
                    {r.origem === "cron" ? "agendado" : "manual"} · {r.criticos} crítico(s) ·{" "}
                    {r.atencoes} em atenção
                  </span>
                  {r.erro && <p className="mt-1 text-xs text-red-700">{r.erro}</p>}
                </div>
                <span
                  className={
                    r.enviado
                      ? "text-xs font-semibold text-emerald-700"
                      : "text-xs font-semibold text-marca-600"
                  }
                >
                  {r.enviado ? "e-mail enviado" : r.erro ? "falhou" : "sem envio"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
