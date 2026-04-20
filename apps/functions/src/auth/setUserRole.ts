import { PAPEIS, type Papel } from '@minha-plataforma/shared';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { exigirAuth, exigirPapel } from '../utils/contextoAuth.js';
import { erroSemPermissao, erroValidacao } from '../utils/erros.js';
import { logger } from '../utils/logger.js';

const zEntrada = z.object({
  uidAlvo: z.string().min(1),
  papel: z.enum(PAPEIS),
});

/**
 * Admin da org altera papel de outro usuário da MESMA org.
 *  - Não permite alterar um admin que não seja o próprio (proteção mínima contra escalação).
 *  - Não permite mudar para/de papéis fora do orgId do chamador.
 */
export const setUserRole = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const ctx = exigirAuth(request);
    exigirPapel(ctx, ['admin']);

    const parsed = zEntrada.safeParse(request.data);
    if (!parsed.success) throw erroValidacao(parsed.error.flatten());
    const { uidAlvo, papel } = parsed.data;

    const auth = getAuth();
    const alvo = await auth.getUser(uidAlvo);
    const claimsAtuais = (alvo.customClaims ?? {}) as { orgId?: string; role?: Papel };

    if (claimsAtuais.orgId !== ctx.orgId) throw erroSemPermissao('Usuário não pertence à sua organização');

    // Proteção: admin não pode rebaixar outro admin. Transferência de admin deve ser processo explícito.
    if (claimsAtuais.role === 'admin' && ctx.uid !== uidAlvo) {
      throw erroSemPermissao('Admin não pode alterar outro admin');
    }

    await auth.setCustomUserClaims(uidAlvo, { orgId: ctx.orgId, role: papel });

    const db = getFirestore();
    const agora = FieldValue.serverTimestamp();
    await Promise.all([
      db.doc(`organizacoes/${ctx.orgId}/usuarios/${uidAlvo}`).update({ papel, atualizadoEm: agora }),
      db.collection(`organizacoes/${ctx.orgId}/auditoria`).add({
        atorId: ctx.uid,
        atorPapel: ctx.papel,
        acao: 'usuario.alterar_papel',
        recurso: `usuarios/${uidAlvo}`,
        antes: { papel: claimsAtuais.role ?? null },
        depois: { papel },
        em: agora,
      }),
    ]);

    logger.info('Papel alterado', { orgId: ctx.orgId, alvo: uidAlvo, novoPapel: papel });
    return { ok: true, papel };
  },
);
