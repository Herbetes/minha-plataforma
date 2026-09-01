"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarCentavos } from "@/lib/vh";
import type { ContratoImportado, LinhaDescartada } from "@/lib/vh-cadastro";

type Leitura = {
  aba: string | null;
  abas: string[];
  contratos: ContratoImportado[];
  descartadas: LinhaDescartada[];
  aviso?: string;
};

const MES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/**
 * Importa os contratos da aba CADASTRO DE IMÓVEIS da planilha da VH.
 *
 * Duas telas de propósito: primeiro o que foi entendido, depois a gravação. O
 * cadastro é a base de tudo que o módulo faz depois — um valor errado aqui só
 * dá as caras na conciliação do mês seguinte, quando ninguém mais lembra de
 * onde veio.
 */
export default function ImportarPlanilha({ contas }: { contas: string[] }) {
  const router = useRouter();
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState("");
  const [mostrarDescartadas, setMostrarDescartadas] = useState(false);

  async function ler(arquivo: File, aba?: string) {
    setLendo(true);
    setErro("");
    setResultado("");
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      if (aba) form.append("aba", aba);

      const resposta = await fetch("/api/vh/cadastro/importar", { method: "POST", body: form });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.error ?? "Não consegui ler a planilha.");
        return;
      }
      setLeitura(dados);
      setMarcados(new Set(dados.contratos.map((c: ContratoImportado) => c.linha)));
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setLendo(false);
    }
  }

  async function gravar() {
    if (!leitura) return;
    const escolhidos = leitura.contratos.filter((c) => marcados.has(c.linha));
    if (escolhidos.length === 0) {
      setErro("Marque ao menos um contrato.");
      return;
    }

    setGravando(true);
    setErro("");
    try {
      const resposta = await fetch("/api/vh/cadastro/importar/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratos: escolhidos }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.error ?? "Não consegui gravar.");
        return;
      }

      const partes = [`${dados.importados} contrato(s) importado(s)`];
      if (dados.pulados?.length > 0) {
        partes.push(`${dados.pulados.length} já existia(m): ${dados.pulados.join(", ")}`);
      }
      setResultado(partes.join(" · "));
      setLeitura(null);
      router.refresh();
    } finally {
      setGravando(false);
    }
  }

  function alternar(linha: number) {
    const proximo = new Set(marcados);
    if (proximo.has(linha)) proximo.delete(linha);
    else proximo.add(linha);
    setMarcados(proximo);
  }

  return (
    <section className="rounded-lg border border-marca-200 bg-white p-4">
      <h3 className="font-semibold text-marca-900">Importar da planilha da VH</h3>
      <p className="mt-1 text-sm text-marca-700/70">
        Envie o <strong>Movimento Contábil da VH</strong>. Eu leio a aba{" "}
        <em>CADASTRO DE IMÓVEIS</em>, mostro o que entendi e só gravo depois que
        você conferir. Imóvel que já está cadastrado aqui é pulado, nunca
        sobrescrito.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.xlsm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ler(f);
            e.target.value = "";
          }}
          disabled={lendo}
          className="text-sm text-marca-700 file:mr-3 file:rounded-md file:border-0 file:bg-marca-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        {lendo && <span className="text-sm text-marca-700/60">lendo a planilha…</span>}
      </div>

      {erro && <p className="mt-3 text-sm text-red-700">{erro}</p>}
      {resultado && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado}</p>
      )}

      {leitura && (
        <div className="mt-5 border-t border-marca-100 pt-4">
          {leitura.aviso && <p className="text-sm text-marca-700">{leitura.aviso}</p>}

          {leitura.aba && (
            <p className="text-sm text-marca-700/70">
              Aba lida: <strong className="text-marca-900">{leitura.aba}</strong> ·{" "}
              {leitura.contratos.length} contrato(s) reconhecido(s)
              {leitura.abas.length > 1 && (
                <>
                  {" · "}
                  <select
                    defaultValue={leitura.aba}
                    onChange={(e) => {
                      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
                      const f = input?.files?.[0];
                      if (f) void ler(f, e.target.value);
                      else setErro("Escolha a planilha de novo para trocar de aba.");
                    }}
                    className="rounded border border-marca-300 px-2 py-1 text-xs"
                  >
                    {leitura.abas.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </p>
          )}

          {leitura.contratos.length > 0 && (
            <>
              <ul className="mt-3 divide-y divide-marca-100 rounded-md border border-marca-100">
                {leitura.contratos.map((c) => (
                  <li key={c.linha} className="flex gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={marcados.has(c.linha)}
                      onChange={() => alternar(c.linha)}
                      className="mt-1 h-4 w-4 shrink-0"
                      aria-label={`Importar ${c.imovel}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-marca-900">
                        {c.imovel}
                        <span className="ml-2 font-normal text-marca-700/70">{c.locatario}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-marca-700/60">
                        {formatarCentavos(c.valorCentavos)}
                        {c.diaVencimento && ` · vence dia ${c.diaVencimento}`}
                        {c.mesReajuste && ` · reajuste em ${MES[c.mesReajuste - 1]}`}
                        {c.indiceReajuste && ` (${c.indiceReajuste})`}
                        {c.vigenciaFim && ` · até ${c.vigenciaFim}`}
                        {c.contaApelido && ` · conta ${c.contaApelido}`}
                      </p>
                      {c.avisos.length > 0 && (
                        <p className="mt-0.5 text-xs text-amber-700">⚠ {c.avisos.join(" · ")}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void gravar()}
                  disabled={gravando}
                  className="rounded-md bg-marca-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-800 disabled:opacity-50"
                >
                  {gravando ? "gravando…" : `Importar ${marcados.size} contrato(s)`}
                </button>
                <button
                  type="button"
                  onClick={() => setLeitura(null)}
                  className="text-sm text-marca-700/70 underline underline-offset-2"
                >
                  cancelar
                </button>
                {contas.length === 0 && (
                  <span className="text-xs text-amber-700">
                    Nenhuma conta cadastrada: os contratos entram sem conta e você aponta depois.
                  </span>
                )}
              </div>
            </>
          )}

          {leitura.descartadas.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setMostrarDescartadas((v) => !v)}
                className="text-sm text-marca-700/70 underline underline-offset-2"
              >
                {mostrarDescartadas ? "esconder" : "ver"} as {leitura.descartadas.length} linha(s)
                que não vieram
              </button>
              {mostrarDescartadas && (
                <ul className="mt-2 space-y-1 rounded-md bg-marca-50 p-3 text-xs text-marca-700/80">
                  {leitura.descartadas.map((d) => (
                    <li key={d.linha}>
                      <strong>{d.identificacao}</strong> (linha {d.linha}) — {d.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
