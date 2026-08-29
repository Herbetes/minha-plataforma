import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { decisaoSchema } from "@/lib/vh";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/**
 * A aprovação humana. É aqui, e só aqui, que uma proposta do agente vira
 * decisão — o agente nunca alcança este caminho.
 */
export async function PATCH(request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;
  const parsed = decisaoSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Decisão inválida.", 400);
  }

  const { status, contratoId } = parsed.data;

  const campos: Record<string, unknown> = {
    status,
    decidido_em: new Date().toISOString(),
  };

  // Corrigir o contrato na hora de aprovar é o caso mais comum de uso da tela:
  // o agente acertou que é aluguel e errou de quem.
  if (contratoId !== undefined) {
    if (contratoId) {
      const { data: c } = await supabase
        .from("contracts")
        .select("id")
        .eq("id", contratoId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!c) return erro("Contrato não encontrado.", 404);
    }
    campos.contract_id = contratoId;
  }

  const { data, error } = await supabase
    .from("reconciliations")
    .update(campos)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, status, contract_id")
    .maybeSingle();

  if (error) return erro("Não foi possível registrar a decisão.", 500);
  if (!data) return erro("Proposta não encontrada.", 404);

  return NextResponse.json({ conciliacao: data });
}
