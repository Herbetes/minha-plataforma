import { NextResponse } from "next/server";
import { z } from "zod";
import { erro, exigirUsuario, lerJson } from "@/lib/api";

export const runtime = "nodejs";

const criarSchema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Use o formato AAAA-MM"),
});

export async function GET() {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { data, error } = await supabase
    .from("closings")
    .select("*")
    .eq("user_id", user.id)
    .order("competencia", { ascending: false });

  if (error) return erro("Não foi possível listar os fechamentos.", 500);
  return NextResponse.json({ fechamentos: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const parsed = criarSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Competência inválida.", 400);
  }

  // Abrir o mesmo mês duas vezes é engano comum; devolve o que já existe em
  // vez de criar um segundo fechamento do mesmo período.
  const { data: existente } = await supabase
    .from("closings")
    .select("*")
    .eq("user_id", user.id)
    .eq("competencia", parsed.data.competencia)
    .maybeSingle();

  if (existente) return NextResponse.json({ fechamento: existente, jaExistia: true });

  const { data, error } = await supabase
    .from("closings")
    .insert({ user_id: user.id, competencia: parsed.data.competencia })
    .select("*")
    .single();

  if (error || !data) return erro("Não foi possível abrir o fechamento.", 500);
  return NextResponse.json({ fechamento: data });
}
