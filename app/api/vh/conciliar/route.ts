import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { conciliar } from "@/lib/vh-agente";

export const runtime = "nodejs";
/** O agente faz várias idas ao modelo; precisa de fôlego. */
export const maxDuration = 300;

export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const corpo = (await lerJson(request)) as { extratoId?: string } | undefined;

  // Sem contrato cadastrado não há o que conciliar — e o agente gastaria
  // tokens para concluir isso sozinho.
  const { count } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("ativo", true);

  if (!count) {
    return erro("Cadastre pelo menos um contrato ativo antes de conciliar.", 422);
  }

  try {
    const resultado = await conciliar(supabase, user.id, corpo?.extratoId ?? null);
    return NextResponse.json(resultado);
  } catch (e) {
    console.error("[api/vh/conciliar] falha", e);
    return erro(
      e instanceof Error ? e.message : "O agente falhou durante a conciliação.",
      500,
    );
  }
}
