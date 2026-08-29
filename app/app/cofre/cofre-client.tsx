"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { caminhoStorage } from "@/lib/cofre";
import { createClient } from "@/lib/supabase/client";
import PortalHeader from "../portal-header";

export type Pasta = { id: string; name: string };

export type Documento = {
  id: string;
  title: string;
  status: "processando" | "pronto" | "erro";
  pages: number | null;
  chunk_count: number;
  error: string | null;
  folder_id: string | null;
  created_at: string;
};

type Fonte = { n: number; documento: string; pagina: number | null; trecho: string };

/** null = todas as pastas · "sem" = só o que ainda não foi arquivado. */
type Escopo = string | null | "sem";

const ROTULO_STATUS: Record<Documento["status"], string> = {
  processando: "processando...",
  pronto: "pronto",
  erro: "erro",
};

/**
 * Botão de seleção de pasta. Fora do componente de propósito: definido dentro,
 * seria recriado a cada render e o React remontaria os botões sem necessidade.
 */
function Chip({
  ativo,
  children,
  ...props
}: { ativo: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={
        ativo
          ? "shrink-0 rounded-full bg-marca-600 px-3.5 py-1.5 text-sm font-semibold text-white"
          : "shrink-0 rounded-full border border-marca-300 px-3.5 py-1.5 text-sm font-medium text-marca-700 transition hover:bg-marca-50"
      }
    >
      {children}
    </button>
  );
}

