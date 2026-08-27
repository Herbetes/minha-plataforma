"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ERROS: Record<string, string> = {
  link_invalido: "O link não trouxe o código de acesso. Peça um novo.",
  link_expirado: "Esse link já foi usado ou expirou. Peça um novo.",
};

function LoginForm() {
  const params = useSearchParams();
  const proxima = params.get("proxima") ?? "/app";
  const erroUrl = params.get("erro");

  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"parado" | "enviando" | "enviado">("parado");
  const [erro, setErro] = useState<string | null>(erroUrl ? ERROS[erroUrl] ?? null : null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEstado("enviando");

    try {
      const supabase = createClient();
      const destino = `${window.location.origin}/auth/callback?proxima=${encodeURIComponent(proxima)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: destino },
      });

      if (error) throw error;
      setEstado("enviado");
    } catch (e) {
      setEstado("parado");
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível enviar o link. Tente de novo.",
      );
    }
  }

  if (estado === "enviado") {
    return (
      <div className="rounded-lg border border-marca-100 bg-white p-8">
        <h1 className="text-xl font-semibold text-marca-900">Link enviado</h1>
        <p className="mt-3 text-sm leading-relaxed text-marca-700/80">
          Abra o e-mail em <strong className="text-marca-900">{email}</strong> e
          clique no link para entrar. Ele vale por uma hora e serve uma vez só.
        </p>
        <button
          type="button"
          onClick={() => setEstado("parado")}
          className="mt-5 text-sm font-semibold text-marca-600 underline underline-offset-2"
        >
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="rounded-lg border border-marca-100 bg-white p-8">
      <h1 className="text-xl font-semibold text-marca-900">Entrar</h1>
      <p className="mt-2 text-sm text-marca-700/75">
        Sem senha: você recebe um link por e-mail.
      </p>

      <label htmlFor="email" className="mt-6 block text-sm font-medium text-marca-900">
        E-mail
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@exemplo.com"
        className="mt-2 w-full rounded-md border border-marca-300 px-3 py-2.5 text-marca-900 outline-none focus:border-marca-600 focus:ring-2 focus:ring-marca-300"
      />

      {erro && (
        <p role="alert" className="mt-3 text-sm text-realce-600">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={estado === "enviando"}
        className="mt-5 w-full rounded-md bg-marca-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-marca-700 disabled:opacity-60"
      >
        {estado === "enviando" ? "Enviando..." : "Receber link de acesso"}
      </button>

      <Link
        href="/"
        className="mt-5 block text-center text-sm text-marca-700/70 underline underline-offset-2"
      >
        Voltar
      </Link>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-5">
      <div className="w-full">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
