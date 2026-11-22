# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operadores de uma loja de revenda por lote** (o produto real): o **dono** gerencia lotes, custos, financeiro e usuários; o **caixa** vende no balcão pelo computador, com leitor de código de barras; o **estoquista** recebe mercadoria pelo celular, lendo códigos com a câmera.
- **Público desta versão do repositório:** recrutadores e possíveis clientes que abrem a demonstração para avaliar o trabalho. Eles precisam entender em poucos minutos o que o sistema faz e perceber a qualidade do produto, sem treinamento.

## Product Purpose

Estoque e ponto de venda para lojas que compram mercadoria por lote (por exemplo, em leilão) e revendem item a item no balcão e na loja virtual. Sucesso para a loja: vender rápido, saber o custo e a margem real de cada item e manter balcão e site com o mesmo estoque. Sucesso para esta versão: servir de vitrine convincente de um sistema real, em uso em produção.

## Positioning

O custo de cada item é rateado automaticamente a partir do valor pago no lote (proporcional ao preço de venda) e congelado no momento da venda, então a margem histórica é confiável. Isso é o que um PDV genérico não faz.

## Operating Context

- Caixa: computador no balcão, leitor USB/Bluetooth, impressora térmica de 80 mm, uso o dia inteiro; precisa funcionar offline (venda guardada no navegador e sincronizada depois).
- Estoquista: celular, câmera como leitor de código de barras, recebimento item a item.
- Dono: dashboard, relatórios, fechamentos de caixa, financeiro (contas a pagar, DRE) e integrações (Nuvemshop, APIs de catálogo).
- Instalável como PWA.

## Capabilities and Constraints

- Stack existente: React + Vite + Tailwind 4, Supabase (Postgres, Auth, Storage, Edge Functions). Idioma da interface: português do Brasil; valores em `R$ 0.000,00`.
- Perfis: dono, caixa, estoquista.
- Fluxos principais: lotes e recebimento, estoque, catálogo pendente, PDV (pagamento misto, item avulso, caixa com sangria/suprimento), dashboard, relatórios, fechamentos, financeiro, usuários, integrações.
- O redesign vale **só para esta versão genérica** do repositório; a loja em produção não muda.
- Precisa manter **tema claro e escuro** com seletor, e funcionar bem **no celular**.

## Brand Commitments

Nenhuma marca é obrigatória. Nome "PDV" e logo atuais podem mudar; as funções não.

## Evidence on Hand

- README.md descreve as funcionalidades reais; o sistema está em uso numa loja real (nome e dados do cliente foram removidos).
- Não existem depoimentos, clientes nomeados, métricas de uso ou preços publicados. Não inventar.

## Product Principles

1. A tela do caixa é rápida antes de ser bonita: nenhuma melhoria visual pode atrasar uma venda.
2. Números de dinheiro (preço, custo, margem, caixa) são o conteúdo principal e precisam ser lidos de relance.
3. A demonstração deve mostrar que é um sistema real, com regras de negócio de verdade, não um template.
4. O mesmo sistema serve o balcão (computador) e o estoque (celular).

## Accessibility & Inclusion

Uso prolongado em balcão: contraste alto nos dois temas, alvos de toque confortáveis no celular, foco visível para quem opera só pelo teclado e leitor.
