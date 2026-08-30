# Trilha de Automação e Agentes — minha-plataforma

Roadmap de aprendizado prático: seis projetos encadeados que saem do zero e chegam
a um produto multiusuário, usando problemas reais do seu dia a dia como matéria-prima.

Autor do plano: sessão de planejamento com Claude Code.
Última revisão: 2026-08-29.

---

## 0. Estado real da trilha

Atualizado depois da primeira sessão de construção. O que segue no documento é o
plano; esta seção é o que de fato aconteceu.

| Projeto | Estado | Observação |
|---|---|---|
| **0 — Portal** | **No ar** | Login por link mágico, chat com o Claude em streaming, histórico no Postgres. |
| **1 — Cofre** | **No ar** | Envia PDF, pergunta em português, resposta com trechos citados. |
| **2 — Agente VH** | **No ar** | Contas, contratos, extratos (PDF/CSV/OFX), planilha de condomínios, conciliação proposta por agente com aprovação humana e fechamento mensal. |
| **3 — Radar** | **No ar** | Alertas calculados por código, aviso semanal por e-mail com idempotência diária, histórico das execuções. |
| 4 — Copiloto | não começado | |
| 5 — Produto | não começado | |

Os dois primeiros saíram numa sessão só, não nas cinco semanas previstas. A
estimativa original era conservadora para quem escreve o código à mão; com o
código sendo escrito aqui, o gargalo real vira a configuração de contas e
serviços, não a programação.

### Decisão mudada no caminho

**O Cofre usa busca textual do Postgres, não embeddings.** O plano previa busca
semântica, que exigiria mais uma conta e mais uma chave de API. Depois de ver
quanto custou configurar as três primeiras contas, a troca se pagou: a busca
textual em português entende plural e conjugação ("reajustes" acha "reajuste") e
resolve bem documentos onde se procura termo literal — nome de locatário, IGP-M,
número de cláusula. O que ela não faz é sinônimo: perguntar "correção monetária"
não acha "reajuste". Se isso incomodar na prática, a busca semântica entra como
melhoria, sem refazer nada.

### O que a trilha não previa e apareceu

Nenhum dos problemas que custaram tempo estava no código. Todos vieram de
configuração de serviço, e vale registrar porque vão se repetir:

- **Projeto antigo na Vercel com configuração de site estático.** Ficou apontando
  para uma pasta `public` que um app Next.js não gera. Resolvido com `vercel.json`
  declarando o framework, mais a correção no painel.
- **`Redeploy` republica o mesmo commit**, não o mais recente. Dá para publicar
  várias vezes e continuar rodando código antigo, sem nenhum aviso. Daí ter
  nascido o `/api/versao`, que responde o que está no ar.
- **A publicação automática a cada push não está funcionando.** Cada versão nova
  exige um *Create Deployment* manual apontando para `main`. Pendente de
  investigação — provavelmente a conexão com o GitHub, feita em 2025.
- **Limite de e-mail do Supabase.** O serviço embutido manda pouquíssimas
  mensagens por hora e trava o login durante os testes. Resolvido com SMTP
  próprio (Resend).
- **Extensão de IA no navegador sujando o "copiar tudo".** Um `Ctrl+A` numa
  página trouxe o texto de um botão flutuante junto e quebrou o SQL. Usar o botão
  *Copy raw file* do GitHub elimina a classe inteira de problema.

A lição para os próximos projetos: **reserve mais tempo para conectar serviços do
que para escrever código.**

---

## 1. Diagnóstico do que existe hoje

O repositório tem três arquivos. Eles mostram exatamente onde você está e o que falta.

