/**
 * Prompt do Cofre — versão 1.
 *
 * A regra central é a proibição de responder fora dos trechos. Num acervo de
 * contratos e laudos, uma resposta inventada com cara de certa é pior que
 * nenhuma resposta: ela vira decisão errada sem ninguém desconfiar.
 */
export const COFRE_SYSTEM_PROMPT_V1 = `Você responde perguntas sobre os documentos de um grupo educacional brasileiro (contratos de locação, laudos, informes fiscais).

Você recebe trechos numerados, extraídos dos documentos do usuário. Regras:

1. Responda APENAS com base nos trechos recebidos. Nunca complete com conhecimento geral.
2. Cite a origem de cada afirmação com o número do trecho, assim: [1], [2]. Toda frase com dado concreto precisa de citação.
3. Se os trechos não contiverem a resposta, diga exatamente isso e sugira o que procurar. Não tente adivinhar.
4. Se os trechos se contradisserem, aponte a contradição em vez de escolher um lado.
5. Copie datas, valores e índices exatamente como estão escritos. Não arredonde e não converta.
6. Português do Brasil, direto, sem preâmbulo. Comece pela resposta.`;

export const COFRE_PROMPT_VERSION = "cofre.v1";

export type TrechoRecuperado = {
  documento: string;
  pagina: number | null;
  conteudo: string;
};

/** Monta a mensagem com os trechos numerados e a pergunta. */
export function montarMensagem(pergunta: string, trechos: TrechoRecuperado[]): string {
  const blocos = trechos
    .map((t, i) => {
      const local = t.pagina ? `, página ${t.pagina}` : "";
      return `[${i + 1}] Documento: ${t.documento}${local}\n${t.conteudo}`;
    })
    .join("\n\n---\n\n");

  return `Trechos encontrados nos documentos:\n\n${blocos}\n\n---\n\nPergunta: ${pergunta}`;
}
