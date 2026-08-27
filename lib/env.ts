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
