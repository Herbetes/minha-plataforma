import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VhClient, { type Conta, type Contrato, type Proposta } from "./vh-client";

export const dynamic = "force-dynamic";

export default async function VhPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [contratos, propostas, contas] = await Promise.all([
    supabase.from("contracts").select("*").eq("user_id", user.id).order("imovel"),
    supabase
      .from("reconciliations")
      .select(
        "id, categoria, competencia, confianca, justificativa, status, contract_id, " +
          "transactions ( data, historico, valor_centavos )",
      )
      .eq("user_id", user.id)
      .order("confianca", { ascending: false })
      .limit(200),
    supabase.from("accounts").select("*").eq("user_id", user.id).order("apelido"),
  ]);

  return (
    <VhClient
      email={user.email ?? ""}
      contratosIniciais={(contratos.data ?? []) as Contrato[]}
      propostasIniciais={(propostas.data ?? []) as unknown as Proposta[]}
      contasIniciais={(contas.data ?? []) as Conta[]}
    />
  );
}
