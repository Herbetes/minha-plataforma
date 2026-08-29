import { z } from "zod";

/** Lógica pura das pastas: validação e normalização de nome. */

export const MAX_NOME_PASTA = 60;

/**
 * Normaliza o nome antes de gravar.
 *
 * Espaço sobrando é invisível na tela mas cria pastas diferentes no banco:
 * "VH " e "VH" pareceriam a mesma coisa e não seriam.
 */
export function normalizarNomePasta(nome: string): string {
  return nome.replace(/\s+/g, " ").trim();
}

const nomeBase = z
  .string()
  .transform(normalizarNomePasta)
  .refine((n) => n.length >= 1, { message: "O nome da pasta não pode ficar vazio." })
  .refine((n) => n.length <= MAX_NOME_PASTA, {
    message: `O nome da pasta pode ter no máximo ${MAX_NOME_PASTA} caracteres.`,
  });

export const criarPastaSchema = z.object({ nome: nomeBase });
export const renomearPastaSchema = z.object({ nome: nomeBase });

/** `null` move o documento para fora de qualquer pasta ("Sem pasta"). */
export const moverDocumentoSchema = z.object({
  pastaId: z.uuid().nullable(),
});

export const perguntaComPastaSchema = z.object({
  pergunta: z.string().trim().min(3, "Pergunta muito curta").max(1000),
  pastaId: z.uuid().nullable().optional(),
  /** true procura só nos documentos que ainda não foram arquivados. */
  semPasta: z.boolean().optional(),
});

/**
 * Duas pastas com o mesmo nome confundem mais do que ajudam, e "VH" e "vh" são
 * a mesma pasta para quem usa. O banco tem um índice único equivalente; isto
 * aqui é para avisar antes, com mensagem melhor que erro de constraint.
 */
export function nomeJaExiste(nome: string, existentes: string[]): boolean {
  const alvo = normalizarNomePasta(nome).toLowerCase();
  return existentes.some((e) => normalizarNomePasta(e).toLowerCase() === alvo);
}
