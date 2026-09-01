import { NextResponse } from "next/server";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { contratoSchema } from "@/lib/vh";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("user_id", user.id)
    .order("locatario");

  if (error) return erro("Não foi possível listar os contratos.", 500);
  return NextResponse.json({ contratos: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const parsed = contratoSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const c = parsed.data;
  const { data, error } = await supabase
    .from("contracts")
    .insert({
      user_id: user.id,
      imovel: c.imovel,
      locatario: c.locatario,
      documento: c.documento ?? null,
      valor_centavos: c.valorCentavos,
      dia_vencimento: c.diaVencimento ?? null,
      indice_reajuste: c.indiceReajuste ?? null,
      mes_reajuste: c.mesReajuste ?? null,
      vigencia_inicio: c.vigenciaInicio || null,
      vigencia_fim: c.vigenciaFim || null,
      ativo: c.ativo ?? true,
      observacoes: c.observacoes ?? null,
      account_id: c.contaId ?? null,
      padroes: c.padroes ?? [],
      apelidos: c.apelidos ?? [],
      condominio_centavos: c.condominioCentavos ?? null,
      iptu_centavos: c.iptuCentavos ?? null,
      tipo_imovel: c.tipoImovel ?? null,
      garantia: c.garantia ?? null,
    })
    .select("*")
    .single();

  if (error || !data) return erro("Não foi possível criar o contrato.", 500);
  return NextResponse.json({ contrato: data });
}
