import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { contratoSchema } from "@/lib/vh";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;
  const parsed = contratoSchema.partial().safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const c = parsed.data;
  const campos: Record<string, unknown> = {};
  if (c.imovel !== undefined) campos.imovel = c.imovel;
  if (c.locatario !== undefined) campos.locatario = c.locatario;
  if (c.documento !== undefined) campos.documento = c.documento ?? null;
  if (c.valorCentavos !== undefined) campos.valor_centavos = c.valorCentavos;
  if (c.diaVencimento !== undefined) campos.dia_vencimento = c.diaVencimento ?? null;
  if (c.indiceReajuste !== undefined) campos.indice_reajuste = c.indiceReajuste ?? null;
  if (c.mesReajuste !== undefined) campos.mes_reajuste = c.mesReajuste ?? null;
  if (c.vigenciaInicio !== undefined) campos.vigencia_inicio = c.vigenciaInicio || null;
  if (c.vigenciaFim !== undefined) campos.vigencia_fim = c.vigenciaFim || null;
  if (c.ativo !== undefined) campos.ativo = c.ativo;
  if (c.observacoes !== undefined) campos.observacoes = c.observacoes ?? null;
  if (c.contaId !== undefined) campos.account_id = c.contaId ?? null;
  if (c.padroes !== undefined) campos.padroes = c.padroes ?? [];
  if (c.tipoImovel !== undefined) campos.tipo_imovel = c.tipoImovel ?? null;
  if (c.garantia !== undefined) campos.garantia = c.garantia ?? null;

  const { data, error } = await supabase
    .from("contracts")
    .update(campos)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return erro("Não foi possível salvar o contrato.", 500);
  if (!data) return erro("Contrato não encontrado.", 404);
  return NextResponse.json({ contrato: data });
}

export async function DELETE(_request: Request, { params }: Contexto) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { id } = await params;
  const { data, error } = await supabase
    .from("contracts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return erro("Não foi possível apagar o contrato.", 500);
  if (!data) return erro("Contrato não encontrado.", 404);
  return NextResponse.json({ ok: true });
}
