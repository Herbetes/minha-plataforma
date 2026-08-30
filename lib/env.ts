/**
 * Acesso a variáveis de ambiente com erro legível.
 *
 * Duas regras que valem para o projeto inteiro:
 *
 * 1. As variáveis são lidas DENTRO de funções, nunca no topo do módulo. Se
 *    fossem lidas no topo, `next build` quebraria em qualquer máquina sem
 *    .env.local — inclusive no CI, que não tem segredo nenhum.
 * 2. `process.env.NOME` aparece escrito por extenso. O Next.js substitui essas
 *    ocorrências literalmente durante o build; ler via índice dinâmico
 *    (`process.env[nome]`) faz a substituição falhar silenciosamente e a
 *    variável chega como undefined no navegador.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. ` +
        `Copie .env.example para .env.local e preencha (ou configure em Vercel > Settings > Environment Variables).`,
    );
  }
  return value;
}

/** Só no servidor. Nunca exponha ao navegador. */
export function anthropicApiKey(): string {
  return required(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY");
}

/** Modelo configurável sem mexer no código. */
export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5";
}

/** Pública por design — quem protege os dados é o RLS, não o segredo da chave. */
export function supabaseUrl(): string {
  return required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

/**
 * Chave de serviço do Supabase. SÓ no servidor, e só onde não existe sessão.
 *
 * Esta chave ignora o Row Level Security: com ela, o código enxerga a base
 * inteira. É por isso que ela NÃO tem o prefixo NEXT_PUBLIC_ — se tivesse, o
 * Next.js a embutiria no JavaScript que vai para o navegador e qualquer pessoa
 * poderia ler os dados de qualquer usuário.
 *
 * Existe um único motivo legítimo de uso aqui: o Radar roda por agendamento,
 * sem ninguém logado, e portanto sem sessão para o RLS avaliar.
 */
export function supabaseServiceRoleKey(): string {
  return required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * Segredo que autoriza a execução agendada.
 *
 * A rota do Radar fica numa URL pública. Sem este segredo, qualquer um que
 * descobrisse o endereço dispararia o envio à vontade.
 */
export function cronSecret(): string {
  return required(process.env.CRON_SECRET, "CRON_SECRET");
}

/** Envio de e-mail (resend.com). */
export function resendApiKey(): string {
  return required(process.env.RESEND_API_KEY, "RESEND_API_KEY");
}

/** Remetente do aviso semanal. Precisa ser de um domínio verificado no Resend. */
export function radarRemetente(): string {
  return process.env.RADAR_REMETENTE || "Radar <onboarding@resend.dev>";
}

/**
 * Endereço público da plataforma, para o botão do e-mail.
 *
 * A Vercel injeta VERCEL_PROJECT_PRODUCTION_URL sem o "https://"; sem o
 * esquema, o link vira relativo e não abre a partir da caixa de entrada.
 */
export function siteUrl(): string {
  const explicito = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicito) return explicito.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
