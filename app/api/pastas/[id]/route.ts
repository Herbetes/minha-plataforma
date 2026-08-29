import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { renomearPastaSchema } from "@/lib/pastas";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;
  const parsed = renomearPastaSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Nome inválido.", 400);
  }

  const { data, error } = await supabase
    .from("folders")
    .update({ name: parsed.data.nome })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name")
    .maybeSingle();

  if (error?.code === "23505") {
    return erro(`Você já tem uma pasta chamada "${parsed.data.nome}".`, 409);
  }
  if (error) return erro("Não foi possível renomear a pasta.", 500);
  if (!data) return erro("Pasta não encontrada.", 404);

  return NextResponse.json({ pasta: data });
}

/**
 * Apaga a pasta — e só a pasta.
 *
 * Os documentos dela voltam para "Sem pasta" (o `on delete set null` do
 * schema). Apagar arquivos junto seria uma perda irreversível disparada por
 * um clique de organização.
 */
export async function DELETE(_request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;

  const { data, error } = await supabase
    .from("folders")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return erro("Não foi possível apagar a pasta.", 500);
  if (!data) return erro("Pasta não encontrada.", 404);

  return NextResponse.json({ ok: true });
}
