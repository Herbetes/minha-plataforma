## Resumo
<!-- O quê e por quê. Em 1–3 linhas. -->

## Como testar
- [ ] Passos para reproduzir no emulador

## Checklist (definição de pronto)
- [ ] Tipos e schemas Zod em `packages/shared`
- [ ] Feature flag criada e documentada (se aplicável)
- [ ] Testes unitários cobrindo regras de negócio
- [ ] Testes de integração com emulator (rules + functions)
- [ ] Teste e2e do happy path (se aplicável)
- [ ] Acessibilidade (teclado, contraste, labels)
- [ ] Log estruturado + Sentry (se Cloud Function)
- [ ] Custo de IA contabilizado (se aplicável)
- [ ] Documentação atualizada
- [ ] Checklist de segurança revisado (`docs/SECURITY.md`)

## Segurança
- [ ] Nenhuma chave de API em bundle cliente
- [ ] Regras de Firestore continuam bloqueando cross-org
- [ ] Endpoints sensíveis com rate-limit
- [ ] Auditoria registrada para ações sensíveis
