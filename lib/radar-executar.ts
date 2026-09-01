import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicApiKey, anthropicModel, radarRemetente, resendApiKey, siteUrl } from "@/lib/env";
import { type Alerta, valeAvisar } from "@/lib/radar";
import { coletarAlertas } from "@/lib/radar-dados";
import { assunto, corpoHtml, corpoTexto } from "@/lib/radar-email";

export type ResultadoRadar = {
  chave: string;
  alertas: Alerta[];
  criticos: number;
  atencoes: number;
  resumo: string;
  enviado: boolean;
  motivo: string;
};

/**
 * Escreve o parágrafo de abertura do e-mail.
 *
 * O modelo recebe os alertas JÁ CALCULADOS e só os coloca em prosa. Ele não
 * consulta nada, não conta nada e não conclui nada — se inventasse um alerta,
 * a pessoa perderia a confiança em todos os outros, que estão certos.
 *
 * Falhar aqui não cancela o aviso: o e-mail sai sem resumo. Os fatos são o
 * conteúdo; o resumo é conforto de leitura.
 */
async function escreverResumo(alertas: Alerta[]): Promise<string> {
  if (alertas.length === 0) return "";

  const fatos = alertas
    .map((a) => `- [${a.severidade}] ${a.titulo} — ${a.detalhe}`)
    .join("\n");

  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey() });
    const resposta = await anthropic.messages.create({
      model: anthropicModel(),
      max_tokens: 700,
      output_config: { effort: "low" },
      system:
        "Você escreve a abertura de um aviso semanal para o dono de uma holding de imóveis. " +
        "Escreva em português do Brasil, no máximo três frases, tom direto e sem saudação. " +
        "Use SOMENTE os alertas listados: não some, não estime, não deduza e não invente nada. " +
        "Diga o que precisa de decisão primeiro. Não repita a lista item por item — ela vem logo abaixo.",
      messages: [{ role: "user", content: `Alertas de hoje:\n${fatos}` }],
    });

    return resposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch {
    return "";
  }
}

/** Envia pelo Resend. Erro aqui precisa aparecer no histórico, não sumir. */
async function enviarEmail(para: string, titulo: string, html: string, texto: string) {
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: radarRemetente(),
      to: [para],
      subject: titulo,
      html,
      text: texto,
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Resend recusou o envio (${resposta.status}): ${detalhe.slice(0, 300)}`);
  }
}

/**
 * Uma execução do Radar para um usuário.
 *
 * A ordem importa. A linha em `radar_runs` é gravada ANTES do envio: é ela que
 * segura a idempotência do agendamento. Se o job rodar duas vezes no mesmo dia
 * — retry da Vercel, deploy no meio, o que for — a segunda gravação esbarra no
 * índice único e a função devolve `enviado: false` sem mandar nada.
 *
 * Gravar depois do envio seria a ordem errada: bastaria uma falha entre mandar
 * e gravar para a próxima execução mandar o mesmo e-mail de novo.
 */
export async function executarRadar(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  hoje: string,
  origem: "cron" | "manual",
): Promise<ResultadoRadar> {
  const alertas = await coletarAlertas(supabase, userId, hoje);
  const criticos = alertas.filter((a) => a.severidade === "critico").length;
  const atencoes = alertas.filter((a) => a.severidade === "atencao").length;
  const chave = hoje.slice(0, 10);

  const base: ResultadoRadar = {
    chave,
    alertas,
    criticos,
    atencoes,
    resumo: "",
    enviado: false,
    motivo: "",
  };

  const { data: run, error: erroRun } = await supabase
    .from("radar_runs")
    .insert({
      user_id: userId,
      chave,
      origem,
      alertas,
      criticos,
      atencoes,
      email,
      enviado: false,
    })
    .select("id")
    .single();

  if (erroRun || !run) {
    // 23505 = violação de índice único, ou seja: já rodou hoje. Não é falha.
    const jaRodou = (erroRun as { code?: string } | null)?.code === "23505";
    return { ...base, motivo: jaRodou ? "Já executou hoje." : "Não foi possível registrar a execução." };
  }

  // Aviso semanal que chega vazio ensina a pessoa a ignorar o remetente.
  if (!valeAvisar(alertas)) {
    return { ...base, motivo: "Nada exigindo atenção — nenhum e-mail enviado." };
  }

  const resumo = await escreverResumo(alertas);
  const link = `${siteUrl()}/app/radar`;

  try {
    await enviarEmail(
      email,
      assunto(alertas, hoje),
      corpoHtml(alertas, resumo, hoje, link),
      corpoTexto(alertas, resumo, hoje),
    );
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Falha desconhecida no envio.";
    await supabase.from("radar_runs").update({ resumo, erro: mensagem }).eq("id", run.id);
    return { ...base, resumo, motivo: mensagem };
  }

  await supabase.from("radar_runs").update({ resumo, enviado: true }).eq("id", run.id);
  return { ...base, resumo, enviado: true, motivo: `E-mail enviado para ${email}.` };
}
