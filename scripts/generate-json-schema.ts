// Gera JSON Schema a partir dos schemas Zod do pacote shared.
// O JSON Schema alimenta o "Configurador por IA" (fase 2): o prompt do sistema
// passa o schema para a LLM devolver mudanças já validáveis.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { zConfig, zOrganizacao } from '../packages/shared/src/schemas/organizacao.js';
import { zFeatureFlag } from '../packages/shared/src/schemas/featureFlag.js';

// Conversor Zod → JSON Schema minimalista (evita dep externa).
// Para cobertura completa, trocar por `zod-to-json-schema` em iteração futura.
function descrever(nome: string, tipo: string): object {
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', title: nome, type: tipo };
}

const saidaDir = resolve(process.cwd(), 'schema');
mkdirSync(saidaDir, { recursive: true });

writeFileSync(resolve(saidaDir, 'organizacao.json'), JSON.stringify(descrever('Organizacao', 'object'), null, 2));
writeFileSync(resolve(saidaDir, 'config.json'), JSON.stringify(descrever('Config', 'object'), null, 2));
writeFileSync(resolve(saidaDir, 'featureFlag.json'), JSON.stringify(descrever('FeatureFlag', 'object'), null, 2));

console.log('[schema] placeholders escritos em /schema/. Substituir por `zod-to-json-schema` na fase 2.');
void zOrganizacao;
void zConfig;
void zFeatureFlag;
