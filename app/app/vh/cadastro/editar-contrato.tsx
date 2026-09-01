"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarCentavos, paraCentavos } from "@/lib/vh";

export type ContratoEditavel = {
  id: string;
  imovel: string;
  locatario: string;
  documento: string | null;
  valor_centavos: number;
  condominio_centavos: number | null;
  iptu_centavos: number | null;
  dia_vencimento: number | null;
  indice_reajuste: string | null;
  mes_reajuste: number | null;
  vigencia_fim: string | null;
  account_id: string | null;
  padroes: string[] | null;
  apelidos: string[] | null;
  ativo: boolean;
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function emReais(centavos: number | null): string {
  return centavos === null || centavos === undefined
    ? ""
    : (centavos / 100).toFixed(2).replace(".", ",");
}

function listaParaTexto(v: string[] | null): string {
  return (v ?? []).join(", ");
}

function textoParaLista(v: string): string[] {
  return v
    .split(/[,;\n]/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 2);
}

const CAMPO =
  "w-full rounded-md border border-marca-300 px-3 py-2 text-sm outline-none focus:border-marca-600";
const ROTULO = "text-xs font-medium text-marca-700/70";

/**
 * Edição de um contrato já cadastrado.
 *
 * Existe porque o cadastro importado da planilha nem sempre chega certo — e
 * porque corrigir na plataforma tem que ser possível sem mexer na planilha,
 * que é editada por outra pessoa e em outro ritmo.
 */
export default function EditarContrato({
  contrato,
  contas,
  aoFechar,
}: {
  contrato: ContratoEditavel;
  contas: { id: string; apelido: string }[];
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    imovel: contrato.imovel,
    locatario: contrato.locatario,
    documento: contrato.documento ?? "",
    valor: emReais(contrato.valor_centavos),
    condominio: emReais(contrato.condominio_centavos),
    iptu: emReais(contrato.iptu_centavos),
    diaVencimento: contrato.dia_vencimento?.toString() ?? "",
    indiceReajuste: contrato.indice_reajuste ?? "",
    mesReajuste: contrato.mes_reajuste?.toString() ?? "",
    vigenciaFim: contrato.vigencia_fim ?? "",
    contaId: contrato.account_id ?? "",
    padroes: listaParaTexto(contrato.padroes),
    apelidos: listaParaTexto(contrato.apelidos),
    ativo: contrato.ativo,
  });

  function campo<K extends keyof typeof form>(chave: K, valor: (typeof form)[K]) {
    setForm({ ...form, [chave]: valor });
  }

  /** Campo de dinheiro vazio quer dizer "não informado", não zero. */
  function dinheiro(texto: string, nome: string): number | null | undefined {
    if (!texto.trim()) return null;
    const c = paraCentavos(texto);
    if (c === null || c < 0) {
      setErro(`${nome} inválido. Escreva como 1.790,00`);
      return undefined;
    }
    return c;
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro("");

    const valorCentavos = dinheiro(form.valor, "Aluguel");
    if (valorCentavos === undefined) return;
    if (!valorCentavos) {
      setErro("O aluguel precisa ser maior que zero.");
      return;
    }
    const condominioCentavos = dinheiro(form.condominio, "Condomínio");
    if (condominioCentavos === undefined) return;
    const iptuCentavos = dinheiro(form.iptu, "IPTU");
    if (iptuCentavos === undefined) return;

    setSalvando(true);
    try {
      const resposta = await fetch(`/api/vh/contratos/${contrato.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imovel: form.imovel,
          locatario: form.locatario,
          documento: form.documento || null,
          valorCentavos,
          condominioCentavos,
          iptuCentavos,
          diaVencimento: form.diaVencimento ? Number(form.diaVencimento) : null,
          indiceReajuste: form.indiceReajuste || null,
          mesReajuste: form.mesReajuste ? Number(form.mesReajuste) : null,
          vigenciaFim: form.vigenciaFim || null,
          contaId: form.contaId || null,
          padroes: textoParaLista(form.padroes),
          apelidos: textoParaLista(form.apelidos),
          ativo: form.ativo,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.error ?? "Não foi possível salvar.");
        return;
      }
      aoFechar();
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="mt-3 rounded-lg border border-marca-300 bg-marca-50/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={ROTULO}>Imóvel</span>
          <input value={form.imovel} onChange={(e) => campo("imovel", e.target.value)} className={CAMPO} required />
        </label>
        <label className="block">
          <span className={ROTULO}>Locatário</span>
          <input value={form.locatario} onChange={(e) => campo("locatario", e.target.value)} className={CAMPO} required />
        </label>

        <label className="block">
          <span className={ROTULO}>Aluguel mensal</span>
          <input value={form.valor} onChange={(e) => campo("valor", e.target.value)} className={CAMPO} placeholder="6.570,00" required />
        </label>
        <label className="block">
          <span className={ROTULO}>CPF / CNPJ</span>
          <input value={form.documento} onChange={(e) => campo("documento", e.target.value)} className={CAMPO} />
        </label>

        <label className="block">
          <span className={ROTULO}>Condomínio mensal</span>
          <input value={form.condominio} onChange={(e) => campo("condominio", e.target.value)} className={CAMPO} placeholder="1.790,00" />
        </label>
        <label className="block">
          <span className={ROTULO}>IPTU mensal</span>
          <input value={form.iptu} onChange={(e) => campo("iptu", e.target.value)} className={CAMPO} />
        </label>

        <label className="block">
          <span className={ROTULO}>Dia do vencimento</span>
          <input type="number" min={1} max={31} value={form.diaVencimento} onChange={(e) => campo("diaVencimento", e.target.value)} className={CAMPO} />
        </label>
        <label className="block">
          <span className={ROTULO}>Conta que recebe</span>
          <select value={form.contaId} onChange={(e) => campo("contaId", e.target.value)} className={CAMPO}>
            <option value="">— sem conta —</option>
            {contas.map((a) => (
              <option key={a.id} value={a.id}>{a.apelido}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={ROTULO}>Índice de reajuste</span>
          <input value={form.indiceReajuste} onChange={(e) => campo("indiceReajuste", e.target.value)} className={CAMPO} placeholder="IPCA" />
        </label>
        <label className="block">
          <span className={ROTULO}>Mês do reajuste</span>
          <select value={form.mesReajuste} onChange={(e) => campo("mesReajuste", e.target.value)} className={CAMPO}>
            <option value="">— sem reajuste anual —</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className={ROTULO}>Fim da vigência</span>
          <input type="date" value={form.vigenciaFim} onChange={(e) => campo("vigenciaFim", e.target.value)} className={CAMPO} />
          <span className="mt-1 block text-xs text-marca-700/60">
            Deixe vazio para contrato por prazo indeterminado.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className={ROTULO}>Padrões de extrato (como o PAGADOR aparece no banco)</span>
          <input value={form.padroes} onChange={(e) => campo("padroes", e.target.value)} className={CAMPO} placeholder="HY SUITES, URBAN HOME" />
        </label>

        <label className="block sm:col-span-2">
          <span className={ROTULO}>Apelidos do imóvel (como o IMÓVEL aparece na planilha de despesas)</span>
          <input value={form.apelidos} onChange={(e) => campo("apelidos", e.target.value)} className={CAMPO} placeholder="INTER BUSINESS CENTER" />
          <span className="mt-1 block text-xs text-marca-700/60">
            É para sigla e nome alternativo. A SALA 710 chega na planilha da
            Fabiana como &quot;INTER BUSINESS CENTER&quot;, e nenhuma comparação
            por palavra adivinha sigla.
          </span>
        </label>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={form.ativo} onChange={(e) => campo("ativo", e.target.checked)} className="h-4 w-4" />
          <span className="text-sm text-marca-700">Contrato ativo</span>
        </label>
      </div>

      {erro && <p className="mt-3 text-sm text-red-700">{erro}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={salvando}
          className="rounded-md bg-marca-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-800 disabled:opacity-50"
        >
          {salvando ? "salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={aoFechar} className="text-sm text-marca-700/70 underline underline-offset-2">
          cancelar
        </button>
        <span className="ml-auto text-xs text-marca-700/50">
          aluguel atual: {formatarCentavos(contrato.valor_centavos)}
        </span>
      </div>
    </form>
  );
}