| Arquivo | O que é | Problema |
|---|---|---|
| `index.html` | Landing page com login e caixa de chat, tudo em HTML/CSS/JS inline | O login é `alert('Login ainda não implementado')`. Não existe autenticação. |
| `chat.js.txt` | Função serverless que chama a API da OpenAI | A extensão é `.txt` e o arquivo está na raiz. Para a Vercel enxergar, precisaria ser `api/chat.js`. **Hoje o chat nunca funciona** — o `fetch('/api/chat')` do front sempre cai no `catch`. |
| `README.md` | Duas linhas | Sem instruções de execução, sem variáveis de ambiente, sem deploy. |

Três conclusões:

1. **Você entende a forma das coisas** (front chama back, back chama LLM, LLM responde). Isso é mais do que a maioria tem. O que falta é fechar o circuito uma vez, de ponta a ponta, com deploy real.
2. **Nada está persistido.** Sem banco, sem memória, sem histórico. Toda conversa morre no refresh.
3. **Você está usando OpenAI numa vida inteiramente construída em Claude.** Suas Skills (`agente-contabil-vh`, `analista-para-imposto-de-renda`, `financeiro-escolar`, `projeto-due-marca-b`...) são sofisticadas. Faz sentido a plataforma falar a mesma língua.

O ponto de partida certo não é começar um projeto novo. É fazer **este** repositório funcionar de verdade.

---

## 2. Reorganizando a sua ideia

Hoje "minha-plataforma" é uma landing page com um chat genérico. Um chat genérico não
resolve problema nenhum — você já tem o Claude para isso, e melhor.

**A ideia melhor: um portal de operações do Grupo.** Uma casca só (login, menu, layout,
banco, log) e módulos plugados dentro dela. Cada projeto da trilha abaixo entrega um módulo.

```
minha-plataforma
├── Portal (casca)         → login, menu, permissões, tema, log de uso
├── Módulo Cofre           → seus documentos, com busca que responde perguntas
├── Módulo VH              → conciliação de aluguéis, contratos, tributos
├── Módulo Radar           → vigilância automática: inadimplência, vencimentos, reajustes
├── Módulo Copiloto        → pergunta em linguagem natural, roteia para o especialista certo
└── Módulo Admin           → custos de IA, auditoria, usuários
```

Por que isso é melhor do que seis projetos soltos:

- Você constrói a casca **uma vez** e reaproveita cinco vezes. Login, banco, deploy e testes
  param de ser custo em cada projeto novo.
- Cada módulo tem valor sozinho. Se você parar no módulo 2, ainda ficou com algo útil.
- É o caminho natural para produto, caso um dia queira vender para outras escolas.

**A regra que vale para todos os módulos:** cada um resolve uma dor que você já sente hoje.
Nenhum projeto de estudo com dados fictícios. Você aprende mais rápido quando o resultado
errado te custa alguma coisa.

---

## 3. Vocabulário: Skill, Agente, Automação e MCP

Você usa esses termos como sinônimos e eles não são. Separar isso muda a arquitetura das
suas decisões.

**Skill** — uma pasta com `SKILL.md` e scripts, que o Claude carrega quando o assunto aparece.
Roda **com você presente**, no chat ou no Claude Code. É artesanato repetível: você continua
no controle de cada passo. Barato de criar, rápido de iterar, sem infraestrutura.
*Você já domina isso.* Suas skills são o seu ativo mais avançado hoje.

**Agente** — um programa que roda um laço: recebe um objetivo, escolhe ferramentas, executa,
observa o resultado, decide o próximo passo, até terminar. Roda **sem você**. Precisa de
guarda-corpos: validação de saída, limite de passos, trilha de auditoria, aprovação humana
antes de qualquer ação irreversível.

**Automação** — o gatilho. Um horário (cron) ou um evento (webhook, upload, e-mail recebido)
que dispara um agente ou um script. Sem automação, agente é só um botão mais caro.

**MCP** — o protocolo que conecta ferramentas e dados tanto às Skills quanto aos Agentes.
Você já usa vários (Gmail, Drive, Notion, GitHub). No Projeto 4 você escreve o seu.

