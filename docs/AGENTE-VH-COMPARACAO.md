# O Agente Contábil VH (skill) e o módulo VH (plataforma)

Análise feita depois de ler a skill `agente-contabil-vh` inteira.
Data: 2026-08-29.

## Conclusão em uma frase

**A skill é mais completa que o módulo da plataforma, e não deve ser
aposentada.** Elas resolvem metades diferentes do mesmo problema: a skill é um
*processo mensal que produz um documento*; a plataforma é um *sistema vivo de
registro*. O ganho está em integrá-las, não em substituir uma pela outra.

## O que a skill faz e o módulo não fazia

| Capacidade da skill | Estado no módulo |
|---|---|
| **Três contas** (VH, Herbetes, Cláudia), cada imóvel com conta destino | **Não existia** — era a lacuna mais grave |
| **Padrões de pagador** por imóvel, aprendidos e persistidos | Só comparava com o nome do locatário |
| **DARF pago de conta PF vira empréstimo do sócio** | Não existia — e depende inteiramente de saber a conta |
| Dividendos por sócio (4 sócios, PIX/TED enviados) | Categoria existia, sem os sócios cadastrados |
| Condomínio (valor bruto, da planilha Herbetes Fabiana) | Não existe |
| IPTU (parcela do mês, incrementa +1) | Não existe |
| Tributos esperados × pagos (PIS, COFINS, IRPJ, CSLL) | Não existe |
| Validação de saldo por extrato (diff > R$ 0,01 alerta) | Não existe |
| Comparativo ano a ano, projeção, ticket, inadimplência | Não existe |
| Painel de projeção de reajustes com urgência | Não existe |
| Leitura de contrato (PDF/DOCX/imagem) atualizando o cadastro | O Cofre lê contrato, mas não alimenta o cadastro |
| Depósito múltiplo somado para o mesmo imóvel | O agente sabe descrever, não somar |
| Casos especiais (SALA 1802 agrupada com 1801) | Não existe |
| Saída em Excel com fidelidade visual ao mês anterior | Não existe |
| Aprendizado entre execuções, com histórico de decisões | Não existe |

## O que o módulo faz e a skill não faz

| Capacidade do módulo | Por que importa |
|---|---|
| **Banco de dados** em vez de planilha | Consulta, histórico e cruzamento sem abrir arquivo |
| **Acessível do celular**, a qualquer hora | A skill exige uma sessão do Claude Code aberta |
| **Trilha de auditoria consultável** (`agent_runs`, `agent_steps`) | Responde "por que decidiu isso" por SQL, não por log em arquivo |
| **Importação idempotente** | Reenviar extrato não duplica |
| **Multiusuário com isolamento** | Um contador ou sócio poderia ter acesso limitado |
| **Roda sem você presente** | Pré-requisito para o Radar (Projeto 3) |

## A recomendação

**Não porte a skill inteira para a plataforma.** Dois motivos concretos:

1. **O entregável final é um Excel** com fidelidade visual, que a contabilidade
   recebe. Reproduzir isso na web não traria ganho nenhum e destruiria meses de
   ajuste fino.
2. **A skill já funciona.** Substituir o que funciona por algo pior é o erro
   mais caro que se comete em software.

**Divisão que faz sentido:**

- **A plataforma vira o cadastro oficial** — imóveis, contratos, contas,
  padrões de pagador, garantias, calendário de reajustes. Hoje esses dados
  moram numa aba de planilha bootstrapeada do mês anterior, o que é frágil.
- **A skill continua fechando o mês** e produzindo o Excel, mas passa a **ler o
  cadastro da plataforma** em vez de reconstruí-lo do mês anterior.
- **O módulo VH da plataforma** serve para o dia a dia: conferir um pagamento
  fora de época, checar quando vence um contrato, ver um reajuste chegando —
  sem esperar o fechamento do mês.

A ponte entre os dois é o **Projeto 4 do roadmap (servidor MCP próprio)**: com
ele, a skill lê o banco da plataforma direto, e as duas param de manter
cadastros paralelos.

## Ordem sugerida

1. **Contas e padrões de pagador** — sem isso o módulo não representa a
   realidade. *(feito nesta sessão)*
2. **Cadastro completo** — garantia, vigência, tipo de imóvel, conta destino,
   para o módulo virar a fonte de verdade do cadastro.
3. **Servidor MCP** — a skill passa a ler o cadastro da plataforma.
4. **Painel de reajustes** — o mesmo da Etapa 3 da skill, agora com dado vivo.
5. **Condomínio, IPTU e tributos** — depende de entender o formato da planilha
   Herbetes Fabiana, que ainda não foi analisado.

O que **não** vale portar tão cedo: geração de Excel, comparativo YoY e
projeções. A skill já faz, e faz bem.
