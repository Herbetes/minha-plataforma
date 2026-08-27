import { z } from "zod";

/**
 * Lógica pura do chat — sem rede, sem banco, sem Next.
 * É o que dá para testar rápido e é onde moram os erros de verdade.
 */

/** Quantas mensagens do histórico vão junto no pedido ao modelo. */
export const MAX_HISTORY = 40;

/** Limite de tamanho da mensagem do usuário. */
export const MAX_MESSAGE_CHARS = 8000;

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "Mensagem vazia").max(MAX_MESSAGE_CHARS),
  conversationId: z.uuid().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Converte linhas do banco no formato que a API espera.
 *
 * Faz três coisas que parecem detalhe e não são:
 * - descarta mensagens vazias, que a API rejeita com 400;
 * - mantém só as MAX_HISTORY últimas, para a conversa não crescer sem limite;
 * - garante que a sequência comece com "user", porque a API exige isso.
 */
export function toAnthropicMessages(rows: StoredMessage[]): AnthropicMessage[] {
  const clean = rows
    .filter((r) => r.content.trim().length > 0)
    .slice(-MAX_HISTORY);

  const firstUser = clean.findIndex((r) => r.role === "user");
  if (firstUser === -1) return [];

  return clean.slice(firstUser).map((r) => ({ role: r.role, content: r.content }));
}

/** Título da conversa a partir da primeira mensagem, para a lista lateral. */
export function deriveTitle(message: string): string {
  const oneLine = message.trim().replace(/\s+/g, " ");
  if (oneLine.length === 0) return "Nova conversa";
  if (oneLine.length <= 60) return oneLine;
  return `${oneLine.slice(0, 57).trimEnd()}...`;
}
