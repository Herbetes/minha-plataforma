import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { criarPastaSchema } from "@/lib/pastas";

export const runtime = "nodejs";

/** Lista as pastas do usuário, com quantos documentos cada uma tem. */
export async function GET() {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { data, error } = await supabase
    .from("folders")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) return erro("Não foi possível listar as pastas.", 500);
  return NextResponse.json({ pastas: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const parsed = criarPastaSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Nome inválido.", 400);
  }

  const { data, error } = await supabase
    .from("folders")
    .insert({ user_id: user.id, name: parsed.data.nome })
    .select("id, name")
    .single();

  // 23505 = índice único. Aqui só pode ser o nome repetido.
  if (error?.code === "23505") {
    return erro(`Você já tem uma pasta chamada "${parsed.data.nome}".`, 409);
  }
  if (error || !data) return erro("Não foi possível criar a pasta.", 500);

  return NextResponse.json({ pasta: data });
}