**A regra de promoção:** comece tudo como Skill. Quando uma Skill você roda pela quinta vez
no mesmo formato, sem tomar nenhuma decisão no meio, ela virou candidata a Agente.
Quando você precisa dela rodando às 3h da manhã, virou Automação.

---

## 4. Decisões de stack (já tomadas, para você não travar)

Beginner que escolhe stack perde três semanas. Estas escolhas estão fechadas.
Se quiser trocar, troque depois de ter algo funcionando.

| Camada | Escolha | Por quê |
|---|---|---|
| App (front + back) | **Next.js 15 (App Router) + TypeScript** | Um repositório só, front e back juntos. É exatamente o modelo que seu `chat.js` já tentava usar. |
| Hospedagem | **Vercel** | `git push` vira deploy. Cada branch ganha uma URL de preview. Plano gratuito serve. |
| Banco | **Postgres via Supabase** | Traz junto autenticação, armazenamento de arquivos e `pgvector` (memória semântica). Três problemas resolvidos num serviço. |
| Acesso ao banco | **Drizzle ORM** | Migrations versionadas em SQL de verdade, tipos gerados automaticamente. Você lê o SQL e entende. |
| Login | **Supabase Auth, magic link** | Resolve o seu login falso sem você jamais guardar uma senha. |
| IA | **`@anthropic-ai/sdk`** | `claude-sonnet-5` para raciocínio; `claude-haiku-4-5` para classificação e triagem barata; `claude-opus-5` só quando a tarefa justificar. |
| Embeddings | **Voyage AI** (`voyage-3.5`) | A Anthropic não tem API de embeddings; Voyage é a recomendação oficial. Alternativa: `text-embedding-3-small` da OpenAI, que você já tem chave. |
| Validação | **Zod** | Toda saída de LLM passa por um schema antes de tocar o banco. Essa é a diferença entre demo e sistema. |
| Estilo | **Tailwind + shadcn/ui** | Componentes prontos e acessíveis. Você não vai escrever CSS na mão. |
| Testes | **Vitest** (unidade) + **Playwright** (ponta a ponta) | |
| Agendamento | **Vercel Cron** | Um arquivo `vercel.json` e pronto. |
| Erros | **Sentry** (plano gratuito) | Você vai querer saber que quebrou antes do usuário te contar. |

**Sobre Python.** Suas Skills geram `.docx`, `.xlsx` e `.pptx` com Python, e isso é bom demais
para jogar fora. A Vercel roda funções Python no mesmo projeto (`api/gerar_planilha.py`).
Regra: TypeScript para o app e os agentes, Python só para geração de documento e análise de
dados. Não misture além disso — dois runtimes é o limite saudável.

**O que eu descartei de propósito:** LangChain e frameworks de agente (escondem justamente o
que você precisa aprender agora); Firebase (você vai querer SQL); backend separado em
FastAPI (dobra o trabalho de deploy sem ganho nesta fase).

---

## 5. Memória: os quatro tipos

Você pediu "memória" e essa é a palavra mais ambígua da área. São quatro coisas diferentes,
com quatro implementações diferentes. Confundi-las é o erro nº 1 de quem começa.

**1. Memória de conversa** — o histórico do diálogo atual.
Tabela `messages` (conversa, papel, conteúdo, tokens, custo).
Cuidado: conversa longa estoura a janela de contexto. A solução é *compactação* — quando
passar de N mensagens, o próprio Claude resume as antigas e você guarda o resumo.

**2. Memória de conhecimento (RAG)** — seus documentos.
Tabelas `documents` → `chunks` (texto + vetor `pgvector`). Você pergunta, o sistema busca os
trechos parecidos e entrega ao Claude junto com a pergunta.
Regra inegociável: **toda resposta cita a fonte**. RAG sem citação é alucinação com aparência
de verdade, e no seu caso (contratos, laudos, IR) isso é inaceitável.

