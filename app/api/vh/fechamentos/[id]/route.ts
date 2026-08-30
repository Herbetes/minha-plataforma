import { NextResponse } from "next/server";
import { z } from "zod";
import { erro, exigirUsuario, lerJson } from "@/lib/api";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

const mudarStatus = z.object({
  status: z.enum(["aberto", "conferencia", "fechado"]),
});

/**
 * Muda o estado do fechamento.
 *
 * Fechar congela os números — o mês já foi para a contabilidade. Reabrir é
 * possível, mas é um clique consciente e fica registrado.
 */
export async function PATCH(request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;
  const parsed = mudarStatus.safeParse(await lerJson(request));
  if (!parsed.success) return erro("Status inválido.", 400);

  const { status } = parsed.data;

  if (status === "fechado") {
    const { count } = await supabase
      .from("reconciliations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("closing_id", id)
      .eq("status", "proposta");

    if (count && count > 0) {
      return erro(
        `Ainda há ${count} proposta(s) sem decisão. Revise todas antes de fechar o mês.`,
        422,
      );
    }
  }

  const { data, error } = await supabase
    .from("closings")
    .update({
      status,
      fechado_em: status === "fechado" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return erro("Não foi possível mudar o estado.", 500);
  if (!data) return erro("Fechamento não encontrado.", 404);

  return NextResponse.json({ fechamento: data });
}