export default function CofreClient({
  email,
  documentosIniciais,
  pastasIniciais,
}: {
  email: string;
  documentosIniciais: Documento[];
  pastasIniciais: Pasta[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [pastas, setPastas] = useState(pastasIniciais);
  const [escopo, setEscopo] = useState<Escopo>(null);

  const [enviando, setEnviando] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [criandoPasta, setCriandoPasta] = useState(false);
  const [nomeNovaPasta, setNomeNovaPasta] = useState("");

  const [pergunta, setPergunta] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [resposta, setResposta] = useState("");
  const [fontes, setFontes] = useState<Fonte[]>([]);

  const pastaAtual = pastas.find((p) => p.id === escopo) ?? null;

  const documentos = useMemo(() => {
    if (escopo === null) return documentosIniciais;
    if (escopo === "sem") return documentosIniciais.filter((d) => !d.folder_id);
    return documentosIniciais.filter((d) => d.folder_id === escopo);
  }, [documentosIniciais, escopo]);

  const prontos = documentos.filter((d) => d.status === "pronto").length;

  const rotuloEscopo =
    escopo === null ? "todas as pastas" : escopo === "sem" ? "Sem pasta" : pastaAtual?.name;

  /** Envolve uma ação, cuidando de trava, erro e recarga da lista. */
  async function acao(chave: string, fn: () => Promise<void>) {
    setErroGeral(null);
    setOcupado(chave);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setOcupado(null);
    }
  }

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

  // ------------------------------------------------------------------ pastas

  async function criarPasta(evento: React.FormEvent) {
    evento.preventDefault();
    const nome = nomeNovaPasta.trim();
    if (!nome) return;

    await acao("nova-pasta", async () => {
      const { pasta } = await pedir("/api/pastas", "POST", { nome });
      setPastas((atual) => [...atual, pasta].sort((a, b) => a.name.localeCompare(b.name)));
      setNomeNovaPasta("");
      setCriandoPasta(false);
      setEscopo(pasta.id);
    });
  }

  async function renomearPasta(pasta: Pasta) {
    const nome = window.prompt("Novo nome da pasta:", pasta.name)?.trim();
    if (!nome || nome === pasta.name) return;

    await acao(`renomear-${pasta.id}`, async () => {
      const { pasta: nova } = await pedir(`/api/pastas/${pasta.id}`, "PATCH", { nome });
      setPastas((atual) =>
        atual
          .map((p) => (p.id === nova.id ? nova : p))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }

  async function apagarPasta(pasta: Pasta) {
    const quantos = documentosIniciais.filter((d) => d.folder_id === pasta.id).length;
    const aviso = quantos
      ? `Apagar a pasta "${pasta.name}"?\n\nOs ${quantos} documentos dela NÃO serão apagados — voltam para "Sem pasta".`
      : `Apagar a pasta "${pasta.name}"?`;

    if (!window.confirm(aviso)) return;

    await acao(`apagar-${pasta.id}`, async () => {
      await pedir(`/api/pastas/${pasta.id}`, "DELETE");
      setPastas((atual) => atual.filter((p) => p.id !== pasta.id));
      setEscopo(null);
    });
  }

  // -------------------------------------------------------------- documentos

  async function enviarArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setErroGeral(null);
    setEnviando(arquivo.name);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre de novo.");

      const caminho = caminhoStorage(user.id, arquivo.name);
      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(caminho, arquivo, { contentType: arquivo.type || "application/pdf" });

      if (uploadError) throw new Error(`Falha ao enviar: ${uploadError.message}`);

      await pedir("/api/documentos", "POST", {
        storagePath: caminho,
        title: arquivo.name,
        bytes: arquivo.size,
        // Cai direto na pasta aberta — evita ter que mover depois.
        pastaId: escopo && escopo !== "sem" ? escopo : null,
      });

      router.refresh();
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : "Erro inesperado no envio.");
    } finally {
      setEnviando(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function moverDocumento(doc: Documento, pastaId: string | null) {
    await acao(`mover-${doc.id}`, async () => {
      await pedir(`/api/documentos/${doc.id}`, "PATCH", { pastaId });
    });
  }

  async function baixarDocumento(doc: Documento) {
    await acao(`baixar-${doc.id}`, async () => {
      const { url } = await pedir(`/api/documentos/${doc.id}/link`, "POST");
      window.open(url, "_blank", "noopener");
    });
  }

  async function apagarDocumento(doc: Documento) {
    if (
      !window.confirm(
        `Apagar "${doc.title}" para sempre?\n\nO arquivo e os trechos indexados serão removidos. Isso não tem volta.`,
      )
    )
      return;

    await acao(`apagar-doc-${doc.id}`, async () => {
      await pedir(`/api/documentos/${doc.id}`, "DELETE");
    });
  }

  // ---------------------------------------------------------------- pergunta

  async function perguntar(evento: React.FormEvent) {
    evento.preventDefault();
    const texto = pergunta.trim();
    if (!texto || consultando) return;

    setErroGeral(null);
    setResposta("");
    setFontes([]);
    setConsultando(true);

    try {
      const r = await fetch("/api/cofre/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pergunta: texto,
          pastaId: escopo && escopo !== "sem" ? escopo : null,
          semPasta: escopo === "sem",
        }),
      });

      if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        throw new Error(corpo?.error ?? `Falha ${r.status}`);
      }

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
      setErroGeral(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setConsultando(false);
    }
  }

  // ------------------------------------------------------------------ visual

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader email={email} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <h1 className="text-2xl font-semibold text-marca-900">Cofre</h1>
        <p className="mt-2 text-marca-700/75">
          Envie contratos, laudos ou informes em PDF e pergunte em português. A
          resposta vem com o trecho que a sustenta.
        </p>

        {erroGeral && (
          <p role="alert" className="mt-4 rounded-md bg-realce-500/10 px-3 py-2 text-sm text-realce-600">
            {erroGeral}
          </p>
        )}

        {/* --------------------------------------------------------- pastas */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-marca-900">Pastas</h2>
            {pastaAtual && (
              <div className="flex gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => renomearPasta(pastaAtual)}
                  className="font-medium text-marca-600 underline underline-offset-2"
                >
                  Renomear
                </button>
                <button
                  type="button"
                  onClick={() => apagarPasta(pastaAtual)}
                  className="font-medium text-realce-600 underline underline-offset-2"
                >
                  Apagar pasta
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Chip ativo={escopo === null} onClick={() => setEscopo(null)}>
              Todas
            </Chip>
            {pastas.map((p) => (
              <Chip key={p.id} ativo={escopo === p.id} onClick={() => setEscopo(p.id)}>
                {p.name}
              </Chip>
            ))}
            <Chip ativo={escopo === "sem"} onClick={() => setEscopo("sem")}>
              Sem pasta
            </Chip>
            <Chip ativo={false} onClick={() => setCriandoPasta((v) => !v)}>
              + Nova
            </Chip>
          </div>

          {criandoPasta && (
            <form onSubmit={criarPasta} className="mt-3 flex gap-2">
              <input
                autoFocus
                value={nomeNovaPasta}
                onChange={(e) => setNomeNovaPasta(e.target.value)}
                maxLength={60}
                placeholder="Ex.: VH — contratos de locação"
                className="flex-1 rounded-md border border-marca-300 px-3 py-2 text-marca-900 outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-300"
              />
              <button
                type="submit"
                disabled={ocupado === "nova-pasta" || nomeNovaPasta.trim().length === 0}
                className="rounded-md bg-marca-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Criar
              </button>
            </form>
          )}
        </section>

        {/* ---------------------------------------------------------- envio */}
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-marca-900">
            Documentos{" "}
            <span className="font-normal text-marca-700/60">
              ({rotuloEscopo})
            </span>
          </h2>

          <div className="mt-3 rounded-lg border border-dashed border-marca-300 bg-white p-5">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={enviarArquivo}
              disabled={enviando !== null}
              className="block w-full text-sm text-marca-700 file:mr-3 file:rounded-md file:border-0 file:bg-marca-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-marca-700 disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-marca-700/60">
              PDF com texto selecionável. Documento escaneado ainda não é lido.
              {pastaAtual && ` O envio vai direto para "${pastaAtual.name}".`}
            </p>
            {enviando && (
              <p className="mt-3 text-sm text-marca-700">
                Enviando e indexando <strong>{enviando}</strong>...
              </p>
            )}
          </div>

          {documentos.length === 0 ? (
            <p className="mt-4 text-sm text-marca-700/60">
              Nenhum documento {escopo === null ? "ainda" : "nesta pasta"}.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-marca-100 rounded-lg border border-marca-100 bg-white">
              {documentos.map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-marca-900">
                      {d.title}
                    </p>
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
                  </div>

                  {d.status === "erro" && d.error && (
                    <p className="mt-1 text-xs text-realce-600">{d.error}</p>
                  )}
                  {d.status === "pronto" && (
                    <p className="mt-1 text-xs text-marca-700/60">
                      {d.pages ? `${d.pages} páginas · ` : ""}
                      {d.chunk_count} trechos indexados
                    </p>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className="sr-only" htmlFor={`pasta-${d.id}`}>
                      Pasta de {d.title}
                    </label>
                    <select
                      id={`pasta-${d.id}`}
                      value={d.folder_id ?? ""}
                      disabled={ocupado === `mover-${d.id}`}
                      onChange={(e) => moverDocumento(d, e.target.value || null)}
                      className="rounded-md border border-marca-300 bg-white px-2 py-1 text-xs text-marca-700"
                    >
                      <option value="">Sem pasta</option>
                      {pastas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => baixarDocumento(d)}
                      disabled={ocupado === `baixar-${d.id}`}
                      className="text-xs font-medium text-marca-600 underline underline-offset-2 disabled:opacity-50"
                    >
                      Baixar
                    </button>

                    <button
                      type="button"
                      onClick={() => apagarDocumento(d)}
                      disabled={ocupado === `apagar-doc-${d.id}`}
                      className="text-xs font-medium text-realce-600 underline underline-offset-2 disabled:opacity-50"
                    >
                      Apagar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* -------------------------------------------------------- pergunta */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-marca-900">Perguntar</h2>
          <p className="mt-1 text-xs text-marca-700/60">
            Procurando em <strong className="text-marca-700">{rotuloEscopo}</strong>.
            Escolha uma pasta acima para mirar a busca.
          </p>

          <form onSubmit={perguntar} className="mt-3">
            <textarea
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              rows={2}
              disabled={prontos === 0}
              placeholder={
                prontos === 0
                  ? "Nenhum documento pronto aqui."
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

          {resposta && (
            <div className="mt-6 rounded-lg border border-marca-100 bg-white p-5">
              <p className="whitespace-pre-wrap leading-relaxed text-marca-900">{resposta}</p>
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
                    {f.pagina && <span className="text-marca-700/60"> · página {f.pagina}</span>}
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
