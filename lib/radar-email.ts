/**
 * Montagem do e-mail do Radar.
 *
 * Separado do envio de propósito: assim dá para testar o conteúdo do aviso sem
 * mandar e-mail nenhum. O que chega na caixa de entrada é exatamente o que
 * estes testes verificam.
 */

import type { Alerta, Severidade } from "@/lib/radar";

const COR: Record<Severidade, string> = {
  critico: "#b91c1c",
  atencao: "#b45309",
  informativo: "#475569",
};

const ROTULO: Record<Severidade, string> = {
  critico: "CRÍTICO",
  atencao: "ATENÇÃO",
  informativo: "INFORMATIVO",
};

/** Escapa texto vindo do banco antes de virar HTML de e-mail. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Assunto do e-mail.
 *
 * O número vem no assunto porque é o que se lê na notificação do celular sem
 * abrir nada — "3 críticos" decide se a pessoa para o que está fazendo.
 */
export function assunto(alertas: Alerta[], hoje: string): string {
  const criticos = alertas.filter((a) => a.severidade === "critico").length;
  const atencoes = alertas.filter((a) => a.severidade === "atencao").length;
  const dia = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`;

  const partes: string[] = [];
  if (criticos > 0) partes.push(`${criticos} crítico${criticos > 1 ? "s" : ""}`);
  if (atencoes > 0) partes.push(`${atencoes} em atenção`);

  return partes.length > 0
    ? `Radar VH ${dia}: ${partes.join(", ")}`
    : `Radar VH ${dia}: tudo em ordem`;
}

/** Versão texto puro — é o que aparece em cliente que bloqueia HTML. */
export function corpoTexto(alertas: Alerta[], resumo: string, hoje: string): string {
  const linhas = [`RADAR VH — ${hoje}`, ""];
  if (resumo) linhas.push(resumo, "");

  for (const a of alertas) {
    linhas.push(`[${ROTULO[a.severidade]}] ${a.titulo}`);
    if (a.detalhe) linhas.push(`   ${a.detalhe}`);
    linhas.push("");
  }

  if (alertas.length === 0) linhas.push("Nada exigindo atenção nesta semana.", "");

  linhas.push("---", "Enviado automaticamente pela sua plataforma.");
  return linhas.join("\n");
}

/**
 * Versão HTML. Estilo direto na tag porque cliente de e-mail ignora <style>
 * de cabeçalho e tabela é o único layout que o Outlook renderiza igual.
 */
export function corpoHtml(alertas: Alerta[], resumo: string, hoje: string, link: string): string {
  const itens = alertas
    .map(
      (a) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0">
          <div style="font-size:11px;font-weight:700;letter-spacing:.5px;color:${COR[a.severidade]}">
            ${ROTULO[a.severidade]}
          </div>
          <div style="font-size:15px;font-weight:600;color:#0f172a;margin-top:2px">
            ${escaparHtml(a.titulo)}
          </div>
          <div style="font-size:13px;color:#475569;margin-top:2px">
            ${escaparHtml(a.detalhe)}
          </div>
        </td>
      </tr>`,
    )
    .join("");

  const vazio = `
      <tr><td style="padding:12px 0;font-size:14px;color:#475569">
        Nada exigindo atenção nesta semana.
      </td></tr>`;

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
        <tr><td style="font-size:18px;font-weight:700;color:#0f172a">Radar VH</td></tr>
        <tr><td style="font-size:13px;color:#64748b;padding-bottom:12px">${escaparHtml(hoje)}</td></tr>
        ${
          resumo
            ? `<tr><td style="font-size:14px;line-height:1.6;color:#334155;background:#f1f5f9;border-radius:8px;padding:12px">${escaparHtml(resumo)}</td></tr>`
            : ""
        }
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${alertas.length > 0 ? itens : vazio}
          </table>
        </td></tr>
        <tr><td style="padding-top:20px">
          <a href="${escaparHtml(link)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">
            Abrir a plataforma
          </a>
        </td></tr>
        <tr><td style="padding-top:20px;font-size:12px;color:#94a3b8">
          Enviado automaticamente. Para parar, desligue o Radar na plataforma.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
