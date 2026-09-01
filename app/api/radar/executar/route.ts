import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cronSecret } from "@/lib/env";
import { erro } from "@/lib/api";
import { hojeSaoPaulo } from "@/lib/radar-dados";
import { executarRadar } from "@/lib/radar-executar";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// A execução varre contratos e conversa com dois serviços externos; o teto
// padrão de 10 segundos cortaria o envio no meio.
export const maxDuration = 60;

/** Comparação de tempo constante: `===` em segredo vaza o tamanho do acerto. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Alvo do agendamento da Vercel (ver "crons" em vercel.json).
 *
 * Esta URL é pública — qualquer um pode chamá-la. O que a protege é o
 * cabeçalho Authorization com o CRON_SECRET, que a Vercel envia sozinha nas
 * chamadas agendadas.
 *
 * É o único lugar do projeto que usa a chave de serviço do Supabase: aqui não
 * existe usuário logado, logo não existe sessão para o RLS avaliar. Em troca,
 * cada consulta filtra `user_id` na mão.
 */
export async function GET(request: Request) {
  const cabecalho = request.headers.get("authorization") ?? "";
  const recebido = cabecalho.replace(/^Bearer\s+/i, "");

  let esperado: string;
  try {
    esperado = cronSecret();
  } catch {
    return erro("CRON_SECRET não configurado no servidor.", 500);
  }

  if (!recebido || !segredoConfere(recebido, esperado)) {
    return erro("Não autorizado.", 401);
  }

  const supabase = createAdminClient();
  const hoje = hojeSaoPaulo();

  const { data: prefs, error } = await supabase
    .from("radar_prefs")
    .select("user_id, email")
    .eq("ativo", true)
    .not("email", "is", null);

  if (error) return erro("Não foi possível ler as preferências do Radar.", 500);

  const resultados = [];
  for (const pref of prefs ?? []) {
    // Um usuário com problema não pode impedir o aviso dos outros.
    try {
      const r = await executarRadar(
        supabase,
        String(pref.user_id),
        String(pref.email),
        hoje,
        "cron",
      );
      resultados.push({
        userId: pref.user_id,
        enviado: r.enviado,
        criticos: r.criticos,
        atencoes: r.atencoes,
        motivo: r.motivo,
      });
    } catch (e) {
      resultados.push({
        userId: pref.user_id,
        enviado: false,
        erro: e instanceof Error ? e.message : "falha desconhecida",
      });
    }
  }

  return NextResponse.json({ hoje, usuarios: resultados.length, resultados });
}
