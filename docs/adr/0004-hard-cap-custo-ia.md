# ADR 0004 — Hard-cap de custo de IA por organização

**Status:** aceito
**Data:** 2026-04-20

## Contexto

Um bug em loop chamando LLM pode queimar orçamento em minutos. Precisamos
contenção no backend, imune a falhas do cliente.

## Decisão

- `organizacoes/{id}` tem `capsCustoIAMesUSD`, `consumoAcumuladoMesUSD` e
  `statusCap` (`saudavel | aviso70 | aviso90 | bloqueado`).
- Função `verificarCapAntes(orgId)` é chamada no roteador LLM antes de qualquer
  chamada a provider. Se `bloqueado`, erro `CAP_EXCEDIDO`.
- `registrarConsumoIA(orgId, custo)` usa transação Firestore para incrementar
  consumo e atualizar status atomicamente.
- Campos de cap são protegidos por regras Firestore — cliente não pode editar.

## Consequências

- Nenhuma chamada de LLM passa sem passar pelo cap.
- Testes unitários sobre `capGuard.logic.ts` cobrem limiares sem precisar de emulator.
- Virada de mês é automática (detectada por `mesReferencia`).
- Para aumentar cap manualmente, admin usa Cloud Function auditada (Fase 2).

## Alternativas descartadas

- Quota do próprio provider: não é por-tenant, só por-projeto.
- Budget alert do GCP: só avisa, não bloqueia.
