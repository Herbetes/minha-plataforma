"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { caminhoStorage } from "@/lib/cofre";
import { createClient } from "@/lib/supabase/client";
import PortalHeader from "../portal-header";

export type Documento = {
  id: string;
  title: string;
  status: "processando" | "pronto" | "erro";
  pages: number | null;
  chunk_count: number;
  error: string | null;
  created_at: string;
};

type Fonte = {
  n: number;
  documento: string;
  pagina: number | null;
  trecho: string;
};

const ROTULO_STATUS: Record<Documento["status"], string> = {
  processando: "processando...",
  pronto: "pronto",
  erro: "erro",
};

export default function CofreClient({
  email,
  documentosIniciais,
}: {
  email: string;
  documentosIniciais: Documento[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [documentos] = useState(documentosIniciais);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erroUpload, setErroUpload] = useState<string | null>(null);

  const [pergunta, setPergunta] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resposta, setResposta] = useState("");
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [erroPergunta, setErroPergunta] = useState<string | null>(null);

  const prontos = documentos.filter((d) => d.status === "pronto").length;

  async function enviarArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setErroUpload(null);
    setEnviando(arquivo.name);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Sessão expirada. Entre de novo.");

      // O navegador envia direto ao Storage; a rota da API só recebe o caminho.
      const caminho = caminhoStorage(user.id, arquivo.name);
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(caminho, arquivo, { contentType: arquivo.type || "application/pdf" });

      if (uploadError) throw new Error(`Falha ao enviar o arquivo: ${uploadError.message}`);

      const resposta = await fetch("/api/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: caminho,
          title: arquivo.name,
          bytes: arquivo.size,
        }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        throw new Error(corpo?.error ?? `Falha ${resposta.status} ao processar.`);
      }

      router.refresh();
    } catch (e) {
      setErroUpload(e instanceof Error ? e.message : "Erro inesperado no envio.");
    } finally {
      setEnviando(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function perguntar(evento: React.FormEvent) {
    evento.preventDefault();
    const texto = pergunta.trim();
    if (!texto || consultando) return;

    setErroPergunta(null);
    setResposta("");
    setFontes([]);
    setConsultando(true);

    try {
      const r = await fetch("/api/cofre/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: texto }),
      });

      if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        throw new Error(corpo?.error ?? `Falha ${r.status}`);
      }

      // Nenhum trecho encontrado: a rota devolve JSON em vez de streaming.
      if (r.headers.get("Content-Type")?.includes("application/json")) {
        const corpo = await r.json();
        setResposta(corpo.resposta ?? "");
        return;
      }

      const cabecalho = r.headers.get("X-Fontes");
      if (cabecalho) {
        try {
          setFontes(JSON.parse(decodeURIComponent(cabecalho)) as Fonte[]);
        } catch {
          // Fontes ilegíveis não impedem mostrar a resposta.
        }
      }

      const leitor = r.body?.getReader();
      if (!leitor) throw new Error("Resposta sem conteúdo.");

      const decoder = new TextDecoder();
      let acumulado = "";

      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decoder.decode(value, { stream: true });
        setResposta(acumulado);
      }
    } catch (e) {
      setErroPergunta(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setConsultando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader email={email} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <h1 className="text-2xl font-semibold text-marca-900">Cofre</h1>
        <p className="mt-2 text-marca-700/75">
          Envie contratos, laudos ou informes em PDF e pergunte em português. A
          resposta vem com o trecho que a sustenta.
        </p>

        {/* ---------------------------------------------------------- envio */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-marca-900">Seus documentos</h2>

          <div className="mt-3 rounded-lg border border-dashed border-marca-300 bg-white p-5">
            <input
              ref={inputRef}
              id="arquivo"
              type="file"
              accept="application/pdf,.pdf"
              onChange={enviarArquivo}
              disabled={enviando !== null}
              className="block w-full text-sm text-marca-700 file:mr-3 file:rounded-md file:border-0 file:bg-marca-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-marca-700 disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-marca-700/60">
              PDF com texto selecionável. Documento escaneado ainda não é lido.
            </p>

            {enviando && (
              <p className="mt-3 text-sm text-marca-700">
                Enviando e indexando <strong>{enviando}</strong>... isso pode levar
                alguns segundos.
              </p>
            )}
            {erroUpload && (
              <p role="alert" className="mt-3 text-sm text-realce-600">
                {erroUpload}
              </p>
            )}
          </div>

          {documentos.length === 0 ? (
            <p className="mt-4 text-sm text-marca-700/60">
              Nenhum documento ainda.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-marca-100 rounded-lg border border-marca-100 bg-white">
              {documentos.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-marca-900">{d.title}</p>
                    {d.status === "erro" && d.error && (
                      <p className="mt-1 text-xs text-realce-600">{d.error}</p>
                    )}
                    {d.status === "pronto" && (
                      <p className="mt-1 text-xs text-marca-700/60">
                        {d.pages ? `${d.pages} páginas · ` : ""}
                        {d.chunk_count} trechos indexados
                      </p>
                    )}
                  </div>
                  <span
                    className={
                      d.status === "pronto"
                        ? "shrink-0 rounded-full bg-marca-100 px-2.5 py-0.5 text-xs font-medium text-marca-700"
                        : d.status === "erro"
                          ? "shrink-0 rounded-full bg-realce-500/10 px-2.5 py-0.5 text-xs font-medium text-realce-600"
                          : "shrink-0 rounded-full bg-marca-50 px-2.5 py-0.5 text-xs font-medium text-marca-500"
                    }
                  >
                    {ROTULO_STATUS[d.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------------- pergunta */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-marca-900">Perguntar</h2>

          <form onSubmit={perguntar} className="mt-3">
            <textarea
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              rows={2}
              disabled={prontos === 0}
              placeholder={
                prontos === 0
                  ? "Envie um documento primeiro."
                  : "Ex.: qual o índice de reajuste do contrato e quando vence?"
              }
              className="w-full resize-y rounded-md border border-marca-300 px-3 py-2.5 text-marca-900 outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-300 disabled:bg-marca-50"
            />
            <button
              type="submit"
              disabled={consultando || prontos === 0 || pergunta.trim().length === 0}
              className="mt-2 rounded-md bg-marca-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
            >
              {consultando ? "Procurando..." : "Perguntar"}
            </button>
          </form>

          {erroPergunta && (
            <p role="alert" className="mt-3 text-sm text-realce-600">
              {erroPergunta}
            </p>
          )}

          {resposta && (
            <div className="mt-6 rounded-lg border border-marca-100 bg-white p-5">
              <p className="whitespace-pre-wrap leading-relaxed text-marca-900">
                {resposta}
              </p>
            </div>
          )}

          {fontes.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-marca-700/60">
                Trechos consultados
              </h3>
              <ol className="mt-2 space-y-2">
                {fontes.map((f) => (
                  <li
                    key={f.n}
                    className="rounded-md border border-marca-100 bg-marca-50/50 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-marca-700">[{f.n}]</span>{" "}
                    <span className="font-medium text-marca-900">{f.documento}</span>
                    {f.pagina && (
                      <span className="text-marca-700/60"> · página {f.pagina}</span>
                    )}
                    <p className="mt-1 text-marca-700/75">{f.trecho}...</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
