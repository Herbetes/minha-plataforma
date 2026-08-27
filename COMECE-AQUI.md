# Comece aqui

Guia para colocar a plataforma no ar **sem instalar nada e sem digitar comando**.
Só navegador. Leva cerca de 30 minutos na primeira vez.

Se em algum passo a tela não parecer com o que está escrito aqui, pare e me
pergunte. Não tem passo "óbvio" — se travou, é porque a instrução falhou.

---

## Antes de começar: o que você vai montar

Três serviços conversando entre si. Todos têm plano gratuito que dá conta.

| Serviço | O papel dele | Analogia |
|---|---|---|
| **Anthropic** | Fornece a inteligência (o Claude) | O cérebro |
| **Supabase** | Guarda as conversas e cuida do login | O arquivo e a portaria |
| **Vercel** | Deixa o site no ar num endereço | O terreno e o endereço |

Você vai criar conta nos três e depois **colar três senhas** (chamadas de
"chaves") num lugar só, para eles se reconhecerem.

---

## Passo 1 — A chave do Claude (10 min)

1. Entre em **console.anthropic.com** e crie sua conta.

2. **Antes de qualquer outra coisa, ponha um limite de gasto.** Procure no menu
   por *Settings* (ou *Configurações*) e dentro por *Limits* / *Billing*. Defina
   um teto mensal — comece com **US$ 5**. Dá para muita conversa.

   > Por que primeiro: é a única coisa que te protege de uma surpresa na fatura.
   > Com o teto, o pior que acontece é o site parar de responder. Sem ele, não
   > existe pior caso definido.

3. Ainda precisa colocar créditos: procure *Billing* e adicione US$ 5.

4. Agora vá em **API Keys** → **Create Key**. Dê um nome qualquer
   ("minha-plataforma").

5. **Copie a chave e cole num bloco de notas.** Ela começa com `sk-ant-` e só
   aparece **uma vez**. Se fechar a janela, não tem como ver de novo — só criar
   outra.

Guarde como: **CHAVE 1**

---

## Passo 2 — O banco de dados (10 min)

1. Entre em **supabase.com**, crie conta (dá para entrar com o GitHub).

2. **New Project**. Preencha:
   - Nome: `minha-plataforma`
   - Database Password: clique em gerar e **salve no bloco de notas** (você
     provavelmente não vai usar, mas não dá para recuperar depois)
   - Region: **South America (São Paulo)** — os dados ficam no Brasil e o site
     responde mais rápido

3. Espere uns 2 minutos enquanto ele cria.

4. **Criar as tabelas.** No menu da esquerda, clique em **SQL Editor** →
   **New query**. Você vai ver uma caixa de texto grande e vazia.

   Agora abra **esta página** noutra aba do navegador:

   ```
   https://github.com/Herbetes/minha-plataforma/blob/main/supabase/schema.sql
   ```

   Acima do texto do código, à direita, tem uma barra de ícones. Procure o de
   **duas folhinhas sobrepostas** — passando o mouse aparece *Copy raw file*.
   **Clique nele.** Pronto, está copiado.

   > ### Não use Ctrl+A nessa página
   >
   > Parece que dá no mesmo, mas não dá. Se você tiver **qualquer extensão de IA
   > no navegador** (Merlin, Monica, Sider, Grammarly e afins), ela desenha um
   > botão flutuante por cima da página — e o "selecionar tudo" copia o texto
   > desse botão junto com o arquivo.
   >
   > O resultado é um erro tipo `syntax error at or near "✕Merlin"`, apontando
   > para uma linha que nem existe no arquivo. O botão *Copy raw file* copia só
   > o arquivo e resolve isso de vez.

   Volte ao Supabase, **cole tudo** na caixa e clique em **Run**.

   **O que você deve ver:** uma mensagem verde, tipo *Success. No rows returned*.
   Isso é sucesso — "nenhuma linha retornada" é o esperado, você criou tabelas
   vazias, não consultou dados.

5. **Pegar as duas chaves.** Menu da esquerda → **Project Settings** (ícone de
   engrenagem) → **API Keys** (ou **API**). Copie para o bloco de notas:

   - **Project URL** — algo como `https://abcdefgh.supabase.co` → **CHAVE 2**

     > **Não achou o Project URL?** Não precisa procurar: dá para montar.
     > Olhe a barra de endereço do navegador, que está assim:
     > `https://supabase.com/dashboard/project/abcdefgh`
     > O pedaço depois de `/project/` é o código do seu projeto, e a CHAVE 2 é
     > esse código entre `https://` e `.supabase.co` — ou seja,
     > `https://abcdefgh.supabase.co`.
     > Repare: é `.co`, não `.com`, e não tem barra no final.
     >
     > Dependendo da versão do painel, o campo pronto fica em
     > **Data API** (Project URL) ou em **General** (Reference ID).
   - A chave **pública** → **CHAVE 3**. Dependendo de quando sua conta foi
     criada, ela aparece com um destes dois nomes:
     - `anon` / `public` — um texto longo começando com `eyJ`
     - `publishable` — começando com `sb_publishable_`

     Qualquer um dos dois serve. O que importa é que seja **a pública**.

   > ### Cuidado: nessa mesma tela tem uma chave que você NÃO deve usar
   >
   > Ao lado da pública existe outra, chamada **`service_role`** ou **`secret`**
   > (`sb_secret_...`). Ela ignora todas as regras de segurança do banco.
   >
   > Se você colar essa por engano, **tudo vai funcionar normalmente** — e é aí
   > que mora o perigo: você não perceberia que qualquer visitante do site passou
   > a poder ler os dados de todos os usuários.
   >
   > Regra simples: **se o nome tem `secret` ou `service_role`, não é essa.**
   > Essa nunca sai do lugar onde está.

   > Já a chave pública é pública de propósito, pode ficar tranquilo. Quem
   > protege seus dados é uma regra dentro do banco (chamada RLS) que o
   > `schema.sql` acabou de ligar: cada pessoa só enxerga as próprias conversas.