**3. Memória de perfil** — fatos duráveis sobre você e o Grupo.
Tabela `facts` (sujeito, fato, origem, confiança, aprovado_em). Ex.: "o reajuste da VH é IGP-M
em novembro", "a meta de rematrícula 2027 é 92%".
Regra: o agente **propõe** um fato, você aprova. Memória que se escreve sozinha vira lixo em
duas semanas.

**4. Memória de trabalho** — o estado de uma tarefa em execução.
Tabelas `runs` e `steps`. É o que permite retomar um processamento que caiu no meio,
auditar o que o agente fez, e responder "por que ele decidiu isso?".

Um sistema maduro tem os quatro. Você constrói na ordem 1 → 2 → 4 → 3 ao longo da trilha.

---

## 6. A trilha: seis projetos

Cada projeto tem: objetivo, o que ensina, escopo mínimo, definição de pronto e a armadilha
que derruba a maioria das pessoas ali.

---

### Projeto 0 — Ressuscitar o portal
**Semanas 1–2 · dificuldade: baixa · fundação de tudo**

**Objetivo.** Transformar o repositório atual em um app Next.js publicado, com login que
funciona e um chat com Claude que responde em streaming.

**O que ensina.** Estrutura de repositório, variáveis de ambiente e segredos, função
serverless, streaming de resposta, deploy contínuo, branch de preview, primeiro teste no CI.

**Escopo mínimo.**
- Migrar `index.html` para uma página React com Tailwind.
- `POST /api/chat` chamando `@anthropic-ai/sdk` com streaming.
- Login por magic link (Supabase Auth). `/app` é rota protegida.
- Uma tabela `messages` guardando o histórico.
- README com passo a passo de execução local.

**Definição de pronto.** Existe uma URL pública. Você entra com seu e-mail, conversa com o
Claude, fecha o navegador, volta e o histórico está lá. `npm test` passa no GitHub Actions.

**Armadilha.** Colocar a chave da API no frontend. Toda chave de LLM vive **só** no servidor,
em variável de ambiente, nunca em `NEXT_PUBLIC_*`. Se aparecer no navegador, foi vazada.

---

### Projeto 1 — Cofre de documentos
**Semanas 3–5 · dificuldade: média**

**Objetivo.** Você joga um PDF (contrato de locação, laudo, informe de rendimentos) e depois
pergunta em português. O sistema responde citando o trecho e o arquivo.

**O que ensina.** Upload e armazenamento, extração de texto de PDF (inclusive escaneado, com
OCR), *chunking*, embeddings, busca híbrida (vetorial + texto), citações, e como medir se um
RAG está bom.

**Escopo mínimo.**
- Upload para Supabase Storage; fila de processamento.
- Extração + chunking (~800 tokens com sobreposição de 100).
- Embeddings gravados em `pgvector`, índice HNSW.
- Busca híbrida: vetorial + full-text do Postgres, resultados combinados.
- Chat que responde **sempre** com citação clicável para o PDF de origem.
- Conjunto de avaliação: 20 perguntas suas com a resposta correta conhecida.

**Definição de pronto.** Você pergunta "qual o índice de reajuste do contrato do locatário X e
quando vence?" e recebe a resposta certa com o link para a cláusula. As 20 perguntas do eval
acertam pelo menos 17.

**Armadilha.** Chunking ingênuo que corta a cláusula no meio. Divida por estrutura
(seção, cláusula, parágrafo) antes de dividir por tamanho.

---

### Projeto 2 — Agente VH (uso de ferramentas)
**Semanas 6–8 · dificuldade: média-alta · o coração da trilha**

**Objetivo.** Portar sua skill `agente-contabil-vh` para um agente que roda no portal:
recebe o extrato do BB, propõe a conciliação com os aluguéis, você aprova na tela.

**O que ensina.** O laço de *tool use* de verdade — a diferença entre "o Claude te ajuda" e
"o Claude executa". Definição de ferramentas, validação de saída com Zod, idempotência,
aprovação humana, trilha de auditoria, controle de custo por execução.

