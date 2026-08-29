import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diz qual versão do código está publicada.
 *
 * Existe por causa de uma confusão real: o botão "Redeploy" da Vercel repete o
 * mesmo commit, então dá para publicar várias vezes e continuar rodando código
 * antigo — sem nenhum sinal na tela. Abrir /api/versao responde na hora se o
 * que está no ar é o que está no GitHub.
 *
 * Só devolve dados do repositório, que é público. Nada de segredo aqui.
 */
export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  return NextResponse.json({
    commit: sha ? sha.slice(0, 7) : "desconhecido (rodando fora da Vercel)",
    mensagem: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    ambiente: process.env.VERCEL_ENV ?? "local",
    modulos: {
      chat: true,
      cofre: true,
    },
  });
}
