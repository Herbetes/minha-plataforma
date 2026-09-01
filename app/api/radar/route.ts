import { NextResponse } from "next/server";
import { z } from "zod";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { coletarAlertas, hojeSaoPaulo } from "@/lib/radar-dados";

export const runtime = "nodejs";

const prefsSchema = z.object({
  ativo: z.boolean(),
  email: z.email("E-mail inválido.").or(z.literal("")),
  diaSemana: z.number().int().min(0).max(6).default(1),
});

/** O que a tela do Radar mostra: alertas de agora, preferência e histórico. */
export async function GET() {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const hoje = hojeSaoPaulo();

  try {
    const [alertas, prefsRes, historicoRes] = await Promise.all([
      coletarAlertas(supabase, user.id, hoje),
      supabase.from("radar_prefs").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("radar_runs")
        .select("id, chave, origem, criticos, atencoes, resumo, enviado, email, erro, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    return NextResponse.json({
      hoje,
      alertas,
      prefs: prefsRes.data ?? { ativo: false, email: user.email ?? "", dia_semana: 1 },
      historico: historicoRes.data ?? [],
    });
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Não foi possível montar o Radar.", 500);
  }
}

/** Liga, desliga e configura. Sem preferência gravada, o Radar não envia nada. */
export async function PUT(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const parsed = prefsSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const { ativo, email, diaSemana } = parsed.data;
  if (ativo && !email) return erro("Informe o e-mail para receber o aviso.", 400);

  const { data, error } = await supabase
    .from("radar_prefs")
    .upsert(
      {
        user_id: user.id,
        ativo,
        email: email || null,
        dia_semana: diaSemana,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();

  if (error || !data) return erro("Não foi possível salvar a preferência.", 500);
  return NextResponse.json({ prefs: data });
}