**Escopo mínimo.**
- Ferramentas expostas ao modelo: `listar_contratos`, `buscar_pagamentos`, `calcular_score`,
  `propor_conciliacao`. Nenhuma escreve no banco.
- Uma única ferramenta de escrita, `gravar_conciliacao`, que só executa **depois** do seu
  clique de aprovação.
- Tabelas `runs` e `steps` registrando cada chamada, entrada, saída, tokens e custo.
- Tela de revisão: proposta lado a lado com o extrato, score, botão aprovar/rejeitar/ajustar.
- Testes com um extrato real anonimizado.

**Definição de pronto.** Você sobe o extrato do mês, revisa 30 conciliações em menos de dez
minutos e o resultado bate com o que você faria à mão. Cada decisão do agente é rastreável.

**Armadilha.** Deixar o agente escrever no banco sem aprovação na primeira versão. Sempre
comece com o agente **propondo**. A automação total vem depois que você confia nos números,
não antes.

---

### Projeto 3 — Radar (automação agendada)
**Semanas 9–10 · dificuldade: média**

**Objetivo.** Toda segunda-feira de manhã chega um e-mail com o que exige a sua atenção naquela
semana — sem você ter feito nada.

**O que ensina.** Agendamento, filas, novas tentativas, idempotência, alertas, e geração de
relatório com Python dentro do mesmo projeto.

**Escopo mínimo.**
- Cron da Vercel disparando o job semanal.
- Regras: contratos vencendo em 60 dias, reajustes a aplicar no mês, inadimplência acima do
  limite, tributos com vencimento próximo.
- O Claude escreve o resumo executivo em cima dos dados apurados (não em cima de palpite).
- Anexo `.xlsx` gerado por função Python.
- Envio por e-mail (Resend) e registro do que foi enviado.

**Definição de pronto.** Três segundas seguidas o e-mail chega correto, e ao menos uma vez ele
te avisou de algo que você teria esquecido.

**Armadilha.** Job que roda duas vezes e manda duas cobranças. Toda tarefa agendada precisa de
chave de idempotência: antes de agir, verifique se já agiu por aquele evento.

#### Como ficou de fato

Entregue em `lib/radar.ts` (cálculo), `lib/radar-dados.ts` (consulta),
`lib/radar-email.ts` (conteúdo), `lib/radar-executar.ts` (execução),
`app/api/radar/*` e a tela `/app/radar`. Cron da Vercel às 11h UTC de segunda,
que é 8h em Brasília.

Três decisões que fugiram do plano, e por quê:

- **A idempotência ficou no banco, não no código.** Um índice único parcial em
  `(user_id, chave) where origem = 'cron'` — e a gravação acontece **antes** do
  envio. Verificar em código "será que já mandei hoje?" abre uma janela entre a
  verificação e o envio; o índice não abre. O índice ser parcial é o que deixa o
  botão de teste da tela ser apertado quantas vezes for preciso.
- **Sem anexo `.xlsx` e sem Python.** O plano previa gerar planilha e rodar
  Python no mesmo projeto. Nada disso apareceu como necessidade: o relatório do
  mês já sai pelo VH, e o Radar é justamente o aviso curto que se lê no celular
  sem abrir anexo. Duas dependências a menos.
- **Nasceu uma regra que o plano não tinha: não mandar e-mail vazio.** Aviso
  semanal que chega sem conteúdo ensina a pessoa a ignorar o remetente — e aí o
  módulo inteiro perde a função. Semana calma grava a execução e não envia nada;
  o histórico na tela é o que distingue "semana calma" de "automação parada".

Também apareceu a primeira necessidade legítima da chave de serviço do Supabase:
o cron roda sem ninguém logado, logo sem sessão para o RLS avaliar. Fica isolada
numa rota só, com todo filtro por `user_id` escrito à mão.

