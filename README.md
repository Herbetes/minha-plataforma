# minha-plataforma

Portal de operações do Grupo. Next.js + Supabase + Claude, publicado na Vercel.

Estado atual: **Projeto 0 do [roadmap](docs/ROADMAP.md) concluído** — login por link
mágico, chat com o Claude em streaming e histórico que sobrevive ao fechar o navegador.

---

## O que você precisa antes de começar

Três contas, todas com plano gratuito suficiente:

| Serviço | Para quê | Onde |
|---|---|---|
| Anthropic | A chave da API do Claude | console.anthropic.com |
| Supabase | Banco de dados e login | supabase.com |
| Vercel | Publicar o site | vercel.com |

---

## Passo a passo (primeira vez)

### 1. Anthropic — chave e teto de gasto

1. Entre em `console.anthropic.com`.
2. **Settings → Limits**: defina um teto de gasto mensal. Faça isso **antes** de gerar
   a chave — é a única proteção contra uma surpresa na fatura.
3. **API Keys → Create Key**. Copie a chave; ela só aparece uma vez.

### 2. Supabase — banco e autenticação

1. Crie um projeto novo. Escolha a região **South America (São Paulo)**: os dados
   ficam no Brasil e a latência cai bastante.
2. Abra **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql)
   inteiro e execute. Isso cria as tabelas `conversations` e `messages` e liga o
   Row Level Security.
3. Em **Project Settings → API**, copie `Project URL` e a chave `anon public`.
4. Em **Authentication → URL Configuration**, adicione em *Redirect URLs*:
   - `http://localhost:3000/auth/callback`
   - `https://SEU-PROJETO.vercel.app/auth/callback` (depois do primeiro deploy)

   Sem esse passo o link do e-mail volta com erro.

### 3. Rodar na sua máquina

```bash
npm install
cp .env.example .env.local   # preencha as quatro variáveis
npm run dev
```

Abra `http://localhost:3000`, clique em Entrar, informe seu e-mail e siga o link
que chegar na caixa de entrada.

### 4. Publicar na Vercel

1. Em `vercel.com`, **Add New → Project** e importe este repositório.
2. Em **Environment Variables**, cadastre as mesmas quatro variáveis do `.env.local`.
3. **Deploy**. A partir daí todo `git push` publica sozinho, e cada branch ganha
   uma URL de preview própria.
4. Volte ao passo 2.4 e adicione a URL de produção nas *Redirect URLs* do Supabase.

---

## Como verificar que está tudo funcionando

A verificação tem três níveis. Faça na ordem — cada um só faz sentido depois do anterior.

### Nível 1 — o código está são (não precisa de conta nenhuma)

```bash
npm install
npm run verificar
```

Roda typecheck, os testes de unidade e o build de produção. Esperado:

```
Test Files  1 passed (1)
     Tests  13 passed (13)
✓ Compiled successfully
```

Se isso passa, o código compila e a lógica está correta. É exatamente o que o
GitHub Actions roda a cada push — a aba **Actions** do repositório mostra o mesmo
resultado, com um check verde no commit.

### Nível 2 — as suas credenciais funcionam

Depois de preencher o `.env.local`:

```bash
npm run diagnostico
```

Faz uma chamada real (e minúscula, fração de centavo) à Anthropic e uma consulta
real ao Supabase, e diz exatamente o que está errado:

```
Anthropic
  OK   A chave funciona e o modelo respondeu
       modelo servido: claude-opus-5 · resposta: "ok" · tokens: 12 entrada / 3 saída

Supabase
  OK   Tabela "conversations" existe e o RLS está barrando acesso anônimo
  OK   Tabela "messages" existe e o RLS está barrando acesso anônimo

Ambiente pronto. Rode npm run dev e faça o login.
```

Ele distingue as falhas: chave rejeitada (401), modelo inexistente, teto de gasto
atingido (429), tabela que não existe (`schema.sql` não foi executado), URL errada
e — o mais importante — **RLS desligado**. Se a consulta anônima devolver alguma
linha, o script acusa: sem RLS, a chave `anon`, que é pública, lê os dados de todos.

### Nível 3 — o caminho completo, no navegador

Com `npm run dev` rodando, confira estes seis pontos:

| # | O que fazer | O que deve acontecer |
|---|---|---|
| 1 | Abrir `http://localhost:3000/app` sem estar logado | Redireciona para `/login` |
| 2 | Informar seu e-mail e enviar | Tela de "Link enviado" e o e-mail chega em segundos |
| 3 | Clicar no link do e-mail | Entra direto em `/app`, com seu e-mail no topo |
| 4 | Mandar uma pergunta | A resposta aparece **palavra por palavra**, não de uma vez — é o streaming funcionando |
| 5 | Recarregar a página (F5) | A conversa continua lá. **Este é o teste que define o Projeto 0 como pronto** |
| 6 | Clicar em Sair e tentar `/app` de novo | Volta para `/login` |

