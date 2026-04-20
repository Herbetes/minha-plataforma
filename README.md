# minha-plataforma

Plataforma SaaS white-label de simulados educacionais com IA. Multi-tenant,
testável, orientada a segurança. Ver `docs/PRODUCT_BRIEF.md` para a visão
completa.

> **Status:** bootstrap da Fase 1 (MVP). As 4 fases do roadmap estão em `docs/PRODUCT_BRIEF.md`.

## Estrutura

```
apps/
  web/           React 18 + Vite + TS (frontend)
  functions/     Cloud Functions v2 Node 20 (backend)
packages/
  shared/        Tipos + schemas Zod do domínio (fonte única de verdade)
  feature-flags/ SDK de feature flags (client + server)
  config/        Presets eslint/tsconfig/tailwind
firebase/        Regras Firestore/Storage + testes (rules-unit-testing)
scripts/         Seed, geração de JSON Schema, templates
docs/            PRODUCT_BRIEF, SECURITY, FEATURE_FLAGS, AI_COST_CONTROL, ADRs
.github/         CI (lint + typecheck + test + rules + build), deploy staging/prod
```

## Requisitos

- Node 20.10+ (ver `.nvmrc`)
- pnpm 9.12+
- Firebase CLI (`npm i -g firebase-tools`)
- Java 17+ (Firebase Emulator Suite exige)

## Setup local

```bash
pnpm install
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local

# Sobe emuladores de Auth, Firestore, Functions, Storage
pnpm emulators

# Em outro terminal: roda o frontend apontando para os emuladores
pnpm dev

# Seed opcional de dados demo (exige emulador rodando):
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm seed
```

## Scripts principais

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Frontend em modo dev |
| `pnpm emulators` | Emulator Suite (Auth/Firestore/Functions/Storage) |
| `pnpm build` | Build de todos os apps/pacotes |
| `pnpm typecheck` | Typecheck recursivo |
| `pnpm test` | Unit tests em todos os pacotes |
| `pnpm test:rules` | Testes de Firestore Rules (requer emulator) |
| `pnpm seed` | Popula emulator com templates + org demo |
| `pnpm format:check` | Valida formatação com Prettier |

## Segurança

Ver `docs/SECURITY.md`. Pontos-chave:

- Nenhuma chave de LLM no frontend — Cloud Functions roteiam tudo.
- Firestore Rules bloqueiam por padrão; teste de tenant-isolation no CI.
- Hard-cap de custo por org (ver `docs/AI_COST_CONTROL.md`).
- CSP/HSTS configurados em `firebase.json`.

## Deploy

Staging via label `deploy-staging` em PR. Produção em merge para `main`.
Requer `FIREBASE_TOKEN` no secret do repositório e projects mapeados em
`.firebaserc`.

## Contribuindo

1. Crie uma branch a partir de `main`.
2. Toda feature nova entra desligada atrás de flag (ver `docs/FEATURE_FLAGS.md`).
3. Adicione tipo/schema em `packages/shared` **antes** do código que usa.
4. Abra PR seguindo o template.
5. CI precisa passar (lint, typecheck, test, rules, build).

## Licença

Privado / proprietário.
