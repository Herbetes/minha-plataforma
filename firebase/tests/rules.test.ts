import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'rules-teste';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function clientePara(uid: string | null, orgId?: string, role?: string) {
  if (uid === null) return env.unauthenticatedContext().firestore();
  const claims: Record<string, unknown> = {};
  if (orgId) claims.orgId = orgId;
  if (role) claims.role = role;
  return env.authenticatedContext(uid, claims).firestore();
}

describe('Firestore rules — tenant isolation', () => {
  it('anônimo não lê documento de org', async () => {
    const db = clientePara(null);
    await assertFails(getDoc(doc(db, 'organizacoes/orgA')));
  });

  it('usuário da orgA não lê documento da orgB', async () => {
    // Seed via admin (bypass rules)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizacoes/orgB'), { nome: 'B' });
    });

    const dbA = clientePara('userA', 'orgA', 'admin');
    await assertFails(getDoc(doc(dbA, 'organizacoes/orgB')));
  });

  it('usuário da orgA lê o documento da própria orgA', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizacoes/orgA'), { nome: 'A' });
    });

    const dbA = clientePara('userA', 'orgA', 'aluno');
    await assertSucceeds(getDoc(doc(dbA, 'organizacoes/orgA')));
  });

  it('aluno não lê banco de questões', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizacoes/orgA/questoes/q1'), { enunciado: 'x' });
    });
    const db = clientePara('aluno1', 'orgA', 'aluno');
    await assertFails(getDoc(doc(db, 'organizacoes/orgA/questoes/q1')));
  });

  it('coordenador lê banco de questões da própria org', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizacoes/orgA/questoes/q1'), { enunciado: 'x' });
    });
    const db = clientePara('coord1', 'orgA', 'coordenador');
    await assertSucceeds(getDoc(doc(db, 'organizacoes/orgA/questoes/q1')));
  });

  it('auditoria é imutável: nem admin cria via cliente', async () => {
    const db = clientePara('admin1', 'orgA', 'admin');
    await assertFails(setDoc(doc(db, 'organizacoes/orgA/auditoria/log1'), { acao: 'x' }));
  });

  it('admin NÃO pode editar campos de cap via cliente', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizacoes/orgA'), {
        nome: 'A',
        capsCustoIAMesUSD: 100,
        consumoAcumuladoMesUSD: 0,
      });
    });
    const db = clientePara('admin1', 'orgA', 'admin');
    await assertFails(setDoc(doc(db, 'organizacoes/orgA'), { capsCustoIAMesUSD: 9999 }, { merge: true }));
  });

  it('aluno só lê o próprio resultado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizacoes/orgA/resultados/r1'), {
        alunoId: 'outroAluno',
        simuladoId: 's1',
      });
    });
    const db = clientePara('aluno1', 'orgA', 'aluno');
    await assertFails(getDoc(doc(db, 'organizacoes/orgA/resultados/r1')));
  });

  it('aluno lê o próprio resultado', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'organizacoes/orgA/resultados/r1'), {
        alunoId: 'aluno1',
        simuladoId: 's1',
      });
    });
    const db = clientePara('aluno1', 'orgA', 'aluno');
    await assertSucceeds(getDoc(doc(db, 'organizacoes/orgA/resultados/r1')));
  });

  it('llmCache é server-only (bloqueia qualquer papel)', async () => {
    const db = clientePara('admin1', 'orgA', 'admin');
    await assertFails(getDoc(doc(db, 'llmCache/deadbeef')));
    await assertFails(setDoc(doc(db, 'llmCache/deadbeef'), { valor: 1 }));
  });
});