---

## Passo 3 — Publicar o site (10 min)

1. Entre em **vercel.com** e crie conta **com o GitHub** (importante: assim ela
   já enxerga seus repositórios).

2. **Add New** → **Project**. Ache `minha-plataforma` na lista e clique em
   **Import**.

3. **Não clique em Deploy ainda.** Antes, abra a seção
   **Environment Variables**. É aqui que entram as três chaves.

   Adicione uma por uma — nome à esquerda, valor colado à direita:

   | Nome (copie exatamente) | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | CHAVE 1 |
   | `NEXT_PUBLIC_SUPABASE_URL` | CHAVE 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CHAVE 3 |

   > O nome tem que estar **idêntico**, com maiúsculas e underscores. Um erro de
   > digitação aqui é a causa nº 1 de "não funcionou".

4. Agora sim, **Deploy**. Leva 1 a 2 minutos.

5. No fim ele te dá um endereço, algo como
   `https://minha-plataforma-xxxx.vercel.app`. **Copie.**

---

## Passo 4 — A última liga (2 min, e todo mundo esquece)

O Supabase precisa saber que aquele endereço da Vercel é confiável, senão o link
do e-mail não funciona.

1. Volte ao Supabase → **Authentication** → **URL Configuration**.

2. Em **Redirect URLs**, adicione as duas linhas:

   ```
   https://SEU-ENDERECO.vercel.app/auth/callback
   http://localhost:3000/auth/callback
   ```

   (troque `SEU-ENDERECO` pelo endereço real; a segunda linha é só para o
   futuro, se um dia você quiser mexer no código)

3. Salve.

---

## Passo 5 — Testar (5 min)

Abra o endereço da Vercel e faça estes seis testes na ordem. Cada um prova uma
peça diferente.

| # | O que fazer | O que deve acontecer | O que isso prova |
|---|---|---|---|
| 1 | Abrir o endereço | Aparece a página inicial com o botão **Entrar** | O site está no ar |
| 2 | Clicar em Entrar, digitar seu e-mail, enviar | Aparece "Link enviado" | O Supabase respondeu |
| 3 | Abrir o e-mail e clicar no link | Você cai numa tela de conversa, com seu e-mail no topo | O login funciona |
| 4 | Escrever "olá, quem é você?" e enviar | A resposta aparece **letra por letra**, como se estivesse digitando | O Claude está conectado |
| 5 | **Apertar F5 para recarregar** | A conversa continua na tela | **O banco está guardando. Este é o teste principal.** |
| 6 | Clicar em Sair, depois voltar no endereço e tentar entrar direto no chat | Ele te manda de volta para a tela de login | A proteção funciona |

Se os seis passarem, acabou. Está tudo funcionando.

### Teste extra (vale fazer uma vez)

Abra uma **janela anônima** do navegador, entre com **outro e-mail** e veja: a
conversa do primeiro e-mail **não pode aparecer**. Isso prova que uma pessoa não
enxerga os dados da outra — o mais importante de todos, e o que você vai querer
ter certeza antes de pôr contrato ou dado de aluno aqui dentro.

---

## Se algo der errado

Vá pela mensagem que apareceu na tela:

| O que você viu | O que é | Como resolver |
|---|---|---|
| "Variável de ambiente ausente: ..." | Faltou uma chave na Vercel, ou o nome saiu com erro de digitação | Vercel → Settings → Environment Variables. **Depois de corrigir, tem que fazer um deploy novo**: aba Deployments → nos três pontinhos do último → Redeploy |
| O link do e-mail dá "link inválido" | Passo 4 não foi feito, ou o endereço saiu com erro | Confira as Redirect URLs no Supabase. Tem que terminar em `/auth/callback` |
| O e-mail não chega | Quase sempre é caixa de spam | Olhe o spam. Se não estiver, veja Supabase → Authentication → Logs |
| No chat aparece "[Erro ao falar com a IA...]" | A CHAVE 1 está errada, ou acabaram os créditos | Confira o saldo em console.anthropic.com → Billing |
| Login funciona mas a conversa some no F5 | O `schema.sql` não rodou, ou rodou com erro | Refaça o passo 2.4 e veja se a mensagem foi verde |
| No SQL Editor: `syntax error at or near "✕Merlin"` (ou outro nome de extensão) | Uma extensão de IA do navegador sujou a cópia | Limpe a caixa (Ctrl+A, Delete) e copie de novo pelo botão **Copy raw file**, nunca com Ctrl+A |
| No SQL Editor: erro apontando uma linha maior que 84 | Veio texto a mais colado no fim | Ctrl+End na caixa: a última linha tem que ser `for each row execute function public.touch_conversation();`. Apague o que vier depois |
| A tela fica branca | O deploy falhou | Vercel → Deployments → clique no último → aba Logs |

**Em qualquer caso, me traga a mensagem exata que apareceu.** Com o texto do erro
eu resolvo em um passo; sem ele, viramos os dois adivinhos.

---

## Depois que estiver no ar

Você não precisa mexer em código para usar. Mas se quiser entender ou evoluir:

- **O que vem a seguir** está em [`docs/ROADMAP.md`](docs/ROADMAP.md) — o próximo
  módulo é o Cofre, onde você joga um contrato em PDF e pergunta em português.
- **A parte técnica** está no [`README.md`](README.md) — é lá que moram as
  instruções de terminal, para o dia em que você quiser mexer no código.