---

### Projeto 4 — Copiloto do Grupo (multiagente + memória)
**Semanas 11–13 · dificuldade: alta**

**Objetivo.** Uma caixa de pergunta só. Você escreve em português e o sistema decide sozinho
qual especialista aciona: financeiro escolar, pedagógico, jurídico/contratos, VH.

**O que ensina.** Roteamento, subagentes especializados, memória de perfil, escrita do seu
próprio servidor MCP e — o mais importante — **avaliação sistemática**.

**Escopo mínimo.**
- Um roteador com `claude-haiku-4-5` classificando a intenção (barato e rápido).
- Quatro subagentes, cada um com suas ferramentas e seu prompt versionado em arquivo.
- Memória de perfil com aprovação: o agente propõe fatos, você confirma.
- Um servidor MCP próprio expondo o banco do portal ao Claude Code — assim suas Skills passam
  a ler os mesmos dados que o app.
- Suíte de eval com 30 casos, rodando no CI. Nenhum deploy que faça o eval regredir.

**Definição de pronto.** Trinta perguntas, roteamento correto em pelo menos 28, e o eval roda
automaticamente a cada pull request.

**Armadilha.** Multiagente sem eval é impossível de melhorar — você muda um prompt, algo
melhora, outra coisa piora, e você não percebe. Escreva os 30 casos **antes** dos subagentes.

---

### Projeto 5 — Produto
**Semana 14+ · dificuldade: alta**

**Objetivo.** Transformar o portal em algo que outra escola poderia usar.

**O que ensina.** Multi-inquilino com Row Level Security, papéis e permissões, LGPD aplicada
a dado sensível, onboarding, cobrança, suporte.

**Escopo mínimo.** Isolamento por organização no Postgres (RLS de verdade, testada com
tentativa de vazamento); papéis (dono, gestor, operador, leitor); trilha de auditoria
completa; política de retenção; exportação e exclusão de dados a pedido; Stripe.

**Definição de pronto.** Duas organizações no mesmo banco, e um teste automatizado que prova
que uma não enxerga a outra.

**Armadilha.** LGPD. Dado de saúde e dado de aluno menor de idade são categorias especiais.
Antes deste projeto, converse com um advogado — e note que a sua skill `revisor-de-contratos`
é uma análise preliminar, não substitui isso.

---

## 7. O esqueleto que se repete em todo projeto

Você pediu "desde o frontend até o deploy". Estas são as dez etapas, na ordem, para todos os
seis projetos. Seguir a ordem importa: pular a etapa 1 é a causa mais comum de retrabalho.

1. **Definição de pronto** — uma frase mensurável, escrita antes de qualquer código.
2. **Desenho dos dados** — as tabelas em papel antes do primeiro arquivo. Se o modelo de dados
   está errado, nenhum código conserta.
3. **Contratos** — schemas Zod e tipos de API. É o combinado entre front e back.
4. **Backend fino** — as rotas, com teste de unidade em cima da lógica, sem interface ainda.
5. **Frontend** — as telas, consumindo rotas que já funcionam.
6. **Camada de IA** — prompts em arquivos versionados (`prompts/conciliacao.v3.md`), nunca
   como string no meio do código. Prompt é código, merece histórico.
7. **Memória** — qual dos quatro tipos este módulo usa, e onde grava.
8. **Testes** — unidade (lógica pura), ponta a ponta (Playwright), e *eval* (a qualidade da IA,
   que os dois primeiros não capturam).
9. **Manual** — `README.md` para quem vai rodar; `docs/MANUAL.md` para quem vai usar, com
   captura de tela; e o registro das decisões, com o que você descartou e por quê.
10. **Deploy e observabilidade** — preview por branch, produção protegida, Sentry ligado,
    painel de custo de IA por dia.

---

## 8. Regras de ouro

