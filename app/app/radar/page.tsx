import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "../portal-header";
import PainelRadar from "./painel";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader email={user.email ?? ""} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <h1 className="text-2xl font-semibold text-marca-900">Radar</h1>
        <p className="mt-2 text-marca-700/75">
          O que merece a sua atenção agora, calculado a partir dos contratos e
          das conciliações aprovadas. Ligado, o Radar manda isto por e-mail toda
          segunda-feira de manhã — e fica quieto na semana em que não há nada.
        </p>

        <PainelRadar emailPadrao={user.email ?? ""} />
      </main>
    </div>
  );
}
