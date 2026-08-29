import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const MODULOS = [
  { nome: "Chat", estado: "no ar", texto: "Converse com o Claude e o histórico fica salvo." },
  { nome: "Cofre", estado: "no ar", texto: "Seus documentos, com busca que cita a fonte." },
  { nome: "Agente VH", estado: "no ar", texto: "Conciliação de aluguéis com aprovação humana." },
  { nome: "Radar", estado: "projeto 3", texto: "E-mail semanal com o que exige atenção." },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-marca-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-lg font-semibold text-marca-700">Minha Plataforma</span>
          <Link
            href={user ? "/app" : "/login"}
            className="rounded-md bg-marca-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-marca-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600"
          >
            {user ? "Abrir o portal" : "Entrar"}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-marca-500">
          Portal de operações
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight text-marca-900 sm:text-5xl">
          Uma casca só, e os módulos que resolvem o seu dia dentro dela.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-marca-700/80">
          Login, banco e registro de uso ficam prontos uma vez. Cada projeto novo
          entra como um módulo, sem refazer a fundação.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={user ? "/app" : "/login"}
            className="rounded-md bg-marca-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-marca-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600"
          >
            {user ? "Ir para o chat" : "Entrar com e-mail"}
          </Link>
          <a
            href="https://github.com/Herbetes/minha-plataforma/blob/main/docs/ROADMAP.md"
            className="rounded-md border border-marca-300 px-5 py-3 text-sm font-semibold text-marca-700 transition hover:bg-marca-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600"
          >
            Ver o roadmap
          </a>
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-2">
          {MODULOS.map((m) => (
            <li
              key={m.nome}
              className="rounded-lg border border-marca-100 bg-white p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-marca-900">{m.nome}</h2>
                <span
                  className={
                    m.estado === "no ar"
                      ? "rounded-full bg-marca-100 px-2.5 py-0.5 text-xs font-medium text-marca-700"
                      : "rounded-full bg-marca-50 px-2.5 py-0.5 text-xs font-medium text-marca-500"
                  }
                >
                  {m.estado}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-marca-700/75">{m.texto}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-marca-100 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-5 text-sm text-marca-700/60">
          Projeto 0 do roadmap · Next.js, Supabase e Claude
        </div>
      </footer>
    </div>
  );
}
