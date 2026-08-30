# Módulo VH — desenho de entrada, saída e memória

Como o módulo deve funcionar do ponto de vista de quem usa. Escrito antes do
código, de propósito.

## O problema com o que existe hoje

O módulo tem contas, contratos, extratos e propostas — todos soltos. Você sobe
um extrato, roda o agente, aprova propostas, e no mês seguinte repete. Nada
amarra um mês ao outro. Daqui a um ano, para responder "o que aconteceu em
agosto?", só sobra uma lista de lançamentos sem contexto.

A skill já resolveu isso e o módulo não copiou: **na sua operação, a unidade é
o mês.** "ABRIL 2026" é uma pasta, uma aba da planilha e um relatório. Tudo
gira em torno do fechamento mensal.

## A ideia central: o Fechamento

Um **fechamento** é um mês. Ele guarda tudo daquele mês num lugar só:

```
FECHAMENTO — AGOSTO 2026                          [em conferência]

  ENTRADA                          SAÍDA
  ├── Extrato VH.pdf               ├── Conferência AGOSTO 2026.md
  ├── Extrato Herbetes.pdf         ├── Movimento AGOSTO 2026.xlsx
  ├── Extrato Cláudia.pdf          └── (o que mais for gerado)
  └── Planilha Fabiana.xlsx

  NÚMEROS                          O QUE FALTA
  Receita bruta    R$ 48.300,00    3 lançamentos sem proposta
  Condomínios     (R$  6.240,00)   1 aluguel não identificado
  IPTU            (R$  1.180,00)
  Receita líquida  R$ 40.880,00
```

Cada fechamento tem um estado, e o estado diz o que fazer a seguir:

| Estado | O que significa | O que aparece na tela |
|---|---|---|
| **Aberto** | Recebendo arquivos | Área de envio em destaque |
| **Em conferência** | Agente rodou, há propostas | Lista do que revisar |
| **Fechado** | Você aprovou tudo e travou | Só leitura, com os arquivos gerados |

Fechar o mês **congela** os números. Reabrir é possível, mas exige um clique
consciente e fica registrado — porque um mês fechado já foi para a
contabilidade.

## Entrada: uma caixa só

Hoje você escolhe a conta e depois o arquivo. Isso não escala para quatro
arquivos por mês.

**A caixa de entrada do mês aceita tudo de uma vez** — arraste os quatro
arquivos juntos. O sistema classifica cada um:

| O que chega | Como é reconhecido | Vira |
|---|---|---|
| PDF de extrato | Texto tem "Extrato de Conta Corrente", agência e conta | Lançamentos daquela conta |
| CSV / OFX | Cabeçalho ou blocos `STMTTRN` | Lançamentos |
| XLSX da Fabiana | Aba com nome de mês e colunas de imóvel/valor | Condomínios do mês |
| PDF de contrato | Texto tem "LOCADOR", "LOCATÁRIO", "CLÁUSULA" | Vai para o Cofre e propõe atualizar o cadastro |

Quando não conseguir reconhecer, **pergunta em vez de adivinhar** — mostra o
que achou no arquivo e pede para você dizer o que é. Nunca inventa.

### Sobre ler extrato em PDF

O PDF do banco não é uma tabela: é texto posicionado numa página. Duas
estratégias, nesta ordem:

1. **Leitura por padrão** — o extrato do BB tem linhas regulares (data,
   histórico, documento, valor). Regra determinística, testável, de graça.
2. **Leitura assistida** — se a primeira reconhecer pouca coisa, o Claude lê o
   texto e devolve os lançamentos estruturados.

**A regra de segurança vale para as duas:** todo valor extraído precisa
aparecer *literalmente* no texto do PDF. Um número que o modelo produziu mas
que não está no documento é rejeitado, não gravado. Em conciliação bancária,
número inventado é o pior defeito possível — e o mais difícil de perceber.

Além disso, quando o PDF trouxer saldo inicial e final, o sistema confere:
`saldo inicial + créditos − débitos = saldo final`. Diferença acima de um
centavo vira alerta, como na skill.

## Saída: gerada, guardada e sempre encontrável

Todo arquivo que o módulo produzir fica **preso ao fechamento**, no
armazenamento, com link para baixar. Nada de arquivo perdido em pasta de
Downloads.

Dois entregáveis por mês:

**Relatório de conferência** — o mesmo espírito do `.md` da skill: receitas por
imóvel com os depósitos que sustentam cada uma, depósitos não atribuídos por
conta, dividendos por sócio, DARFs com a origem, e a validação de saldos.
Aparece na tela e pode ser baixado.

**Planilha do mês** — para a contabilidade. Aqui vale repetir: a skill continua
sendo quem gera o Excel oficial com fidelidade visual. A planilha da plataforma
é um extrato de dados, não substituta.

## Análise: para não se perder com o tempo

Três telas, em ordem de zoom:

**1. Linha do tempo** — a lista dos meses fechados, com receita e variação.
É a primeira coisa que se vê ao abrir o módulo:

```
AGO 2026   R$ 40.880   ▲ 2,1%   fechado    12 imóveis
JUL 2026   R$ 40.040   ▼ 0,8%   fechado    12 imóveis
JUN 2026   R$ 40.360   ▲ 5,4%   fechado    11 imóveis
```

**2. Um mês** — a tela do fechamento acima: números, arquivos, pendências,
relatório.

**3. Um lançamento** — de onde veio, com que confiança, com qual justificativa,
quem aprovou e quando. A trilha que já existe no banco, agora visível.

E uma quarta, transversal: **um imóvel ao longo do tempo** — recebeu quanto em
cada mês, atrasou quando, quando vence o contrato, quando reajusta.

## O que muda no que já existe

- Extratos e propostas passam a pertencer a um fechamento.
- A tela do módulo abre na linha do tempo, não no formulário de upload.
- O agente passa a trabalhar sobre "os lançamentos de agosto", não sobre "todos
  os lançamentos pendentes".

## Ordem de construção

1. **Fechamento + entrada unificada + leitura de PDF** — sem isso nada se
   organiza.
2. **Despesas** (condomínio da planilha Fabiana, IPTU) — completa os números.
3. **Relatório e planilha de saída** — o entregável.
4. **Linha do tempo e telas de análise** — a memória.

Cada etapa é usável sozinha. Nenhuma exige refazer a anterior.
