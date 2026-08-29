import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { dividirEmTrechos, registrarDocumentoSchema } from "@/lib/cofre";

export const runtime = "nodejs";
/** Extrair e indexar um contrato longo pode passar bem dos 10s padrão. */
export const maxDuration = 120;

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Registra e processa um documento já enviado ao Storage pelo navegador.
 *
 * O arquivo não passa por esta rota: o navegador envia direto ao Storage
 * (respeitando as políticas do bucket) e aqui só chega o caminho. Isso evita
 * o limite de tamanho de corpo das funções serverless, que reprovaria PDFs
 * grandes justamente os de contrato escaneado.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return bad("Faça login para enviar documentos.", 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return bad("Corpo da requisição não é JSON válido.", 400);
  }

  const parsed = registrarDocumentoSchema.safeParse(raw);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message ?? "Requisição inválida.", 400);
  }

  const { storagePath, title, bytes } = parsed.data;

  // O caminho tem que estar dentro da pasta do próprio usuário. As políticas do
  // Storage já garantem isso; conferir aqui evita registrar uma linha órfã
  // apontando para um arquivo que a pessoa não pode ler.
  if (!storagePath.startsWith(`${user.id}/`)) {
    return bad("Caminho de arquivo não pertence a você.", 403);
  }

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      title,
      storage_path: storagePath,
      bytes: bytes ?? null,
      status: "processando",
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return bad("Não foi possível registrar o documento.", 500);
  }

  const documentId = doc.id as string;

  /** Marca o documento como falho, com um motivo que a tela sabe mostrar. */
  async function falhar(motivo: string, status: number) {
    await supabase
      .from("documents")
      .update({ status: "erro", error: motivo })
      .eq("id", documentId);
    return bad(motivo, status);
  }

  try {
    const { data: arquivo, error: downloadError } = await supabase.storage
      .from("documentos")
      .download(storagePath);

    if (downloadError || !arquivo) {
      return falhar("Arquivo não encontrado no armazenamento.", 404);
    }

    const pdf = await getDocumentProxy(new Uint8Array(await arquivo.arrayBuffer()));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });

    const trechos = dividirEmTrechos(text);

    if (trechos.length === 0) {
      return falhar(
        "Não foi possível ler texto neste PDF. Provavelmente é um documento " +
          "escaneado (uma foto do papel). Por enquanto o Cofre só lê PDFs com " +
          "texto selecionável.",
        422,
      );
    }

    const { error: chunksError } = await supabase.from("chunks").insert(
      trechos.map((t) => ({
        document_id: documentId,
        user_id: user.id,
        ordinal: t.ordinal,
        content: t.content,
      })),
    );

    if (chunksError) return falhar("Falha ao indexar os trechos.", 500);

    await supabase
      .from("documents")
      .update({
        status: "pronto",
        pages: totalPages,
        chunk_count: trechos.length,
        error: null,
      })
      .eq("id", documentId);

    return NextResponse.json({
      id: documentId,
      title,
      pages: totalPages,
      trechos: trechos.length,
    });
  } catch (error) {
    console.error("[api/documentos] falha ao processar", error);
    return falhar("Não foi possível ler este arquivo. Ele é mesmo um PDF?", 500);
  }
}
