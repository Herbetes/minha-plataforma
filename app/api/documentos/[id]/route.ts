import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { moverDocumentoSchema } from "@/lib/pastas";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

/** Move o documento para uma pasta, ou para fora de todas (pastaId: null). */
export async function PATCH(request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;
  const parsed = moverDocumentoSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Requisição inválida.", 400);
  }

  const { pastaId } = parsed.data;

  // Confere que a pasta é do próprio usuário antes de apontar para ela. O RLS
  // já barraria, mas assim o erro é "pasta não encontrada" em vez de genérico.
  if (pastaId) {
    const { data: pasta } = await supabase
      .from("folders")
      .select("id")
      .eq("id", pastaId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pasta) return erro("Pasta não encontrada.", 404);
  }

  const { data, error } = await supabase
    .from("documents")
    .update({ folder_id: pastaId })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, folder_id")
    .maybeSingle();

  if (error) return erro("Não foi possível mover o documento.", 500);
  if (!data) return erro("Documento não encontrado.", 404);

  return NextResponse.json({ documento: data });
}

/**
 * Apaga o documento de verdade: os trechos, o registro e o PDF no Storage.
 *
 * Ordem importa. O arquivo sai primeiro; se saísse por último e a remoção
 * falhasse, sobraria um PDF órfão pagando armazenamento para sempre, sem
 * nenhuma linha no banco apontando para ele.
 */
export async function DELETE(_request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;

  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!doc) return erro("Documento não encontrado.", 404);

  const { error: storageError } = await supabase.storage
    .from("documentos")
    .remove([doc.storage_path as string]);

  if (storageError) {
    console.error("[api/documentos] falha ao apagar arquivo", storageError);
    return erro("Não foi possível apagar o arquivo guardado.", 500);
  }

  // Os trechos saem junto pelo `on delete cascade` do schema.
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return erro("Não foi possível apagar o documento.", 500);

  return NextResponse.json({ ok: true });
}
