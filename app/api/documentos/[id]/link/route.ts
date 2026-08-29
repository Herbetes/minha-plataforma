import { NextResponse } from "next/server";
import { erro, exigirUsuario } from "@/lib/api";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/** Quanto tempo o link de download vale, em segundos. */
const VALIDADE = 60;

/**
 * Devolve um link temporário para baixar o PDF.
 *
 * O balde é privado, então não existe URL fixa. Um link assinado de um minuto
 * dá tempo de o navegador baixar e não vira endereço que alguém possa guardar
 * ou repassar.
 */
export async function POST(_request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) return erro("Documento não encontrado.", 404);

  const { data, error } = await supabase.storage
    .from("documentos")
    .createSignedUrl(doc.storage_path as string, VALIDADE, {
      download: doc.title as string,
    });

  if (error || !data) return erro("Não foi possível gerar o link.", 500);

  return NextResponse.json({ url: data.signedUrl });
}
