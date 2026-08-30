import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalHeader from "../../portal-header";
import FechamentoClient, {
  type Arquivo,
  type Fechamento,
  type PropostaVH,
} from "./fechamento-client";

export const dynamic = "force-dynamic";

export default async function FechamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: fechamento } = await supabase
    .from("closings")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!fechamento) notFound();

  const [arquivos, propostas, contas, contratos] = await Promise.all([
    supabase
      .from("closing_files")
      .select("*")
      .eq("closing_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reconciliations")
      .select(
        "id, categoria, competencia, confianca, justificativa, status, contract_id, " +
          "transactions ( data, historico, valor_centavos )",
      )
      .eq("user_id", user.id)
      .eq("closing_id", id)
      .order("confianca", { ascending: false }),
    supabase.from("accounts").select("id, apelido, tipo").eq("user_id", user.id).order("apelido"),
    supabase
      .from("contracts")
      .select("id, locatario, valor_centavos")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("locatario"),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <PortalHeader email={user.email ?? ""} />
      <FechamentoClient
        fechamento={fechamento as Fechamento}
        arquivosIniciais={(arquivos.data ?? []) as Arquivo[]}
        propostasIniciais={(propostas.data ?? []) as unknown as PropostaVH[]}
        contas={(contas.data ?? []) as { id: string; apelido: string; tipo: string }[]}
        contratos={(contratos.data ?? []) as { id: string; locatario: string; valor_centavos: number }[]}
      />
    </div>
  );
}
