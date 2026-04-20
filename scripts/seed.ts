// Seed dos templates globais e de uma organização demo no emulator.
// Uso: pnpm seed  (com emuladores rodando)
//
// Requisitos: FIRESTORE_EMULATOR_HOST apontando para 127.0.0.1:8080.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const usaEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!usaEmulator) {
  console.warn('[seed] FIRESTORE_EMULATOR_HOST não definido — abortando para evitar escrita em produção.');
  process.exit(1);
}

initializeApp({
  projectId: process.env.GCLOUD_PROJECT ?? 'demo-minha-plataforma',
});

const db = getFirestore();

const TEMPLATES = ['enem', 'obm', 'corporativo'];

async function seedTemplates(): Promise<void> {
  for (const id of TEMPLATES) {
    const json = JSON.parse(readFileSync(resolve(__dirname, `templates/${id}.json`), 'utf8'));
    await db.collection('templates').doc(id).set({
      ...json,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    console.log(`[seed] template ${id} ok`);
  }
}

async function seedOrgDemo(): Promise<void> {
  const orgId = 'org_demo';
  await db.collection('organizacoes').doc(orgId).set({
    nome: 'Organização Demo',
    plano: 'trial',
    branding: { nome: 'Demo', corPrimaria: '#00796b', corSecundaria: '#ff6f00' },
    config: JSON.parse(readFileSync(resolve(__dirname, 'templates/obm.json'), 'utf8')).config,
    capsCustoIAMesUSD: 20,
    consumoAcumuladoMesUSD: 0,
    statusCap: 'saudavel',
    mesReferencia: new Date().toISOString().slice(0, 7),
    criadoEm: FieldValue.serverTimestamp(),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  console.log(`[seed] org ${orgId} ok`);
}

async function seedFlags(): Promise<void> {
  const flags = [
    { nome: 'ia.chatTutor', ativo: false, rolloutPct: 0, descricao: 'Chat tutor com IA (Fase 3)' },
    { nome: 'ia.configuradorConversacional', ativo: true, rolloutPct: 10, descricao: 'Configurador por IA (Fase 2)' },
    { nome: 'proctoring.trocaAba', ativo: false, rolloutPct: 0, descricao: 'Detecção de troca de aba (Fase 3)' },
  ];
  for (const f of flags) {
    await db.collection('flagsGlobais').doc(f.nome).set({
      ...f,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
    console.log(`[seed] flag global ${f.nome} ok`);
  }
}

(async () => {
  await seedTemplates();
  await seedOrgDemo();
  await seedFlags();
  console.log('[seed] concluído.');
  process.exit(0);
})().catch((e) => {
  console.error('[seed] falhou', e);
  process.exit(1);
});

// Referência estática para evitar warn de import não-usado em builds futuros.
void cert;
