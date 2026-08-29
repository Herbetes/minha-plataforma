import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Resposta de erro no formato que as telas já sabem ler. */
export function erro(mensagem: string, status: number) {
  return NextResponse.json({ error: mensagem }, { status });
}

/**
 * Confere a sessão e devolve o cliente já pronto.
 *
 * Usa getUser(), que valida o token no servidor do Supabase — getSession()
 * apenas lê um cookie, que o navegador pode ter forjado.
 */
export async function exigirUsuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null as null };
  return { supabase, user };
}

/** Lê o corpo JSON sem deixar um payload malformado virar erro 500. */
export async function lerJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
