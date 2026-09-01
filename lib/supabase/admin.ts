import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Cliente com poderes de serviço — enxerga a base inteira, sem Row Level Security.
 *
 * NÃO use isto em rota que atende navegador. Rota de usuário tem sessão, e a
 * sessão é justamente o que faz o RLS proteger um usuário do outro; trocar por
 * este cliente apagaria essa proteção sem nenhum aviso na tela.
 *
 * O único uso previsto é a execução agendada do Radar, que roda sem ninguém
 * logado e por isso não tem sessão para o RLS avaliar. Toda consulta feita por
 * aqui filtra `user_id` na mão — é o que substitui o RLS neste caminho.
 *
 * `persistSession: false` porque não existe navegador nem cookie nesta rota.
 */
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