**Segredos.** Nenhuma chave no repositório, nunca. `.env.local` no `.gitignore` desde o
primeiro commit. Se vazar uma chave, revogue antes de qualquer outra coisa — apagar o commit
não resolve, o histórico do Git guarda tudo.

**Custo.** Defina um teto de gasto na console da Anthropic no primeiro dia. Registre tokens e
custo de **toda** chamada, numa tabela. Use `claude-haiku-4-5` para triagem e classificação;
`claude-sonnet-5` para o trabalho; `claude-opus-5` só quando você conseguir justificar.

**Dados reais em teste.** Nunca. Anonimize CPF, nome e valor antes de qualquer arquivo entrar
no repositório — especialmente dado de saúde e de aluno.

**Ação irreversível.** Enviar e-mail, gravar no banco, emitir cobrança, apagar arquivo: passa
por aprovação humana até você ter três meses de histórico confiável.

**Backup.** Supabase faz backup automático, mas exporte você mesmo uma vez por semana no
início. Confie desconfiando.

**Um commit por assunto.** Mensagem que explica o *porquê*, não o *o quê* — o diff já mostra
o quê.

---

## 9. Como usar o Claude Code nesta trilha

Você já é forte em Skills. Estes são os recursos que provavelmente ainda não usa e que mudam
o rendimento:

- **`CLAUDE.md` na raiz** — as convenções do projeto, lidas automaticamente a cada sessão.
  Stack, padrões, o que nunca fazer. Rode `/init` para gerar o primeiro.
- **Plan mode** — antes de tarefa grande, peça o plano e aprove antes de escrever código.
  Corrigir um plano custa um minuto; corrigir código pronto custa uma tarde.
- **Subagentes** — pesquisa paralela sem sujar o contexto principal.
- **Hooks** — rodar lint e teste automaticamente depois de cada edição.
- **`/code-review` e `/security-review`** — antes de todo merge. Especialmente o segundo,
  já que você vai lidar com dado financeiro e de saúde.
- **Seu próprio MCP** (Projeto 4) — para as Skills lerem os dados reais do portal.
- **Branches** — uma por módulo, deploy de preview automático, merge só com CI verde.

**Ritmo sugerido.** Uma sessão longa por semana para construir, sessões curtas para ajustar.
Sempre termine a sessão com o código commitado e o CI verde — retomar de um estado quebrado
custa mais caro do que parece.

---

## 10. Cronograma

| Semanas | Projeto | Você sai com |
|---|---|---|
| 1–2 | Portal ressuscitado | URL pública, login real, chat com histórico · **feito** |
| 3–5 | Cofre | Busca que responde sobre os seus documentos, com citação · **feito** |
| 6–8 | Agente VH | Conciliação assistida de aluguéis, auditável · **feito** |
| 9–10 | Radar | E-mail semanal automático com o que exige atenção · **feito** |
| 11–13 | Copiloto | Uma caixa de pergunta para todo o Grupo, com eval no CI |
| 14+ | Produto | Multi-inquilino, LGPD, cobrança |

Prazos são estimativa para quem estuda algumas horas por semana. Atrasar é normal; pular
etapa não.

---

## 11. O próximo passo, concretamente

O Projeto 0 é o único que precisa começar hoje, porque tudo depende dele:

1. Criar conta na Anthropic Console, gerar chave de API, definir teto de gasto.
2. Criar projeto no Supabase (região São Paulo).
3. Conectar este repositório à Vercel.
4. Rodar o scaffold do Next.js sobre o repositório atual, preservando o histórico.
5. Migrar `index.html` para React, apagar `chat.js.txt`, criar `app/api/chat/route.ts`.
6. Ligar o login por magic link, proteger `/app`.
7. Escrever o primeiro teste e ligar o GitHub Actions.
8. Fazer o merge e conferir a URL de produção.

Todos os oito passos podem ser executados nesta mesma ferramenta, em uma sessão.
