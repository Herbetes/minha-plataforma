"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/app", rotulo: "Chat" },
  { href: "/app/cofre", rotulo: "Cofre" },
];

export default function PortalHeader({ email }: { email: string }) {
  const atual = usePathname();

  return (
    <header className="border-b border-marca-100 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-5">
          <span className="font-semibold text-marca-700">Minha Plataforma</span>
          <nav className="flex gap-1">
            {ABAS.map((aba) => {
              const ativa = atual === aba.href;
              return (
                <Link
                  key={aba.href}
                  href={aba.href}
                  aria-current={ativa ? "page" : undefined}
                  className={
                    ativa
                      ? "rounded-md bg-marca-100 px-3 py-1.5 text-sm font-semibold text-marca-700"
                      : "rounded-md px-3 py-1.5 text-sm font-medium text-marca-700/70 transition hover:bg-marca-50"
                  }
                >
                  {aba.rotulo}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-marca-700/60 sm:inline">{email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-marca-300 px-3 py-1.5 text-sm font-medium text-marca-700 transition hover:bg-marca-50"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
