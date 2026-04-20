import { avaliarFlag, type ContextoAvaliacao } from '@minha-plataforma/feature-flags';
import type { FeatureFlag, NomeFlag } from '@minha-plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { useSessao } from '../lib/sessao';

async function buscarFlag(caminho: string): Promise<FeatureFlag | null> {
  const snap = await getDoc(doc(db, caminho));
  return snap.exists() ? (snap.data() as FeatureFlag) : null;
}

/**
 * Consulta uma feature flag para o usuário atual.
 * Flag global (flagsGlobais/{nome}) atua como kill-switch sobre a per-org.
 */
export function useFlag(nome: NomeFlag): { carregando: boolean; ativa: boolean } {
  const { orgId, papel, usuario } = useSessao();
  const habilitado = Boolean(orgId && papel && usuario);

  const { data, isLoading } = useQuery({
    queryKey: ['flag', orgId, nome],
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async () => {
      const [perOrg, global] = await Promise.all([
        buscarFlag(`organizacoes/${orgId}/featureFlags/${nome}`),
        buscarFlag(`flagsGlobais/${nome}`),
      ]);
      return { perOrg, global };
    },
  });

  if (!habilitado || isLoading || !data) {
    return { carregando: true, ativa: false };
  }

  const ctx: ContextoAvaliacao = { uid: usuario!.uid, papel: papel! };
  const { ativa } = avaliarFlag(data.perOrg, data.global, ctx);
  return { carregando: false, ativa };
}
