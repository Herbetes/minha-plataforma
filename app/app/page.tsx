import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { StoredMessage } from "@/lib/chat";
import ChatClient from "./chat-client";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O middleware já barra quem não tem sessão; isto é o cinto de segurança
  // para o caso de a rota ser alcançada por outro caminho.
  if (!user) redirect("/login");

  // Retoma a conversa mais recente — é o que faz o histórico sobreviver ao
  // fechar o navegador, que é a definição de pronto do Projeto 0.
  const { data: conversa } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let historico: StoredMessage[] = [];

  if (conversa) {
    const { data } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversa.id)
      .eq("user_id", user.id)
      .order("id", { ascending: true });

    historico = (data ?? []) as StoredMessage[];
  }

  return (
    <ChatClient
      email={user.email ?? ""}
      conversaInicial={conversa?.id ?? null}
      historicoInicial={historico}
    />
  );
}
