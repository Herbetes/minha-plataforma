import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY,
  chatRequestSchema,
  deriveTitle,
  toAnthropicMessages,
} from "./chat";

describe("chatRequestSchema", () => {
  it("aceita uma mensagem simples", () => {
    const r = chatRequestSchema.safeParse({ message: "olá" });
    expect(r.success).toBe(true);
  });

  it("apara espaços em volta", () => {
    const r = chatRequestSchema.parse({ message: "  olá  " });
    expect(r.message).toBe("olá");
  });

  it("recusa mensagem vazia ou só com espaço", () => {
    expect(chatRequestSchema.safeParse({ message: "" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "   " }).success).toBe(false);
  });

  it("recusa mensagem acima do limite", () => {
    const r = chatRequestSchema.safeParse({ message: "a".repeat(8001) });
    expect(r.success).toBe(false);
  });

  it("recusa conversationId que não é uuid", () => {
    const r = chatRequestSchema.safeParse({ message: "oi", conversationId: "123" });
    expect(r.success).toBe(false);
  });
});

describe("toAnthropicMessages", () => {
  it("descarta mensagens vazias, que a API rejeitaria", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "oi" },
      { role: "assistant", content: "   " },
      { role: "user", content: "tudo bem?" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "oi" },
      { role: "user", content: "tudo bem?" },
    ]);
  });

  it("começa sempre por uma mensagem do usuário", () => {
    const out = toAnthropicMessages([
      { role: "assistant", content: "sobra de uma conversa antiga" },
      { role: "user", content: "oi" },
    ]);
    expect(out[0]?.role).toBe("user");
    expect(out).toHaveLength(1);
  });

  it("retorna vazio quando não há nenhuma mensagem do usuário", () => {
    expect(toAnthropicMessages([{ role: "assistant", content: "eco" }])).toEqual([]);
  });

  it("mantém apenas as últimas MAX_HISTORY mensagens", () => {
    const rows = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `msg ${i}`,
    }));
    const out = toAnthropicMessages(rows);
    expect(out.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(out.at(-1)?.content).toBe(`msg ${MAX_HISTORY + 9}`);
  });
});

describe("deriveTitle", () => {
  it("usa a mensagem curta como título", () => {
    expect(deriveTitle("Qual o reajuste do contrato?")).toBe(
      "Qual o reajuste do contrato?",
    );
  });

  it("normaliza quebras de linha e espaços repetidos", () => {
    expect(deriveTitle("linha um\n\n  linha dois")).toBe("linha um linha dois");
  });

  it("trunca mensagem longa em 60 caracteres", () => {
    const t = deriveTitle("a".repeat(200));
    expect(t).toHaveLength(60);
    expect(t.endsWith("...")).toBe(true);
  });

  it("tem um padrão para entrada vazia", () => {
    expect(deriveTitle("   ")).toBe("Nova conversa");
  });
});
