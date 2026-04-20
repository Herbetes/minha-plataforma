# ADR 0001 — Stack escolhida

**Status:** aceito
**Data:** 2026-04-20

## Contexto

Precisamos de uma stack que suporte multi-tenancy, tempo real, baixo overhead
operacional e rápida entrega. Time reduzido, sem infra dedicada.

## Decisão

- Frontend: React 18 + Vite + TS strict + TanStack Query + shadcn/ui + Tailwind
- Backend: Firebase (Auth, Firestore, Functions v2 em Node 20, Storage, Hosting)
- Monorepo: pnpm workspaces
- Testes: Vitest + `@firebase/rules-unit-testing` + Playwright
- CI: GitHub Actions

## Consequências

- Tudo serverless → escala sem ops, mas lock-in no Firebase.
- Firestore não roda queries arbitrárias → modelagem precisa prever acessos.
- Cloud Functions v2 em `southamerica-east1` dá latência OK para Brasil.
- Migração para outro provedor exige reescrever regras + substituir Firestore
  por Postgres. Aceitável dado o ganho de time-to-market.

## Alternativas descartadas

- Supabase: mais SQL-friendly, mas policies são mais verbosas e integração com
  SSO corporativo Microsoft é menos madura.
- AWS Amplify: deploy mais complexo, UI menos completa que Firebase Console.
