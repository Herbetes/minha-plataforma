# Controle de custo de IA

## Objetivo

Um bug em loop de LLM **não pode** queimar orçamento. Por isso:

- Cap mensal em USD por organização (`capsCustoIAMesUSD`).
- Consumo acumulado no mês (`consumoAcumuladoMesUSD`).
- Status derivado (`statusCap`): `saudavel | aviso70 | aviso90 | bloqueado`.
- Verificação **antes** de qualquer chamada de LLM.

## Fluxo

```
client → llmRoute (callable) → verificarCapAntes(orgId)
                               ├── se bloqueado → erro CAP_EXCEDIDO (não chama LLM)
                               └── segue → rateLimit → cache → provider → registrarConsumoIA
```

Lógica pura isolada em `apps/functions/src/ai/capGuard.logic.ts` (testada sem Firestore).

## Limiares

| Status | Consumo / Cap | Comportamento |
|--------|--------------|--------------|
| saudavel | < 70% | Tudo normal |
| aviso70  | ≥ 70% | Alerta admin (push + email) |
| aviso90  | ≥ 90% | Alerta + UI banner |
| bloqueado | ≥ 100% | **Nenhuma chamada de LLM até virar mês ou admin aumentar cap** |

## Virada de mês

Na primeira chamada após mudar `YYYY-MM`, `verificarCapAntes` zera o consumo
e reseta o status. Isso é atômico via transação.

## Campos protegidos

`capsCustoIAMesUSD`, `consumoAcumuladoMesUSD`, `statusCap`, `mesReferencia` e
`plano` **não podem** ser escritos pelo cliente (regras Firestore). Admin muda
o cap via Cloud Function dedicada (`atualizarCapCusto` — Fase 2).

## Visibilidade

- Dashboard admin (fase 2) mostra consumo por dia, por tipo de chamada, por usuário.
- Cada chamada bem-sucedida loga: `{ requestId, orgId, tipo, modelo, tokensIn, tokensOut, custoUSD, latenciaMs }`.

## Ajuste

Para aumentar o cap: Cloud Function callable `atualizarCapCusto(capUSD)` (Fase 2,
exige role=admin) que também registra em `auditoria/`. Admin externo (support) pode
usar o Firebase Admin SDK via console, também auditado.
