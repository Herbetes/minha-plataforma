# ADR 0002 — Multi-tenancy via custom claims

**Status:** aceito
**Data:** 2026-04-20

## Contexto

Precisamos garantir isolamento total entre orgs, incluindo em tempo de leitura
direta do Firestore pelo cliente.

## Decisão

- Cada usuário autenticado carrega `{ orgId, role }` como custom claim do Firebase Auth.
- Firestore Rules validam `request.auth.token.orgId == orgId` do documento em toda leitura/escrita.
- Custom claims são setados exclusivamente por Cloud Functions com o Admin SDK
  (`onUserCreate`, `setUserRole`, `acceptInvite`).

## Consequências

- Cliente nunca consegue montar queries cross-org; tentativas falham nas rules.
- Mudança de claim exige novo ID token (`getIdToken(true)`). O frontend detecta
  via `onIdTokenChanged` e recarrega.
- Testes em `firebase/tests/rules.test.ts` cobrem os casos críticos.
- Admin da org jamais consegue acessar dados de outra org, mesmo com ID conhecido.

## Alternativas descartadas

- `orgId` em path sem validação de claim → vulnerável a IDOR.
- `orgId` no documento do usuário + rules validando contra ele → requer leitura
  adicional a cada request (mais caro e com risco de staleness).
