# ADR 0003 — Feature flags em Firestore

**Status:** aceito
**Data:** 2026-04-20

## Contexto

Queremos flipar features em produção sem deploy, com rollout gradual e
kill-switch global.

## Decisão

- Flags vivem em `organizacoes/{id}/featureFlags/{nome}` (per-org) e
  `flagsGlobais/{nome}` (kill-switch).
- SDK em `@minha-plataforma/feature-flags` implementa avaliação determinística.
- Frontend lê via `useFlag`; backend via `flagAtivaServer` com cache in-memory
  de 30 s por instância.

## Consequências

- Desligar uma feature global toma menos de 60 s (TTL do cache).
- Rollout gradual é determinístico (mesmo usuário cai sempre no mesmo bucket).
- Não depende de vendor externo (LaunchDarkly, Split). Custo operacional baixo.
- Auditoria de alteração de flag registrada em `auditoria/`.

## Alternativas descartadas

- LaunchDarkly: melhor UX mas caro para MVP e latência extra.
- Variáveis de ambiente: exigem redeploy — inaceitável.
