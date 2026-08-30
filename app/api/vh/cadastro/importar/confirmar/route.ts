import { NextResponse } from "next/server";
import { z } from "zod";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { normalizar } from "@/lib/vh-planilha";

export const runtime = "nodejs";
export const maxDuration = 60;

const linhaSchema = z.object({
  imovel: z.string().trim().min(1).max(200),
  locatario: z.string().trim().min(1).max(200),
  documento: z.string().trim().max(30).nullable().optional(),
  valorCentavos: z.number().int().positive(),
  diaVencimento: z.number().int().min(1).max(31).nullable().optional(),
  indiceReajuste: z.string().trim().max(30).nullable().optional(),
  mesReajuste: z.number().int().min(1).max(12).nullable().optional(),
  vigenciaInicio: z.string().trim().nullable().optional(),
  vigenciaFim: z.string().trim().nullable().optional(),
  tipoImovel: z.string().trim().max(40).nullable().optional(),
  garantia: z.string().trim().max(200).nullable().optional(),
  contaApelido: z.string().trim().max(40).nullable().optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(),
});

const corpoSchema = z.object({
  contratos: z.array(linhaSchema).min(1, "Nenhum contrato selecionado.").max(300),
});

/**
 * Grava os contratos que você conferiu na tela.
 *
 * Imóvel que já existe é PULADO, não sobrescrito. Reimportar a planilha é uma
 * coisa que vai acontecer — por engano, ou porque a pessoa quer conferir — e a
 * segunda importação não pode duplicar o cadastro nem apagar uma correção
 * feita à mão na plataforma.
 */
export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const parsed = corpoSchema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const [{ data: existentes }, { data: contas }] = await Promise.all([
    supabase.from("contracts").select("imovel").eq("user_id", user.id),
    supabase.from("accounts").select("id, apelido").eq("user_id", user.id),
  ]);

  const jaCadastrados = new Set((existentes ?? []).map((c) => normalizar(c.imovel)));
  const idPorApelido = new Map(
    (contas ?? []).map((c) => [normalizar(c.apelido), String(c.id)] as const),
  );

  const novos = [];
  const pulados: string[] = [];

  for (const c of parsed.data.contratos) {
    if (jaCadastrados.has(normalizar(c.imovel))) {
      pulados.push(c.imovel);
      continue;
    }
    // Duas linhas da planilha para o mesmo imóvel: a segunda também é pulada.
    jaCadastrados.add(normalizar(c.imovel));

    novos.push({
      user_id: user.id,
      imovel: c.imovel,
      locatario: c.locatario,
      documento: c.documento || null,
      valor_centavos: c.valorCentavos,
      dia_vencimento: c.diaVencimento ?? null,
      indice_reajuste: c.indiceReajuste || null,
      mes_reajuste: c.mesReajuste ?? null,
      vigencia_inicio: c.vigenciaInicio || null,
      vigencia_fim: c.vigenciaFim || null,
      ativo: true,
      observacoes: c.observacoes || null,
      account_id: c.contaApelido ? (idPorApelido.get(normalizar(c.contaApelido)) ?? null) : null,
      // O nome do locatário entra como primeiro padrão de pagador: é o palpite
      // certo na maioria dos casos e economiza uma edição por contrato.
      padroes: [c.locatario],
      tipo_imovel: c.tipoImovel || null,
      garantia: c.garantia || null,
    });
  }

  if (novos.length === 0) {
    return NextResponse.json({ importados: 0, pulados, contratos: [] });
  }

  const { data, error } = await supabase.from("contracts").insert(novos).select("id, imovel");
  if (error) return erro("Não foi possível gravar os contratos.", 500);

  return NextResponse.json({ importados: data?.length ?? 0, pulados, contratos: data ?? [] });
}
