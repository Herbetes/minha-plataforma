# Segurança

## Modelo de ameaças (resumo)

| Ameaça | Ativo | Controle |
|--------|-------|----------|
| Cross-org data leak | Dados de orgs | Firestore Rules + testes de isolamento no CI |
| Privilege escalation | Custom claims | `setUserRole` só via Cloud Function; admin não altera outro admin |
| Chave LLM vazada | Secret Manager | Chaves nunca no frontend; SDKs de LLM só nas Functions |
| Custo de IA fugindo | Orçamento | Hard-cap por org, alertas 70/90%, bloqueio em 100% |
| CSRF / clickjacking | Hosting | CSP + `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Replay de token | JWT | Firebase rotaciona; forçamos `getIdToken(true)` após claim change |
| Upload abusivo | Storage | Storage Rules restringem MIME + tamanho por path |
| Tampering de auditoria | `/auditoria/*` | Append-only: update/delete bloqueados nas rules |
| PII em logs | Cloud Logging | `logger` redige campos sensíveis automaticamente |
| Flood de requisições | Cloud Functions | Rate-limit por (uid, tipo) em token bucket |

## Controles de código

- Zero `allow read, write: if true` nas rules.
- Toda callable chama `exigirAuth()` e valida papel.
- Toda callable valida payload com Zod antes de qualquer efeito.
- `package.json` roots: `"private": true` para evitar publicação acidental.
- Dependências auditadas via `pnpm audit` no CI (ver workflow).
- Secrets Scan via gitleaks no CI em cada PR.

## Processos

- Rotação de segredos a cada 90 dias, ou imediatamente em suspeita de vazamento.
- Backup diário do Firestore para GCS com retenção de 30 dias.
- Acesso a dados de produção passa por break-glass documentado.
- Post-mortem para qualquer incidente que toque mais de uma org.

## LGPD

- Consentimento registrado em `organizacoes/{orgId}/usuarios/{uid}.consentimento`.
- Endpoints `exportarDadosLGPD` e `excluirDadosLGPD` (Fase 1: stubs; Fase 2: funcional).
- Dados de titular excluído: soft-delete + purga em 30 dias.
- Logs retidos por 180 dias; auditoria por 5 anos (append-only).
