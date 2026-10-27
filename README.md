# Finanças PF e PJ

Site para lançar e acompanhar entradas e saídas separando **pessoa física (PF)** e **pessoa jurídica (PJ)**.
Os dados ficam na sua planilha do Google (aba `Lançamentos`). O site só lê e grava nela.

## Como usar

Escreva o lançamento do seu jeito na caixa **Novo lançamento** e aperte Enter:

| Você escreve | O site entende |
|---|---|
| `mercado 320 ontem` | Saída · PF · Alimentação · pago ontem |
| `recebi 3.000 Acelera dia 15` | Entrada · PJ · Receitas · recebido dia 15 |
| `GPT 100 pj` | Saída · PJ · Assinaturas · previsto hoje |
| `luz paga` | Usa o valor e a categoria da "Luz" que já está na planilha |
| `DAS 76,60 dia 20` | Saída · PJ · Impostos · previsto dia 20 |

Antes de lançar, dá para corrigir tipo, conta, situação, valor, categoria e data.
Quanto mais lançamentos a planilha tiver, melhor o site acerta, porque ele copia a classificação de lançamentos parecidos.

Na lista, **Paguei** / **Recebi** preenche o valor realizado e muda o status. **Excluir** pede confirmação.

## Investimentos

A seção **Investimentos** usa a aba `Investimentos` da planilha (uma linha por aplicação: nome, tipo, instituição, PF/PJ, valor aplicado e saldo atual).
No site, **Adicionar investimento** cria uma linha; **Atualizar saldo** troca o saldo atual e a data. O total investido, o rendimento e a divisão PF/PJ e por tipo aparecem no painel.

## Primeira configuração (uma vez)

1. Na planilha, abra **Extensões → Apps Script**.
2. Apague o conteúdo, cole o arquivo [`apps-script/Codigo.gs`](apps-script/Codigo.gs) e troque a `SENHA` (linha 5).
3. **Implantar → Nova implantação → App da Web**. Executar como: **eu**. Quem pode acessar: **qualquer pessoa**. Autorize.
4. Abra o site, cole a **URL do app da Web** e a senha.

A URL e a senha ficam salvas só no navegador onde você conectou. Em outro celular ou computador, conecte de novo.

Se você mudar o código do Apps Script depois, use **Implantar → Gerenciar implantações → editar → Nova versão** para a URL continuar a mesma.

## Arquivos

- `index.html`, `styles.css`, `app.js`: o site.
- `parser.js`: transforma a frase em lançamento (valor, data, tipo, conta, categoria).
- `exemplo.js`: dados fictícios do modo de exemplo.
- `apps-script/Codigo.gs`: a ponte entre o site e a planilha.

Nenhum dado financeiro fica neste repositório.
