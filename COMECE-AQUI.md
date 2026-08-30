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

(Mais tarde entra um quarto, o **Resend**, mas só quando você ligar o Radar —
o módulo que manda e-mail. Ignore por enquanto.)

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
   https://github.com/Herbetes/minha-plataforma/blob/main/supabase/schema-completo.sql
   ```

   > **É um arquivo só, e sempre o mesmo.** Ele traz tudo — chat, Cofre, pastas
   > e o módulo VH — na ordem certa. Rodar de novo não apaga nem quebra nada,
   > então sempre que eu publicar novidade, é só rodar este mesmo arquivo outra
   > vez.

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

5. **Pegar as duas chaves.**

   **O jeito mais rápido — botão `Connect`.** No topo do painel, perto do nome do
   projeto, tem um botão **Connect**. Clique nele e escolha a aba
   **App Frameworks**. Aparece um bloco pronto assim:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   São as duas chaves de uma vez, já com os nomes exatos que a Vercel espera.
   O que vem depois do `=` em cada linha é o valor. **Se conseguiu por aqui,
   pule o resto deste passo.**

   ---

   **Se não achar o botão Connect**, vá pelo menu: **Project Settings** (ícone de
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

     Dois sinais para não errar: a chave pública fica **visível na tela**, sem
     precisar clicar em nada; a secreta costuma estar **escondida atrás de um
     botão `Reveal` / `Show`**. Se você precisou revelar, é a errada.

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
| No login: `email rate limit exceeded` | O e-mail embutido do Supabase manda pouquíssimas mensagens por hora, e os testes de login gastaram a cota | Passa sozinho em cerca de 1 hora. **Você não precisa esperar para testar**: um aparelho onde você já entrou continua logado — a sessão fica salva ali. Para resolver de vez, veja SMTP abaixo |

### O e-mail embutido não serve para produção

O serviço de e-mail que vem ligado no Supabase existe só para testes, e é limitado a
um punhado de mensagens por hora — a própria Supabase avisa isso. Assim que a
plataforma passar a ter mais de um usuário, o login vai falhar para as pessoas.

O conserto é apontar o Supabase para um serviço de envio próprio, em
**Authentication → Emails → SMTP Settings**. O **Resend** resolve no plano gratuito
(3.000 e-mails por mês) e a configuração é colar uma chave.

Vale fazer sem pressa: o Resend também é o serviço que o **Projeto 3 (Radar)** usa
para mandar o e-mail semanal, então essa peça seria montada de qualquer forma.
| No chat aparece "[Erro ao falar com a IA...]" | A CHAVE 1 está errada, ou acabaram os créditos | Confira o saldo em console.anthropic.com → Billing |
| Login funciona mas a conversa some no F5 | O `schema.sql` não rodou, ou rodou com erro | Refaça o passo 2.4 e veja se a mensagem foi verde |
| No SQL Editor: `syntax error at or near "✕Merlin"` (ou outro nome de extensão) | Uma extensão de IA do navegador sujou a cópia | Limpe a caixa (Ctrl+A, Delete) e copie de novo pelo botão **Copy raw file**, nunca com Ctrl+A |
| No SQL Editor: `relation "public.X" does not exist` | Você rodou um arquivo de schema fora de ordem | Use sempre o `schema-completo.sql`, que traz tudo na ordem certa. Rodar de novo é seguro |
| No SQL Editor: erro apontando uma linha maior que 84 | Veio texto a mais colado no fim | Ctrl+End na caixa: a última linha tem que ser `for each row execute function public.touch_conversation();`. Apague o que vier depois |
| A tela fica branca | O deploy falhou | Vercel → Deployments → clique no último → aba Logs |
| Build falha com `No Output Directory named "public" found` | O projeto na Vercel está configurado como site estático, não como Next.js | Settings → Build and Deployment → **Framework Preset: Next.js**, e desligue o override de **Output Directory**. Depois, Redeploy |
| O site publicado é a versão antiga | A Vercel está publicando um commit velho | Abra `SEU-ENDERECO/api/versao` — ele diz qual commit está no ar. Se não bater com o topo da `main` no GitHub, veja a linha abaixo |
| Uma novidade não apareceu no site | **`Redeploy` republica o MESMO commit**, não o mais recente. É a pegadinha mais comum | Deployments → **Create Deployment** → escreva `main` → confirmar. Isso publica a versão atual. Use `Redeploy` só para repetir um build que falhou por motivo passageiro |

**Em qualquer caso, me traga a mensagem exata que apareceu.** Com o texto do erro
eu resolvo em um passo; sem ele, viramos os dois adivinhos.

---

## Passo 6 — Ligar o Cofre (2 min)

O Cofre é a segunda aba do portal: você envia um PDF e pergunta sobre ele em
português. Para funcionar, ele precisa das próprias tabelas.

As tabelas do Cofre já vêm no `schema-completo.sql` que você rodou no passo 2.
Se você rodou aquele arquivo, não precisa fazer mais nada aqui.

**Testar:** abra o site, entre, e clique na aba **Cofre**. Envie um contrato de
locação em PDF, espere o status virar `pronto`, e pergunte algo como *"qual o
índice de reajuste e quando vence?"*. A resposta vem com os trechos que a
sustentam, numerados.

### Pastas no Cofre

Já vêm no `schema-completo.sql`. Na aba Cofre aparece uma fileira de pastas. Você cria com **+ Nova**,
renomeia e apaga pela pasta aberta, e move documentos pelo seletor de cada linha.
Também ganha **Baixar** e **Apagar** em cada documento.

**A pasta não é só arrumação — ela mira a busca.** Com a pasta "VH" aberta, a
pergunta procura só nos documentos dela. Com muitos documentos isso melhora a
resposta, porque o trecho certo deixa de competir com assunto de outra área.

Apagar uma pasta **não apaga os documentos**: eles voltam para "Sem pasta".
Apagar um documento, esse sim, remove o arquivo e o índice para sempre.

> **Só PDF com texto selecionável por enquanto.** Se o seu contrato é uma foto
> ou digitalização, o Cofre avisa que não conseguiu ler. Ler documento
> escaneado (OCR) é uma melhoria prevista, não uma falha.

---

## Módulo VH (opcional)

As tabelas do VH já vêm no `schema-completo.sql`. Se você rodou aquele arquivo,
está tudo pronto — vá direto para o site, aba **VH**:

**1. Cadastro** (link no topo da tela) → cadastre as **contas** que recebem
aluguel, marcando quais são de pessoa física. Depois os **contratos**, cada um
apontando para a sua conta.

**2. Abrir mês** → escolha o mês e clique em Abrir.

**3. Jogue os arquivos** — todos de uma vez: os extratos em PDF, CSV ou OFX e a
planilha de condomínios. Cada arquivo é reconhecido pelo conteúdo, e o extrato
diz sozinho de que conta é.

**4. Conciliar** → o agente propõe. **Revisar** → você aprova ou corrige.
**Gerar conferência** → sai o relatório. **Fechar mês** → congela os números.

A tela inicial do VH é a lista dos meses, com receita e variação. Nada se perde
de um mês para o outro — os arquivos que entraram e os que saíram ficam
guardados no próprio mês.

---

## Módulo Radar (opcional) — a automação que trabalha sem você

Até aqui, nada acontece se você não abrir o site. O Radar inverte isso: toda
segunda-feira de manhã ele olha os seus contratos sozinho e, **só se houver algo
que mereça a sua atenção**, manda um e-mail. Semana calma não gera e-mail — aviso
que chega vazio toda semana ensina a gente a ignorar o remetente.

O que ele procura:

- **Contrato vencendo** nos próximos 60 dias (ou já vencido e ainda marcado como ativo)
- **Reajuste** neste mês ou no mês que vem
- **Aluguel que não caiu**, contando 3 dias de folga depois do vencimento
- **Mês passado ainda não fechado**

### 1. Rodar o schema de novo (2 min)

O Radar tem tabelas novas. Abra o `supabase/schema-completo.sql` no GitHub, use o
botão **Copy raw file**, cole no **SQL Editor** do Supabase e execute. Rodar de
novo é seguro: nada do que já existe é apagado.

### 2. Criar a conta de envio de e-mail (5 min)

1. Entre em **resend.com** e crie a conta (o plano gratuito manda 3.000 e-mails por mês).
2. No menu, **API Keys** → **Create API Key** → copie a chave (começa com `re_`).

> Se você já tinha configurado o Resend para o login do Supabase, **é a mesma
> conta** — pode criar uma segunda chave ou reaproveitar a que já tem.

Para o e-mail sair com um endereço seu (`radar@seudominio.com.br`), o Resend
pede que você verifique o domínio em **Domains**. Enquanto não fizer isso, dá para
testar com o remetente de testes que já vem configurado.

### 3. Pegar a chave de serviço do Supabase (2 min)

⚠️ **Atenção, esta é diferente de todas as outras.**

Até agora eu disse: *"se o nome tem `secret` ou `service_role`, passa reto."* Essa
regra continua valendo em todo lugar — **menos aqui**, e por um motivo específico.

Essa chave enxerga o banco inteiro, ignorando a proteção que separa um usuário do
outro. O Radar precisa dela porque roda de madrugada, sem ninguém logado: não
existe sessão para o banco conferir. Ela vai para uma variável **sem** o prefixo
`NEXT_PUBLIC_`, e é justamente esse detalhe que impede a chave de ser embutida no
site e lida por qualquer visitante.

Onde pegar: **Supabase → Project Settings → API Keys** → a chave marcada como
`service_role` / `secret` → **Reveal** → copiar.

**Não cole essa chave em conversa nenhuma, nem comigo.** Ela vai direto do
Supabase para a Vercel.

### 4. Guardar as chaves na Vercel (5 min)

**Vercel → seu projeto → Settings → Environment Variables.** Crie quatro:

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | a chave do passo 3 |
| `RESEND_API_KEY` | a chave `re_...` do passo 2 |
| `CRON_SECRET` | invente uma senha longa e aleatória (30+ caracteres embaralhados). Ela não é para você digitar — é o que impede um estranho de disparar os e-mails |
| `RADAR_REMETENTE` | `Radar VH <onboarding@resend.dev>` enquanto não verificar o domínio |

Marque as três caixas (Production, Preview, Development) em cada uma.

### 5. Publicar (2 min)

**Deployments → Create Deployment → escreva `main` → confirmar.**

Lembre: **`Redeploy` republica o commit antigo.** Depois de subir, confira em
`SEU-ENDERECO/api/versao` se o commit bate com o topo da `main` no GitHub.

### 6. Ligar e testar (3 min)

Abra o site e clique na aba **Radar**. Você vai ver três blocos:

- **Aviso semanal por e-mail** — o e-mail de destino, o botão **Ligar** e o botão
  **Enviar agora (teste)**
- **Agora** — os alertas do momento, em vermelho (crítico) e âmbar (atenção)
- **Execuções** — o histórico, que registra **até as vezes em que não enviou nada**

Confira o e-mail, clique em **Ligar** e depois em **Enviar agora (teste)**. Se a
lista "Agora" estiver vazia, o teste vai dizer *"Nada exigindo atenção — nenhum
e-mail enviado"*: é o comportamento certo, não um defeito. Para ver o e-mail de
verdade, cadastre um contrato com vigência terminando nos próximos 60 dias.

O envio automático acontece **segunda-feira às 8h** (horário de Brasília).

| Problema | O que é | Como resolver |
|---|---|---|
| "Resend recusou o envio (403)" | O remetente usa um domínio que não foi verificado | Volte para `onboarding@resend.dev` ou verifique o domínio em Resend → Domains |
| A tela do Radar dá erro ao carregar | As tabelas novas não foram criadas | Refaça o passo 1 |
| Segunda-feira passou e não chegou nada | Pode ser que não houvesse nada a avisar | Abra a aba Radar → **Execuções**. Se houver linha da segunda com "sem envio", funcionou. Se não houver linha nenhuma, confira `CRON_SECRET` na Vercel |
| Nunca aparece linha nenhuma em Execuções | O agendamento não está ativo | Vercel → seu projeto → aba **Cron Jobs**. O agendamento só passa a existir depois de um deploy feito **com** o `vercel.json` novo |

---

## Depois que estiver no ar

Você não precisa mexer em código para usar. Mas se quiser entender ou evoluir:

- **O que vem a seguir** está em [`docs/ROADMAP.md`](docs/ROADMAP.md) — Chat,
  Cofre, VH e Radar já estão no ar; o próximo é o servidor MCP, que liga a
  plataforma ao Claude que você já usa no dia a dia.
- **A parte técnica** está no [`README.md`](README.md) — é lá que moram as
  instruções de terminal, para o dia em que você quiser mexer no código.
