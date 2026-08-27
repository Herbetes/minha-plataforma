import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { anthropicApiKey, anthropicModel } from "@/lib/env";
import {
  chatRequestSchema,
  deriveTitle,
  toAnthropicMessages,
  type StoredMessage,
} from "@/lib/chat";
import { CHAT_SYSTEM_PROMPT_V1 } from "@/prompts/chat";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
/** Streaming pode passar dos 10s padrão da Vercel. */
export const maxDuration = 60;

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // ---- 1. Quem está pedindo? ------------------------------------------------
  // getUser valida o token no servidor do Supabase. getSession só lê o cookie,
  // que o navegador pode ter forjado — não serve para autorizar nada.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return bad("Faça login para conversar.", 401);

  // ---- 2. O pedido é válido? ------------------------------------------------
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return bad("Corpo da requisição não é JSON válido.", 400);
  }

  const parsed = chatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "Requisição inválida.", 400);
  }

  const { message } = parsed.data;
  let conversationId = parsed.data.conversationId;

  // ---- 3. Conversa: continua uma existente ou abre uma nova ------------------
  // O RLS garante que ninguém alcance a conversa de outro usuário; aqui só
  // confirmamos que ela existe, para devolver 404 em vez de erro genérico.
  if (conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) return bad("Conversa não encontrada.", 404);
  } else {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: deriveTitle(message) })
      .select("id")
      .single();

    if (error || !data) return bad("Não foi possível criar a conversa.", 500);
    conversationId = data.id as string;
  }

  // ---- 4. Memória de conversa: histórico + a mensagem nova -------------------
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .order("id", { ascending: true });

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: message,
  });

  if (insertError) return bad("Não foi possível gravar a mensagem.", 500);

  const messages = toAnthropicMessages([
    ...((history ?? []) as StoredMessage[]),
    { role: "user", content: message },
  ]);

  // ---- 5. Resposta do Claude, em streaming ----------------------------------
  let anthropic: Anthropic;
  let model: string;
  try {
    anthropic = new Anthropic({ apiKey: anthropicApiKey() });
    model = anthropicModel();
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Configuração da IA ausente.",
      500,
    );
  }

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";

      try {
        const stream = anthropic.messages.stream({
          model,
          max_tokens: 16000,
          // Adaptive é o padrão no Opus 5. Effort "medium" mantém o chat
          // respondendo rápido; suba para "high" quando a tarefa exigir.
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: CHAT_SYSTEM_PROMPT_V1,
          messages,
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            answer += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await stream.finalMessage();

        if (final.stop_reason === "refusal") {
          const aviso =
            "\n\n[O modelo recusou responder a esta mensagem. Reformule a pergunta.]";
          answer += aviso;
          controller.enqueue(encoder.encode(aviso));
        }

        // Grava a resposta com tokens e custo rastreáveis desde o dia 1.
        if (answer.trim().length > 0) {
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: answer,
            model,
            input_tokens: final.usage.input_tokens,
            output_tokens: final.usage.output_tokens,
          });
        }
      } catch (error) {
        console.error("[api/chat] falha ao gerar resposta", error);
        controller.enqueue(
          encoder.encode(
            "\n\n[Erro ao falar com a IA. Confira ANTHROPIC_API_KEY e tente de novo.]",
          ),
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
      "X-Conversation-Id": conversationId,
    },
  });
}
