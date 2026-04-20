// Log estruturado JSON com correlação por requestId.
// Cloud Logging do GCP ingere automaticamente JSON escrito no stdout.

type Nivel = 'debug' | 'info' | 'warn' | 'error';

interface Contexto {
  requestId?: string;
  uid?: string;
  orgId?: string;
  [k: string]: unknown;
}

const CAMPOS_PII = ['cpf', 'rg', 'telefone', 'endereco', 'cep', 'senha', 'password'];

function redigirPII(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redigirPII);
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (CAMPOS_PII.includes(k.toLowerCase())) {
      saida[k] = '[REDIGIDO]';
    } else {
      saida[k] = redigirPII(v);
    }
  }
  return saida;
}

function emitir(nivel: Nivel, mensagem: string, ctx?: Contexto): void {
  const linha = JSON.stringify({
    severity: nivel.toUpperCase(),
    message: mensagem,
    ...(ctx ? (redigirPII(ctx) as object) : {}),
    timestamp: new Date().toISOString(),
  });
  if (nivel === 'error') process.stderr.write(`${linha}\n`);
  else process.stdout.write(`${linha}\n`);
}

export const logger = {
  debug: (m: string, ctx?: Contexto) => emitir('debug', m, ctx),
  info: (m: string, ctx?: Contexto) => emitir('info', m, ctx),
  warn: (m: string, ctx?: Contexto) => emitir('warn', m, ctx),
  error: (m: string, ctx?: Contexto) => emitir('error', m, ctx),
};
