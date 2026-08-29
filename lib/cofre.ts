import { z } from "zod";

/**
 * Lógica pura do Cofre: partir documentos em trechos e montar a consulta de
 * busca. Sem rede, sem banco — é o que dá para testar em milissegundos, e é
 * onde moram os erros que realmente estragam a resposta.
 */

/** Tamanho alvo de um trecho, em caracteres. */
export const MAX_TRECHO = 1400;

/** Sobreposição entre trechos vizinhos, para não cortar uma frase ao meio. */
export const SOBREPOSICAO = 200;

/** Máximo de trechos entregues ao modelo numa pergunta. */
export const TRECHOS_POR_PERGUNTA = 8;

export const perguntaSchema = z.object({
  pergunta: z.string().trim().min(3, "Pergunta muito curta").max(1000),
});

export const registrarDocumentoSchema = z.object({
  storagePath: z.string().trim().min(1),
  title: z.string().trim().min(1).max(300),
  bytes: z.number().int().nonnegative().optional(),
});

export type Trecho = { ordinal: number; content: string };

/**
 * Palavras que não ajudam a discriminar nada num contrato. O Postgres já
 * remove boa parte, mas termos vazios na consulta pioram o ranqueamento.
 */
const VAZIAS = new Set([
  "que", "qual", "quais", "quando", "onde", "como", "para", "por", "com", "sem",
  "dos", "das", "nos", "nas", "pelo", "pela", "num", "numa", "este", "esta",
  "esse", "essa", "aquele", "aquela", "isso", "meu", "minha", "seu", "sua",
  "está", "estao", "estão", "ser", "sao", "são", "foi", "tem", "ter", "mais",
  "menos", "muito", "todo", "toda", "todos", "todas", "ele", "ela", "eles",
  "elas", "voce", "você", "aqui", "ali", "sobre", "entre", "ate", "até",
]);

/**
 * Transforma a pergunta em uma consulta que o Postgres entende.
 *
 * Une os termos com OU, não com E. Uma pergunta inteira ligada por E quase
 * nunca casa com um parágrafo real de contrato — o resultado seria vazio
 * justamente nas perguntas mais específicas.
 *
 * Só deixa passar letras e números: os operadores do `to_tsquery`
 * (& | ! : * parênteses) nunca chegam ao banco vindos do texto do usuário.
 */
export function montarConsulta(pergunta: string): string | null {
  const termos = pergunta
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !VAZIAS.has(t));

  const unicos = [...new Set(termos)];
  if (unicos.length === 0) return null;

  return unicos.slice(0, 20).join(" | ");
}

/** Início de cláusula, item numerado ou parágrafo — onde faz sentido cortar. */
const INICIO_DE_CLAUSULA =
  /^\s*(cl[áa]usula\b|par[áa]grafo\b|§|art\.?\s*\d|\d{1,2}(\.\d{1,2})*\s*[-–.)]\s+)/i;

function normalizar(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Quebra um bloco grande demais em pedaços com sobreposição, preferindo cortar
 * no fim de uma frase.
 */
function partirBlocoLongo(bloco: string): string[] {
  const pedacos: string[] = [];
  let inicio = 0;

  while (inicio < bloco.length) {
    let fim = Math.min(inicio + MAX_TRECHO, bloco.length);

    if (fim < bloco.length) {
      const janela = bloco.slice(inicio, fim);
      const ponto = Math.max(
        janela.lastIndexOf(". "),
        janela.lastIndexOf(";\n"),
        janela.lastIndexOf("\n"),
      );
      if (ponto > MAX_TRECHO * 0.5) fim = inicio + ponto + 1;
    }

    pedacos.push(bloco.slice(inicio, fim).trim());
    if (fim >= bloco.length) break;
    inicio = Math.max(fim - SOBREPOSICAO, inicio + 1);
  }

  return pedacos.filter((p) => p.length > 0);
}

/**
 * Divide o texto do documento em trechos pesquisáveis.
 *
 * Corta primeiro por estrutura (cláusula, parágrafo, item numerado) e só
 * depois por tamanho. Cortar só por tamanho parte a cláusula no meio, e aí
 * nem a busca acha nem o modelo consegue responder direito.
 */
export function dividirEmTrechos(texto: string): Trecho[] {
  const limpo = normalizar(texto);
  if (limpo.length === 0) return [];

  // 1. Agrupa as linhas em blocos, abrindo um bloco novo a cada cláusula.
  const blocos: string[] = [];
  let atual: string[] = [];

  for (const linha of limpo.split("\n")) {
    if (INICIO_DE_CLAUSULA.test(linha) && atual.join("\n").trim().length > 0) {
      blocos.push(atual.join("\n").trim());
      atual = [];
    }
    atual.push(linha);
  }
  if (atual.join("\n").trim().length > 0) blocos.push(atual.join("\n").trim());

  // 2. Junta blocos pequenos e parte os grandes.
  const trechos: string[] = [];
  let acumulado = "";

  for (const bloco of blocos) {
    if (bloco.length > MAX_TRECHO) {
      if (acumulado.trim()) {
        trechos.push(acumulado.trim());
        acumulado = "";
      }
      trechos.push(...partirBlocoLongo(bloco));
      continue;
    }

    if (acumulado.length + bloco.length + 2 > MAX_TRECHO) {
      if (acumulado.trim()) trechos.push(acumulado.trim());
      acumulado = bloco;
    } else {
      acumulado = acumulado ? `${acumulado}\n\n${bloco}` : bloco;
    }
  }
  if (acumulado.trim()) trechos.push(acumulado.trim());

  return trechos
    .filter((c) => c.trim().length > 0)
    .map((content, i) => ({ ordinal: i, content }));
}

/**
 * Caminho do arquivo no Storage. A pasta é o id do usuário — é isso que as
 * políticas do Storage conferem para impedir que um alcance o arquivo do outro.
 */
export function caminhoStorage(userId: string, nomeArquivo: string): string {
  const seguro = nomeArquivo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")       // tira acentos
    .replace(/[^a-zA-Z0-9.\-_]/g, "_")     // só caracteres seguros
    .replace(/\.{2,}/g, ".")               // colapsa ".." — nada de subir de pasta
    .replace(/^[.\-_]+/, "")               // não começa com ponto/traço
    .slice(-120) || "arquivo";

  return `${userId}/${Date.now()}-${seguro}`;
}
