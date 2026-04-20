// Papéis canônicos do sistema. Qualquer mudança aqui exige migração de custom claims.
export const PAPEIS = ['admin', 'coordenador', 'professor', 'corretor', 'aluno', 'responsavel'] as const;

export type Papel = (typeof PAPEIS)[number];

export const PAPEIS_COM_ACESSO_ADMINISTRATIVO: readonly Papel[] = ['admin', 'coordenador'];
export const PAPEIS_DOCENTES: readonly Papel[] = ['professor', 'corretor'];
export const PAPEIS_APRENDIZ: readonly Papel[] = ['aluno'];
export const PAPEIS_EXTERNOS: readonly Papel[] = ['responsavel'];
