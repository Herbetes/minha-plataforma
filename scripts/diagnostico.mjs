#!/usr/bin/env node
/**
 * Diagnóstico de ambiente.
 *
 * Responde a uma pergunta só: "as minhas credenciais funcionam?"
 * Roda antes de abrir o navegador, para você não ficar caçando erro na tela.
 *
 *   npm run diagnostico
 *
 * Faz uma chamada real (e minúscula) à API da Anthropic — custa fração de
 * centavo. É de propósito: só uma chamada real prova que a chave funciona.
 */

import { readFileSync } from "node:fs";

const VERDE = "\x1b[32m";
const VERMELHO = "\x1b[31m";
const AMARELO = "\x1b[33m";
const CINZA = "\x1b[90m";
const FIM = "\x1b[0m";

let falhas = 0;

function ok(titulo, detalhe) {
  console.log(`${VERDE}  OK${FIM}   ${titulo}${detalhe ? `\n       ${CINZA}${detalhe}${FIM}` : ""}`);
}

function erro(titulo, causa, correcao) {
  falhas++;
  console.log(`${VERMELHO}  FALHA${FIM} ${titulo}`);
  if (causa) console.log(`       ${CINZA}${causa}${FIM}`);
  if (correcao) console.log(`       ${AMARELO}-> ${correcao}${FIM}`);
}

function aviso(titulo, detalhe) {
  console.log(`${AMARELO}  ?${FIM}    ${titulo}${detalhe ? `\n       ${CINZA}${detalhe}${FIM}` : ""}`);
}

/** Lê .env.local sem depender de biblioteca. */
function carregarEnv() {
  try {
    const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const linha of texto.split("\n")) {
      const limpa = linha.trim();
      if (!limpa || limpa.startsWith("#")) continue;
      const igual = limpa.indexOf("=");
      if (igual === -1) continue;
      const chave = limpa.slice(0, igual).trim();
      const valor = limpa.slice(igual + 1).trim().replace(/^["']|["']$/g, "");
      if (!(chave in process.env)) process.env[chave] = valor;
    }
    return true;
  } catch {
    return false;
  }
}

console.log("\nDiagnóstico do ambiente\n");

// ---------------------------------------------------------------- 1. Variáveis
const achouArquivo = carregarEnv();
if (!achouArquivo && !process.env.ANTHROPIC_API_KEY) {
  erro(
    "Arquivo .env.local não encontrado",
    "É dele que saem as credenciais para rodar na sua máquina.",
    "Rode: cp .env.example .env.local  — e preencha as quatro variáveis.",
  );
}

const OBRIGATORIAS = [
  ["ANTHROPIC_API_KEY", "console.anthropic.com -> API Keys"],
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase -> Project Settings -> API -> Project URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase -> Project Settings -> API -> anon public"],
];

let faltando = false;
for (const [nome, onde] of OBRIGATORIAS) {
  const valor = process.env[nome];
  if (!valor || valor.includes("...") || valor.startsWith("xxxx")) {
    erro(`${nome} ausente ou ainda com o valor de exemplo`, null, `Pegue em: ${onde}`);
    faltando = true;
  } else {
    ok(nome, `${valor.slice(0, 12)}... (${valor.length} caracteres)`);
  }
}

const modelo = process.env.ANTHROPIC_MODEL || "claude-opus-5";
ok("ANTHROPIC_MODEL", `${modelo}${process.env.ANTHROPIC_MODEL ? "" : " (padrão)"}`);

if (faltando) {
  console.log(`\n${VERMELHO}Corrija as variáveis acima antes de seguir.${FIM}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- 2. Anthropic
console.log("\nAnthropic\n");
try {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resposta = await client.messages.create({
    model: modelo,
    max_tokens: 16,
    messages: [{ role: "user", content: "Responda apenas: ok" }],
  });
  const texto = resposta.content.find((b) => b.type === "text")?.text?.trim() ?? "";
  ok(
    "A chave funciona e o modelo respondeu",
    `modelo servido: ${resposta.model} · resposta: "${texto}" · ` +
      `tokens: ${resposta.usage.input_tokens} entrada / ${resposta.usage.output_tokens} saída`,
  );
} catch (e) {
  const status = e?.status;
  if (status === 401) {
    erro("Chave da Anthropic rejeitada (401)", e.message,
      "Gere uma chave nova em console.anthropic.com -> API Keys.");
  } else if (status === 400 && String(e.message).includes("model")) {
    erro(`Modelo "${modelo}" não existe ou não está liberado`, e.message,
      "Ajuste ANTHROPIC_MODEL no .env.local.");
  } else if (status === 429) {
    erro("Limite atingido (429)", e.message,
      "Confira o teto de gasto e os créditos em console.anthropic.com -> Limits.");
  } else {
    erro("Falha ao chamar a Anthropic", e?.message ?? String(e),
      "Confira conexão, chave e créditos.");
  }
}

// ---------------------------------------------------------------- 3. Supabase
console.log("\nSupabase\n");
try {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  for (const tabela of ["conversations", "messages"]) {
    const { data, error } = await supabase.from(tabela).select("*").limit(1);

    if (error) {
      const msg = error.message ?? "";
      if (/does not exist|Could not find the table|schema cache/i.test(msg)) {
        erro(`Tabela "${tabela}" não existe`, msg,
          "Cole supabase/schema.sql no SQL Editor do Supabase e execute.");
      } else if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) {
        erro(
          "Não foi possível alcançar o Supabase",
          msg,
          `Confira NEXT_PUBLIC_SUPABASE_URL (está como "${process.env.NEXT_PUBLIC_SUPABASE_URL}"). Deve ser algo como https://abcdefgh.supabase.co`,
        );
        break;
      } else if (/JWT|apikey|Invalid/i.test(msg)) {
        erro("Chave anon do Supabase rejeitada", msg,
          "Confira NEXT_PUBLIC_SUPABASE_ANON_KEY em Project Settings -> API.");
      } else {
        erro(`Erro ao consultar "${tabela}"`, msg, null);
      }
    } else if (data.length > 0) {
      // Sem sessão, o RLS deveria devolver zero linhas. Se voltou linha,
      // o RLS não está ligado — qualquer pessoa com a anon key lê tudo.
      erro(
        `RLS parece DESLIGADO em "${tabela}"`,
        `A consulta anônima devolveu ${data.length} linha(s). Sem RLS, a anon key (que é pública) lê os dados de todo mundo.`,
        "Rode de novo a seção de Row Level Security do supabase/schema.sql.",
      );
    } else {
      ok(`Tabela "${tabela}" existe e o RLS está barrando acesso anônimo`);
    }
  }
} catch (e) {
  erro("Não foi possível falar com o Supabase", e?.message ?? String(e),
    "Confira NEXT_PUBLIC_SUPABASE_URL (deve terminar em .supabase.co).");
}

// ---------------------------------------------------------- 4. Passo manual
console.log("\nO que este script não consegue checar\n");
aviso(
  "Redirect URLs do Supabase",
  "Authentication -> URL Configuration precisa conter http://localhost:3000/auth/callback " +
    "e a URL da Vercel. Sem isso o link do e-mail volta com erro.",
);

// ------------------------------------------------------------------ Resultado
console.log("");
if (falhas === 0) {
  console.log(`${VERDE}Ambiente pronto.${FIM} Rode ${CINZA}npm run dev${FIM} e faça o login.\n`);
} else {
  console.log(`${VERMELHO}${falhas} problema(s) acima.${FIM} Corrija e rode de novo.\n`);
  process.exit(1);
}
