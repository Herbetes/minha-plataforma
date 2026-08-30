import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatarCentavos } from "@/lib/vh";
import PortalHeader from "../portal-header";
import AbrirMes from "./abrir-mes";

export const dynamic = "force-dynamic";

const MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function porExtenso(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${MES[Number(mes) - 1] ?? mes} de ${ano}`;
}

const ROTULO: Record<string, { texto: string; classe: string }> = {
  aberto: { texto: "aberto", classe: "bg-marca-50 text-marca-600" },
  conferencia: { texto: "em conferência", classe: "bg-realce-500/10 text-realce-600" },
  fechado: { texto: "fechado", classe: "bg-marca-100 text-marca-700" },
};

export default async function VhPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("closings")
    .select("*")
    .eq("user_id", user.id)
    .order("competencia", { ascending: false });

  const meses = data ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader email={user.email ?? ""} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold text-marca-900">VH</h1>
          <Link
            href="/app/vh/cadastro"
            className="text-sm font-medium text-marca-600 underline underline-offset-2"
          >
            Contas e contratos
          </Link>
        </div>
        <p className="mt-2 text-marca-700/75">
          Cada mês guarda os extratos, as conciliações e o relatório. Nada se
          perde de um mês para o outro.
        </p>

        <AbrirMes />

        <section className="mt-8">
          {meses.length === 0 ? (
            <p className="text-sm text-marca-700/60">
              Nenhum mês aberto ainda. Comece abrindo o mês que você quer fechar.
            </p>
          ) : (
            <ul className="space-y-2">
              {meses.map((m, i) => {
                const anterior = meses[i + 1];
                const liquida =
                  Number(m.receita_bruta_centavos) -
                  Number(m.condominio_centavos) -
                  Number(m.iptu_centavos);
                const liquidaAnterior = anterior
                  ? Number(anterior.receita_bruta_centavos) -
                    Number(anterior.condominio_centavos) -
                    Number(anterior.iptu_centavos)
                  : null;
                const variacao =
                  liquidaAnterior && liquidaAnterior !== 0
                    ? ((liquida - liquidaAnterior) / liquidaAnterior) * 100
                    : null;
                const r = ROTULO[m.status as string] ?? ROTULO.aberto;

                return (
                  <li key={m.id}>
                    <Link
                      href={`/app/vh/${m.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-3 rounded-lg border border-marca-100 bg-white px-4 py-3 transition hover:border-marca-300"
                    >
                      <div>
                        <p className="text-sm font-semibold capitalize text-marca-900">
                          {porExtenso(m.competencia as string)}
                        </p>
                        <p className="mt-0.5 text-xs text-marca-700/60">
                          {Number(m.pendencias) > 0
                            ? `${m.pendencias} ponto(s) para revisar`
                            : "sem pendências"}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span className="text-sm font-semibold tabular-nums text-marca-900">
                          {formatarCentavos(liquida)}
                        </span>
                        {variacao !== null && (
                          <span
                            className={
                              variacao >= 0
                                ? "text-xs font-medium text-marca-600"
                                : "text-xs font-medium text-realce-600"
                            }
                          >
                            {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao).toFixed(1)}%
                          </span>
                        )}
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.classe}`}>
                          {r.texto}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
