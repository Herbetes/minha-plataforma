import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { anthropicApiKey, anthropicModel } from "@/lib/env";
import {
  TRECHOS_POR_PERGUNTA,
  montarConsulta,
  perguntaSchema,
} from "@/lib/cofre";
import {
  COFRE_SYSTEM_PROMPT_V1,
  montarMensagem,
  type TrechoRecuperado,
} from "@/prompts/cofre";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type LinhaBusca = {
  chunk_id: number;
  document_id: string;
  documento: string;
  pagina: number | null;
  ordinal: number;
  conteudo: string;
  score: number;
};

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return bad("Faça login para consultar o Cofre.", 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return bad("Corpo da requisição não é JSON válido.", 400);
  }

  const parsed = perguntaSchema.safeParse(raw);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "Requisição inválida.", 400);
  }

  const { pergunta } = parsed.data;

  const consulta = montarConsulta(pergunta);
  if (!consulta) {
    return bad(
      "Sua pergunta não tem nenhuma palavra pesquisável. Use termos que apareçam no documento.",
      400,
    );
  }

  // O RLS vale dentro da função: ela só enxerga os trechos deste usuário.
  const { data, error } = await supabase.rpc("buscar_trechos", {
    consulta,
    limite: TRECHOS_POR_PERGUNTA,
  });

  if (error) {
    console.error("[api/cofre] falha na busca", error);
    return bad("Falha ao buscar nos documentos.", 500);
  }

  const linhas = (data ?? []) as LinhaBusca[];

  if (linhas.length === 0) {
    return NextResponse.json({
      vazio: true,
      resposta:
        "Não encontrei nada sobre isso nos seus documentos. Tente palavras que " +
        "apareçam literalmente no texto — por exemplo o nome do locatário, o " +
        "número da cláusula ou o índice de reajuste.",
      fontes: [],
    });
  }

  const trechos: TrechoRecuperado[] = linhas.map((l) => ({
    documento: l.documento,
    pagina: l.pagina,
    conteudo: l.conteudo,
  }));

  // As fontes viajam no cabeçalho para a tela poder mostrá-las junto da
  // resposta, sem precisar de uma segunda requisição.
  const fontes = linhas.map((l, i) => ({
    n: i + 1,
    documento: l.documento,
    pagina: l.pagina,
    trecho: l.conteudo.slice(0, 180).replace(/\s+/g, " ").trim(),
  }));

  let anthropic: Anthropic;
  let model: string;
  try {
    anthropic = new Anthropic({ apiKey: anthropicApiKey() });
    model = anthropicModel();
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Configuração da IA ausente.", 500);
  }

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = anthropic.messages.stream({
          model,
          max_tokens: 8000,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: COFRE_SYSTEM_PROMPT_V1,
          messages: [{ role: "user", content: montarMensagem(pergunta, trechos) }],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(
            encoder.encode("\n\n[O modelo recusou responder. Reformule a pergunta.]"),
          );
        }
      } catch (error) {
        console.error("[api/cofre] falha ao gerar resposta", error);
        controller.enqueue(
          encoder.encode("\n\n[Erro ao consultar a IA. Tente de novo em instantes.]"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Fontes": encodeURIComponent(JSON.stringify(fontes)),
    },
  });
}
