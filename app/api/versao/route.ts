import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cada módulo e a tabela que prova que o SQL dele foi executado.
 * A tabela escolhida é sempre a ÚLTIMA que o schema daquele módulo cria — se
 * ela existe, o arquivo rodou até o fim.
 */
const MODULOS: { nome: string; tabela: string; coluna?: string }[] = [
  { nome: "chat", tabela: "conversations" },
  { nome: "cofre", tabela: "documents" },
  { nome: "pastas", tabela: "folders" },
  { nome: "vh", tabela: "contracts" },
  { nome: "vh_contas", tabela: "accounts" },
  { nome: "vh_fechamento", tabela: "closings" },
  // A coluna nova de hoje. Sem ela a leitura da planilha de despesas falha
  // inteira, e o sintoma na tela não diz que a causa é o SQL não ter rodado.
  { nome: "vh_apelidos", tabela: "contracts", coluna: "apelidos" },
  { nome: "radar", tabela: "radar_runs" },
];

/** Códigos que o Postgres/PostgREST usam para "não existe". */
const NAO_EXISTE = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

/**
 * Diz qual versão do código está publicada E se o banco acompanhou.
 *
 * As duas metades existem por confusões reais desta plataforma:
 *
 * - O botão "Redeploy" da Vercel repete o MESMO commit, então dá para publicar
 *   várias vezes e continuar rodando código antigo, sem nenhum sinal na tela.
 * - O código novo pode subir antes de o schema-completo.sql ser executado. Aí
 *   a tela quebra num lugar que não tem nada a ver com a causa, e a pessoa vai
 *   procurar defeito no programa quando falta um passo no Supabase.
 *
 * Só devolve nome de tabela e commit — o repositório é público, e o RLS
 * continua valendo: nenhuma linha de dado sai por aqui.
 */
export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  const banco: Record<string, string> = {};
  let faltando = 0;

  try {
    const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false },
    });

    // `head: true` não traz linha nenhuma: a pergunta é só se a tabela existe.
    await Promise.all(
      MODULOS.map(async ({ nome, tabela, coluna }) => {
        const { error } = await supabase
          .from(tabela)
          .select(coluna ?? "*", { head: true, count: "exact" })
          .limit(1);

        if (!error) {
          banco[nome] = "ok";
        } else if (NAO_EXISTE.has(error.code ?? "")) {
          banco[nome] = "FALTA RODAR O SQL";
          faltando += 1;
        } else {
          banco[nome] = `erro: ${error.code ?? "desconhecido"}`;
        }
      }),
    );
  } catch {
    return NextResponse.json({
      commit: sha ? sha.slice(0, 7) : "desconhecido (rodando fora da Vercel)",
      banco: "não consegui falar com o banco — confira as variáveis do Supabase",
    });
  }

  return NextResponse.json({
    commit: sha ? sha.slice(0, 7) : "desconhecido (rodando fora da Vercel)",
    mensagem: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    ambiente: process.env.VERCEL_ENV ?? "local",
    banco,
    recado:
      faltando === 0
        ? "Banco em dia com o código."
        : `${faltando} parte(s) do banco não existem ainda. Rode supabase/schema-completo.sql no SQL Editor do Supabase.`,
  });
}
