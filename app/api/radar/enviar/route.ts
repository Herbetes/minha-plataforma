import { NextResponse } from "next/server";
import { erro, exigirUsuario } from "@/lib/api";
import { hojeSaoPaulo } from "@/lib/radar-dados";
import { executarRadar } from "@/lib/radar-executar";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Envio de teste, disparado pela tela.
 *
 * Roda com a sessão do usuário — sem chave de serviço — e por isso o RLS
 * continua valendo: manda o aviso do próprio usuário e de mais ninguém.
 *
 * Marcado como origem 'manual', que é o que permite testar quantas vezes for
 * preciso sem gastar a execução agendada do dia.
 */
export async function POST() {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { data: prefs } = await supabase
    .from("radar_prefs")
    .select("email")
    .eq("user_id", user.id)
    .maybeSingle();

  const email = prefs?.email || user.email;
  if (!email) return erro("Informe e salve um e-mail antes de testar.", 400);

  try {
    const r = await executarRadar(supabase, user.id, String(email), hojeSaoPaulo(), "manual");
    return NextResponse.json({
      enviado: r.enviado,
      motivo: r.motivo,
      criticos: r.criticos,
      atencoes: r.atencoes,
    });
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Falha ao enviar.", 500);
  }
}
