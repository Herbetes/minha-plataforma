"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Abre (ou reabre) um mês. Mês já existente é reaproveitado, não duplicado. */
export default function AbrirMes() {
  const router = useRouter();
  const agora = new Date();
  const padrao = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;

  const [competencia, setCompetencia] = useState(padrao);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/vh/fechamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.error ?? "Falha ao abrir o mês.");
      router.push(`/app/vh/${dados.fechamento.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={abrir} className="mt-6 flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="competencia" className="block text-xs font-medium text-marca-900">
          Mês
        </label>
        <input
          id="competencia"
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className="mt-1 rounded-md border border-marca-300 px-3 py-2 text-sm text-marca-900 outline-none focus:border-marca-600"
        />
      </div>
      <button
        type="submit"
        disabled={ocupado}
        className="rounded-md bg-marca-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
      >
        {ocupado ? "Abrindo..." : "Abrir mês"}
      </button>
      {erro && <p className="w-full text-sm text-realce-600">{erro}</p>}
    </form>
  );
}
