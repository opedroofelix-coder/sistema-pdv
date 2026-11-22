# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Equipe de uma floricultura** (o caso apresentado nesta versão): o **dono** acompanha vendas, perdas, encomendas e financeiro; o **caixa/atendente** vende no balcão pelo computador e registra encomendas; quem monta e recebe mercadoria usa o **celular** na bancada e no recebimento.
- **Público desta versão do repositório:** recrutadores e possíveis clientes que abrem a demonstração para avaliar o trabalho. Precisam entender em poucos minutos o que o sistema faz e perceber a qualidade do produto, sem treinamento.

## Product Purpose

Estoque e ponto de venda para floricultura: vender no balcão e na loja virtual, controlar flores perecíveis com vida útil curta, montar arranjos e buquês a partir de várias flores e materiais, e atender encomendas com data e entrega. Sucesso para a loja: vender rápido, perder menos flor e saber o custo e a margem reais de cada venda. Sucesso para esta versão: servir de vitrine convincente de um sistema real.

## Positioning

O custo de cada item é calculado no banco e congelado no momento da venda, então a margem histórica é confiável. Para floricultura, isso se estende ao arranjo: o custo do buquê é a soma das flores e materiais usados, e a perda de flor vencida aparece como número, não como palpite.

## Operating Context

- Balcão: computador, leitor de código de barras, impressora térmica de 80 mm, uso o dia inteiro; funciona offline (venda guardada no navegador e sincronizada depois).
- Bancada e recebimento: celular, câmera como leitor.
- Datas fortes do varejo de flores (Dia das Mães, Dia dos Namorados, Finados) concentram encomendas.
- Instalável como PWA.

## Capabilities and Constraints

- Stack existente: React + Vite + Tailwind 4, Supabase (Postgres, Auth, Storage, Edge Functions). Interface em português do Brasil; valores em `R$ 0.000,00`.
- **Já existe:** lotes com rateio de custo, recebimento por código de barras, estoque com validade e bloqueio de venda de item vencido, PDV com pagamento misto e item avulso, caixa por operador, dashboard, relatórios, financeiro, usuários, integração Nuvemshop.
- **Ainda não existe (precisa ser construído):** arranjos e buquês compostos por vários itens (ficha técnica com baixa de cada componente), encomendas com data/hora e entrega ou retirada, registro de perda/descarte de flores.
- Perfis atuais: dono, caixa, estoquista.
- Precisa manter **tema claro e escuro** e funcionar bem **no celular**.
- O redesign vale **só para esta versão genérica**; a loja real que usa o sistema original não muda.

## Brand Commitments

Marca genérica: "Sistema PDV", sem nome de loja. Nenhum logo obrigatório.

## Evidence on Hand

- README.md descreve as funcionalidades reais do sistema original.
- Dados de demonstração de floricultura são fictícios e devem ser identificados como exemplo. Não existem depoimentos, clientes, métricas de uso ou preços publicados. Não inventar.

## Product Principles

1. A venda no balcão é rápida antes de ser bonita.
2. Flor é perecível: o frescor do estoque e a perda precisam estar à vista, não escondidos em relatório.
3. Encomenda tem hora marcada: o dia de trabalho se organiza pelo que precisa sair e quando.
4. A demonstração mostra regras de negócio reais (custo, margem, validade), não um template.

## Accessibility & Inclusion

Uso prolongado no balcão: contraste alto nos dois temas, alvos de toque confortáveis no celular, foco visível para quem opera pelo teclado e leitor.
