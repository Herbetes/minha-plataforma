# Plataforma de Simulados Configurável com IA — Projeto de Produto

> Fonte única de verdade do produto. Em conflito com o prompt de engenharia,
> este documento prevalece para **requisitos de produto**; o prompt prevalece
> para **requisitos de engenharia e segurança**.

## 1. Visão
SaaS white-label multi-tenant de simulados educacionais com IA. Atende
escolas individuais (self-serve) e redes de ensino (B2B com SSO corporativo).

## 2. Público-alvo
- Escolas de ensino médio e fundamental
- Cursos pré-vestibular/ENEM
- Olimpíadas científicas (matemática, física, etc.)
- Concursos e cursinhos
- Departamentos de treinamento corporativo

## 3. Papéis
`admin`, `coordenador`, `professor`, `corretor`, `aluno`, `responsavel`.
Fonte de verdade de autorização = custom claims no token JWT.

## 4. Modelo de dados (alto nível)
Ver prompt de engenharia, seção "MODELO DE DADOS FIRESTORE".
Campos novos **devem** ser adicionados primeiro aos tipos em
`packages/shared` e a este documento antes de qualquer código de uso.

## 5. Pontuação e conceitos
Totalmente configurável por org via `config.escalaPontuacao.conceitos`.
Conceitos têm nome, faixa percentual e cor. Nenhuma lógica de pontuação
pode ser hardcoded.

## 6. Multi-tenancy
Todo acesso valida `orgId` via custom claim. Tested in
`firebase/tests/rules.test.ts`. Build falha se testes de isolamento falharem.

## 7. IA
- Roteador único (`apps/functions/src/ai/llmRoute.ts`).
- Cap de custo por org em USD/mês. Bloqueio ao atingir 100%.
- Cache SHA-256 por prompt. TTL por tipo de chamada.
- PII minimizada nos prompts.

## 8. Feature flags
- Flag per-org em `organizacoes/{id}/featureFlags/{nome}`.
- Flag global em `flagsGlobais/{nome}` é kill-switch (prevalece).
- Rollout gradual determinístico por `FNV-1a(flag:uid) % 100`.

## 9. Templates obrigatórios no MVP
1. Ensino Médio / ENEM
2. OBM (detalhado em §11.2 do prompt)
3. Vestibular / Fuvest
4. Concurso Público
5. Treinamento Corporativo
6. Escola Fundamental (bimestres)
Mais: "Em branco" para usuários avançados.

### 9.1 OBM (resumo do conteúdo no template)
Disciplina Matemática com áreas: Teoria dos Números, Álgebra, Geometria,
Combinatória, Lógica. Escala 0–100 com conceitos Bronze/Prata/Ouro/Hors-concours.
Campo custom `Nível OBM` (1/2/3). Proctoring mínimo 10 minutos, duas trocas
de aba permitidas. Ver `scripts/templates/obm.json`.

## 10. Fluxos principais
- 10.1 Onboarding self-serve (admin cria org, escolhe template)
- 10.2 Wizard 6–8 perguntas em PT-BR
- 10.3 Montagem manual de simulado
- 10.4 Aplicação online (Fase 3)
- 10.5 Correção automática (objetivas) e assistida (dissertativas, Fase 2)
- 10.6 Relatórios e diagnósticos com IA (Fase 2)
- 10.7 Plano de estudo adaptativo (Fase 3)
- 10.8 Fluxo completo: login → org → template → simulado → resultado (< 15 min)

## 11. Templates (§11.2 detalhes)
Cópia profunda de `templates/{id}.config` para `organizacoes/{orgId}/config`
ao aplicar. Mudanças posteriores no template não afetam orgs existentes.
Template OBM completo em `scripts/templates/obm.json`.

## 12. Billing (Fase 4)
Stripe para planos/assinaturas, eNotas/NFe.io para NF-e. Antes da Fase 4, billing manual.

## 13. Operações
- 13.1 Backup diário automático do Firestore.
- 13.2 Modo demo permanente (botão admin cria/remove dados fictícios).
- 13.3 Endpoints LGPD (exportação, exclusão).

## 14. Backlog futuro (NÃO IMPLEMENTAR agora)
- Marketplace de questões entre orgs (com royalties)
- Coach de IA pré-prova
- Integração com carteiras/wallets educacionais
- Videoconferência nativa para tutoria
- Banco coletivo anônimo
- Rastreio longitudinal LGPD-safe
- Análise preditiva de evasão
- Acessibilidade AAA (AA no escopo atual)
