import type { Papel } from '@minha-plataforma/shared';
import { onIdTokenChanged, type User } from 'firebase/auth';
import { create } from 'zustand';

import { auth } from './firebase';

interface EstadoSessao {
  carregando: boolean;
  usuario: User | null;
  orgId: string | null;
  papel: Papel | null;
  definir(parcial: Partial<Omit<EstadoSessao, 'definir'>>): void;
}

export const useSessao = create<EstadoSessao>((set) => ({
  carregando: true,
  usuario: null,
  orgId: null,
  papel: null,
  definir: (p) => set(p),
}));

// Sincroniza a sessão com o estado de Auth + claims.
onIdTokenChanged(auth, async (user) => {
  if (!user) {
    useSessao.getState().definir({ carregando: false, usuario: null, orgId: null, papel: null });
    return;
  }
  const token = await user.getIdTokenResult();
  const orgId = (token.claims.orgId as string | undefined) ?? null;
  const papel = (token.claims.role as Papel | undefined) ?? null;
  useSessao.getState().definir({ carregando: false, usuario: user, orgId, papel });
});
