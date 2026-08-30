import { NextResponse } from "next/server";
import { z } from "zod";
import { erro, exigirUsuario, lerJson } from "@/lib/api";
import { impressaoDigital, lerCSV, lerOFX } from "@/lib/vh";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  nome: z.string().trim().min(1).max(200),
  conteudo: z.string().min(1, "Arquivo vazio").max(4_000_000),
  contaId: z.uuid("Escolha a conta de onde veio este extrato"),
});

export async function POST(request: Request) {
  const { supabase, user } = await exigirUsuario();
  if (!user) return erro("Faça login.", 401);

  const parsed = schema.safeParse(await lerJson(request));
  if (!parsed.success) {
    return erro(parsed.error.issues[0]?.message ?? "Requisição inválida.", 400);
  }

  const { nome, conteudo, contaId } = parsed.data;
  // A conta tem que ser sua. Sem essa checagem, um id chutado gravaria
  // lançamentos apontando para conta de outra pessoa.
  const { data: conta } = await supabase
    .from("accounts")
    .select("id, apelido")
    .eq("id", contaId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conta) return erro("Conta não encontrada.", 404);

  const ehOfx = /\.ofx$/i.test(nome) || /<STMTTRN>/i.test(conteudo);
  const { lancamentos, ignoradas } = ehOfx ? lerOFX(conteudo) : lerCSV(conteudo);

  if (lancamentos.length === 0) {
    return erro(
      "Não reconheci nenhum lançamento neste arquivo. Ele precisa ser CSV com " +
        "colunas de data, histórico e valor, ou um arquivo OFX do banco.",
      422,
    );
  }

  const datas = lancamentos.map((l) => l.data).sort();

  const { data: extrato, error: extratoError } = await supabase
    .from("statements")
    .insert({
      user_id: user.id,
      account_id: contaId,
      conta: conta.apelido as string,
      arquivo_nome: nome,
      origem: ehOfx ? "ofx" : "csv",
      periodo_inicio: datas[0],
      periodo_fim: datas[datas.length - 1],
      total: lancamentos.length,
    })
    .select("id")
    .single();

  if (extratoError || !extrato) return erro("Não foi possível registrar o extrato.", 500);

  // upsert com ignoreDuplicates: reenviar o mesmo extrato não duplica nada.
  // Subir o arquivo duas vezes é acidente comum, e dobraria a receita do mês.
  const { data: inseridos, error: lancError } = await supabase
    .from("transactions")
    .upsert(
      lancamentos.map((l) => ({
        user_id: user.id,
        statement_id: extrato.id,
        account_id: contaId,
        data: l.data,
        historico: l.historico,
        documento: l.documento,
        valor_centavos: l.valorCentavos,
        impressao: impressaoDigital({ ...l, contaId }),
      })),
      { onConflict: "user_id,account_id,impressao", ignoreDuplicates: true },
    )
    .select("id");

  if (lancError) return erro("Não foi possível gravar os lançamentos.", 500);

  const novos = inseridos?.length ?? 0;

  await supabase.from("statements").update({ novos }).eq("id", extrato.id);

  return NextResponse.json({
    extratoId: extrato.id,
    lidos: lancamentos.length,
    novos,
    repetidos: lancamentos.length - novos,
    ignoradas,
  });
}
