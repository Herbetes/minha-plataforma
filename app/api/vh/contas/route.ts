import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { contaSchema } from "@/lib/vh";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("apelido");

  if (error) return erro("Não foi possível listar as contas.", 500);
  return NextResponse.json({ contas: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const parsed = contaSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const c = parsed.data;
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      apelido: c.apelido,
      titular: c.titular ?? null,
      tipo: c.tipo,
      banco: c.banco ?? null,
      agencia: c.agencia ?? null,
      numero: c.numero ?? null,
    })
    .select("*")
    .single();

  if (error?.code === "23505") {
    return erro(`Você já tem uma conta chamada "${c.apelido}".`, 409);
  }
  if (error || !data) return erro("Não foi possível criar a conta.", 500);
  return NextResponse.json({ conta: data });
}
