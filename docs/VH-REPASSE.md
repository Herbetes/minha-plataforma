# O repasse do mês — contrato entre a plataforma e a skill

## Por que existe

O produto final do fechamento da VH **não é a conciliação**: é a aba nova dentro
do `MOVIMENTO VH`, com fidelidade visual ao mês anterior, que vai para a Fabiana
e para a contabilidade.

A plataforma **não escreve** essa aba, e isso é decisão, não pendência. A
planilha tem células mescladas, alturas, larguras e configuração de página que a
skill já preserva com openpyxl. Um segundo programa reescrevendo o mesmo arquivo
por outra biblioteca perde formatação em silêncio — e silêncio, no documento que
vai para fora, é o pior defeito possível.

Então a divisão é esta:

| Quem | Faz o quê |
|---|---|
| **Plataforma** | Guarda o cadastro, lê os extratos, propõe a conciliação, recebe a **sua aprovação**, arquiva tudo por mês |
| **Repasse** (este arquivo) | Leva o mês aprovado de um lado para o outro |
| **Skill** | Escreve a aba no `MOVIMENTO VH`, mantendo a fidelidade visual |

Onde baixar: tela do mês → **Baixar repasse para a skill**. Salve na pasta do mês,
ao lado dos extratos.

## O formato

`REPASSE VH AAAA-MM.json`. Todo valor em **centavos, inteiro** — nunca decimal.
Ponto flutuante acumula erro de arredondamento, e um centavo de diferença numa
conciliação de aluguel vira divergência que ninguém consegue explicar.

```jsonc
{
  "formato": "vh-fechamento",
  "versao": 1,              // sobe quando o formato quebrar quem lê
  "competencia": "2026-08",
  "geradoEm": "2026-09-01T12:00:00.000Z",
  "status": "conferencia",  // aberto | conferencia | fechado
  "moeda": "centavos",

  "imoveis": [
    {
      "imovel": "FLAT 602",
      "locatario": "João da Silva",
      "contaDestino": "Herbetes",        // apelido da conta cadastrada
      "aluguelEsperadoCentavos": 280000,
      "recebidoCentavos": 280000,
      "diferencaCentavos": 0,
      "situacao": "recebido",            // recebido | parcial | excedente | nao_recebido
      "recebimentos": [
        {
          "data": "2026-08-05",
          "valorCentavos": 280000,
          "conta": "Herbetes",
          "historico": "DEP JOAO DA SILVA",
          "confianca": 92,
          "justificativa": "valor e pagador batem"
        }
      ]
    }
  ],

  "dividendos":     [ /* mesma forma de "recebimentos" */ ],
  "tributos":       [ /* DARF; `conta` diz de onde saiu */ ],
  "outros":         [ ],
  "naoAtribuidos":  [ /* crédito do mês que ninguém classificou */ ],

  "despesas": [
    { "tipo": "condominio", "descricao": "FLAT 602", "valorCentavos": 42000 }
  ],

  "totais": {
    "receitaBrutaCentavos": 280000,
    "condominioCentavos": 42000,
    "iptuCentavos": 9500,
    "receitaLiquidaCentavos": 228500
  },

  "pendencias": {
    "propostasSemDecisao": 0,
    "depositosNaoAtribuidos": 0,
    "imoveisSemRecebimento": 0
  }
}
```

## Cinco regras que valem entender

**1. Só entra o que você aprovou.** Proposta pendente ou rejeitada não vira
recebimento. O agente propõe; a planilha só recebe o que passou pela sua mão.

**2. Imóvel que não recebeu nada continua na lista**, com
`"situacao": "nao_recebido"`. Omitir o que ficou em zero faria parecer que o
imóvel não existe, quando o que houve foi inadimplência — a informação sumiria
justamente no mês em que ela importa.

**3. Um real de diferença é `"recebido"`.** Abaixo disso é arredondamento
bancário, não falta de pagamento. Acima vira `parcial` (ou `excedente`), com
`diferencaCentavos` explícito.

**4. `tributos[].conta` é o campo que decide empréstimo do sócio.** DARF pago da
conta PJ é despesa; pago de conta PF é empréstimo do sócio. O repasse entrega o
fato; a classificação contábil continua sendo da skill.

**5. `naoAtribuidos` é a lista que impede receita de sumir.** São créditos do
período que ninguém sequer propôs classificar. Se ela não estiver vazia, o mês
não está pronto para virar aba.

## Para a skill ler isto

A skill hoje monta o mês a partir dos extratos e da planilha da Fabiana. Para
consumir o repasse, ela ganha um caminho alternativo na **Fase 1**:

> Se existir na pasta do mês um arquivo `REPASSE VH AAAA-MM.json` com
> `"formato": "vh-fechamento"` e `"versao": 1`:
> - **pule as Fases 2 e 3** (bootstrap do cadastro e matching) — a conciliação
>   já foi feita e aprovada na plataforma;
> - monte a aba direto de `imoveis[]`, usando `contaDestino` para o símbolo do
>   Nº (`( H )`, `( C )`, sem letra = VH) e `recebimentos[]` para discriminar
>   depósitos múltiplos nas colunas B e J;
> - **pare e pergunte** se `pendencias.propostasSemDecisao > 0` ou
>   `pendencias.depositosNaoAtribuidos > 0` — o mês não está fechado;
> - se `versao` for maior que a conhecida, **recuse** e peça a versão da skill
>   correspondente, em vez de ler um formato que mudou.
>
> Sem o arquivo, siga o fluxo atual sem alteração nenhuma.

Durante a fase de validação (os primeiros meses), rode os dois caminhos e
compare `totais.receitaBrutaCentavos` com o total que a skill apuraria sozinha.
Divergência aí é sinal de que um dos dois leu um extrato errado — e é exatamente
o que a conferência dupla existe para pegar.
