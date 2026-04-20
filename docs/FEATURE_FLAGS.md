# Feature Flags

## Por que

Toda feature nova entra desligada atrás de flag. Ativamos gradualmente.
Se quebrar, kill-switch global desliga em menos de 60s, sem deploy.

## Estrutura

- `organizacoes/{orgId}/featureFlags/{nome}` — flag per-org
- `flagsGlobais/{nome}` — kill-switch; se `ativo=false`, desliga para todo mundo

Ambas seguem `FeatureFlag` em `packages/shared/src/schemas/featureFlag.ts`.

## Nome

Padrão `area.nomeDaFeature`. Exemplos:
- `ia.chatTutor`
- `ia.configuradorConversacional`
- `proctoring.trocaAba`
- `relatorios.radarHabilidades`

Validado pelo `zNomeFlag`.

## Rollout gradual

`rolloutPct` 0–100. Bucket determinístico por `FNV-1a(nome:uid) % 100`:
usuário X sempre cai no mesmo bucket para a mesma flag. Isso elimina "flicker"
entre sessões.

Promoção típica:
```
0%  (dev, só quem está na audiência.usuariosIds)
→ 10% (beta interno)
→ 50% (validação)
→ 100% (GA)
```

## Consumo

**Frontend:**
```tsx
import { useFlag } from '@/hooks/useFlag';
const { ativa } = useFlag('ia.chatTutor');
if (ativa) return <ChatTutor />;
```

**Backend (Cloud Functions):**
```ts
import { flagAtivaServer } from '@minha-plataforma/feature-flags/server';
if (!(await flagAtivaServer(adaptador, orgId, 'ia.chatTutor', ctx))) {
  throw erroFlagDesligada('ia.chatTutor');
}
```

## Retirada

Quando a flag estiver em 100% por pelo menos 2 semanas sem incidentes:
1. Remover os branches `if` do código.
2. Deletar a flag de `flagsGlobais` e de todas as orgs (script de migração).
3. Registrar a remoção no ADR correspondente.