Para conferir que os dados estão mesmo no banco: Supabase → **Table Editor** →
`messages`. Você vê suas mensagens, com `model`, `input_tokens` e `output_tokens`
preenchidos nas respostas do assistente.

**Um teste que vale fazer uma vez**: abra a mesma URL numa aba anônima e faça login
com um segundo e-mail. A conversa do primeiro usuário não pode aparecer. É o RLS
sendo provado na prática.

### E em produção?

Os mesmos seis passos do nível 3, na URL da Vercel. Se o nível 3 passou local e
falha em produção, a causa é quase sempre uma destas duas: faltou cadastrar as
variáveis de ambiente na Vercel (e refazer o deploy), ou faltou adicionar a URL de
produção nas *Redirect URLs* do Supabase.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o servidor local em `localhost:3000` |
| `npm run verificar` | Typecheck + testes + build (o mesmo que o CI roda) |
| `npm run diagnostico` | Testa suas credenciais de verdade, contra Anthropic e Supabase |
| `npm run build` | Build de produção — roda igual ao da Vercel |
| `npm run typecheck` | Confere os tipos sem gerar arquivo |
| `npm test` | Roda os testes de unidade |

O GitHub Actions roda `typecheck`, `test` e `build` a cada push. O build roda **sem
nenhum segredo** de propósito: se algum dia o build passar a depender de uma variável
de ambiente, o CI acusa antes de a produção quebrar.

---

## Como o projeto está organizado

```
app/
  page.tsx              Landing pública
  login/                Login por link mágico
  auth/callback/        Troca o código do e-mail por uma sessão
  auth/signout/         Encerra a sessão
  app/                  Área protegida: o chat
  api/chat/route.ts     Backend do chat, com streaming
lib/
  env.ts                Leitura de variáveis com erro legível
  chat.ts               Lógica pura (validação, histórico, título)
  chat.test.ts          Testes dessa lógica
  supabase/             Clientes de navegador, servidor e middleware
prompts/
  chat.ts               Prompt do sistema, versionado
supabase/
  schema.sql            Tabelas, índices e políticas de RLS
middleware.ts           Renova a sessão e protege /app
docs/ROADMAP.md         A trilha completa dos seis projetos
```

---

## Decisões que valem explicação

**A chave da Anthropic nunca vai ao navegador.** Ela só é lida em
`app/api/chat/route.ts`, que roda no servidor. Nenhuma variável sensível leva o
prefixo `NEXT_PUBLIC_` — esse prefixo é justamente o que manda o Next.js embutir
o valor no JavaScript que o visitante baixa.

**A chave `anon` do Supabase é pública por design.** Quem protege os dados não é o
segredo dela, e sim o Row Level Security do `schema.sql`: o banco só devolve linhas
cujo `user_id` bate com o usuário autenticado. É por isso que ligar o RLS não é
opcional.

**Usamos `getUser()`, nunca `getSession()`, para autorizar.** `getSession` só lê o
cookie, que o navegador pode ter forjado. `getUser` valida o token no servidor do
Supabase. Em rota protegida, essa diferença é a proteção inteira.

**Sem ORM por enquanto.** O Projeto 0 fala com o banco pelo cliente do Supabase,
que respeita o RLS automaticamente. O Drizzle entra no Projeto 1, quando as consultas
ficarem complexas o bastante para justificar.

**O prompt mora em `prompts/chat.ts`.** Prompt é código: quando o comportamento do
assistente mudar, o `git log` do arquivo mostra o que mudou e quando.

**O modelo é configurável.** O padrão é `claude-opus-5`. Para trocar sem mexer no
código, mude `ANTHROPIC_MODEL` — por exemplo para `claude-haiku-4-5` em testes, que
custa bem menos.

---

## Quando algo der errado

| Sintoma | Causa provável |
|---|---|
| `Variável de ambiente ausente: X` | Falta a variável no `.env.local` ou na Vercel. Depois de cadastrar na Vercel, é preciso um novo deploy. |
| O link do e-mail cai em "link inválido" | A URL de callback não está nas *Redirect URLs* do Supabase. |
| `[Erro ao falar com a IA...]` no balão | Chave da Anthropic errada, sem crédito, ou acima do teto de gasto. |
| Login funciona mas o chat volta 401 | Cookie de sessão bloqueado. Teste fora da aba anônima. |
| Histórico não aparece | O `schema.sql` não foi executado, ou foi executado antes de você criar o usuário. |

---

## Próximo passo

**Projeto 1 — Cofre de documentos**: upload de PDF, busca semântica com `pgvector`
e respostas que citam a cláusula de origem. O escopo está em
[`docs/ROADMAP.md`](docs/ROADMAP.md).
