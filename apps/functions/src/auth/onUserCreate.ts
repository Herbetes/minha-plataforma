// Trigger de criação de usuário no Auth (provisioning inicial).
//
// Comportamento:
//  - Se o email corresponde a um convite pendente em /convites/{email}, usa os claims do convite.
//  - Caso contrário, cria uma nova org em modo trial e torna o usuário admin dela (self-serve).
//
// Atenção: custom claims só entram no próximo token. O frontend precisa chamar
// `auth.currentUser.getIdToken(true)` após detectar orgId no documento do usuário.

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { beforeUserCreated } from 'firebase-functions/v2/identity';
import { auth } from 'firebase-functions/v1';

import { logger } from '../utils/logger.js';

const PLANO_TRIAL = 'trial' as const;
const CAP_USD_TRIAL = 20;

export const onUserCreate = auth.user().onCreate(async (user) => {
  const db = getFirestore();
  const uid = user.uid;
  const email = user.email ?? '';

  try {
    // 1. Convite?
    if (email) {
      const refConvite = db.collection('convites').doc(email.toLowerCase());
      const conviteSnap = await refConvite.get();
      if (conviteSnap.exists) {
        const convite = conviteSnap.data() as { orgId: string; papel: string };
        await Promise.all([
          getAuth().setCustomUserClaims(uid, { orgId: convite.orgId, role: convite.papel }),
          db.collection('organizacoes').doc(convite.orgId).collection('usuarios').doc(uid).set({
            nome: user.displayName ?? '',
            email,
            papel: convite.papel,
            turmaIds: [],
            camposCustom: {},
            criadoEm: FieldValue.serverTimestamp(),
            atualizadoEm: FieldValue.serverTimestamp(),
          }),
          refConvite.delete(),
        ]);
        logger.info('Usuário criado via convite', { uid, orgId: convite.orgId, papel: convite.papel });
        return;
      }
    }

    // 2. Self-serve: cria org em trial.
    const refOrg = db.collection('organizacoes').doc();
    const orgId = refOrg.id;
    const agora = FieldValue.serverTimestamp();

    await db.runTransaction(async (tx) => {
      tx.set(refOrg, {
        nome: user.displayName ? `${user.displayName} (trial)` : 'Minha organização',
        plano: PLANO_TRIAL,
        branding: {
          nome: 'Minha organização',
          corPrimaria: '#00796b',
          corSecundaria: '#ff6f00',
        },
        config: { versao: 0, idioma: 'pt-BR', disciplinas: [], camposCustomUsuario: [] },
        capsCustoIAMesUSD: CAP_USD_TRIAL,
        consumoAcumuladoMesUSD: 0,
        statusCap: 'saudavel',
        mesReferencia: new Date().toISOString().slice(0, 7),
        criadoEm: agora,
        atualizadoEm: agora,
      });
      tx.set(refOrg.collection('usuarios').doc(uid), {
        nome: user.displayName ?? email.split('@')[0] ?? 'Admin',
        email,
        papel: 'admin',
        turmaIds: [],
        camposCustom: {},
        criadoEm: agora,
        atualizadoEm: agora,
      });
    });

    await getAuth().setCustomUserClaims(uid, { orgId, role: 'admin' });
    logger.info('Org criada em trial para novo usuário', { uid, orgId });
  } catch (e) {
    logger.error('Falha em onUserCreate', { uid, erro: String(e) });
    throw e;
  }
});

// Exportado só para habilitar uso futuro de beforeUserCreated (bloqueio de domínios, etc).
export const _beforeUserCreatedStub = beforeUserCreated;
