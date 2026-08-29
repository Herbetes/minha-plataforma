"use client";

import { useEffect, useRef, useState } from "react";
import type { StoredMessage } from "@/lib/chat";
import PortalHeader from "./portal-header";

type Props = {
  email: string;
  conversaInicial: string | null;
  historicoInicial: StoredMessage[];
};

export default function ChatClient({ email, conversaInicial, historicoInicial }: Props) {
  const [mensagens, setMensagens] = useState<StoredMessage[]>(historicoInicial);
  const [conversaId, setConversaId] = useState<string | null>(conversaInicial);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const texto = entrada.trim();
    if (!texto || enviando) return;

    setErro(null);
    setEnviando(true);
    setEntrada("");
    // Mostra a mensagem do usuário e abre um balão vazio para a resposta.
    setMensagens((atual) => [
      ...atual,
      { role: "user", content: texto },
      { role: "assistant", content: "" },
    ]);

    try {
      const resposta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: texto,
          ...(conversaId ? { conversationId: conversaId } : {}),
        }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        throw new Error(corpo?.error ?? `Falha ${resposta.status}`);
      }

      const novaConversa = resposta.headers.get("X-Conversation-Id");
      if (novaConversa) setConversaId(novaConversa);

      const leitor = resposta.body?.getReader();
      if (!leitor) throw new Error("Resposta sem conteúdo.");

      const decoder = new TextDecoder();
      let acumulado = "";

      // Vai preenchendo o último balão conforme os pedaços chegam.
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += decoder.decode(value, { stream: true });
        setMensagens((atual) => {
          const copia = [...atual];
          copia[copia.length - 1] = { role: "assistant", content: acumulado };
          return copia;
        });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
      // Remove o balão vazio para não deixar resto na tela.
      setMensagens((atual) =>
        atual.at(-1)?.content === "" ? atual.slice(0, -1) : atual,
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <PortalHeader email={email} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-8">
          {mensagens.length === 0 && (
            <p className="py-16 text-center text-marca-700/50">
              Comece a conversa. O histórico fica salvo.
            </p>
          )}

          {mensagens.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "max-w-[85%] self-end rounded-lg rounded-br-sm bg-marca-600 px-4 py-2.5 text-white"
                  : "max-w-[85%] self-start rounded-lg rounded-bl-sm border border-marca-100 bg-white px-4 py-2.5 text-marca-900"
              }
            >
              <p className="whitespace-pre-wrap leading-relaxed">
                {m.content || (
                  <span className="text-marca-700/40">escrevendo...</span>
                )}
              </p>
            </div>
          ))}

          {erro && (
            <p role="alert" className="self-start text-sm text-realce-600">
              {erro}
            </p>
          )}

          <div ref={fimRef} />
        </div>
      </main>

      <form onSubmit={enviar} className="border-t border-marca-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-end gap-3 px-5 py-4">
          <textarea
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(e);
              }
            }}
            rows={1}
            placeholder="Escreva sua mensagem. Enter envia, Shift+Enter quebra a linha."
            className="max-h-40 min-h-[44px] flex-1 resize-y rounded-md border border-marca-300 px-3 py-2.5 text-marca-900 outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-300"
          />
          <button
            type="submit"
            disabled={enviando || entrada.trim().length === 0}
            className="h-[44px] rounded-md bg-marca-600 px-5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-50"
          >
            {enviando ? "..." : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}
