# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Equipe da loja** (dono, caixa, estoquista): usa o sistema interno o dia todo no
  balcão e no estoque — vender, receber mercadoria, fechar caixa, ver relatórios.
- **Cliente da floricultura** (vitrine pública `/loja`): quase sempre no celular,
  muitas vezes vindo do Instagram, escolhendo flores para presentear alguém numa
  data ou ocasião. Quer ver o que tem, quanto custa, e mandar o pedido sem criar
  conta.

## Product Purpose

Sistema de estoque e PDV para uma loja física, agora usado pela floricultura
**Lú-Bia Flores** (Jandira-SP). A vitrine `/loja` mostra ao cliente o que está
disponível no estoque real e transforma a escolha num pedido enviado pelo
WhatsApp da loja, onde o atendimento confirma, combina pagamento e entrega.

Sucesso da vitrine: o cliente monta o pedido em poucos toques e a loja recebe no
WhatsApp uma mensagem completa, sem precisar perguntar de novo nome, endereço,
data, cartão ou forma de pagamento.

## Positioning

A vitrine lê o mesmo estoque do balcão: só aparece o que existe e não venceu.
Não há carrinho com pagamento online; o fechamento é humano, no WhatsApp, como a
loja já atende hoje.

## Operating Context

- A loja atende e entrega via WhatsApp há anos; o pedido do site chega lá.
- Produtos entram pelo fluxo de recebimento do sistema (foto, preço, validade);
  flores têm validade curta e item vencido não pode ser vendido.
- Duas lojas em Jandira-SP; família no ramo há cerca de 30 anos (fonte: página
  pública da loja no Facebook/Instagram).

## Capabilities and Constraints

- Vitrine pública sem login, rota `/loja` dentro do app React existente.
- Leitura pública só por função no banco que devolve campos seguros (nome, preço,
  foto, disponibilidade). Custo, lote e fornecedor nunca saem para o público.
- Pedido no WhatsApp inclui: itens e quantidades, total estimado, nome e telefone,
  entrega ou retirada (com endereço), data/horário desejado, mensagem do cartão e
  forma de pagamento (Pix, cartão ou dinheiro).
- O pedido do site **não** baixa estoque nem cria venda; a loja lança no PDV ao
  confirmar.
- Taxa de entrega e área atendida: **não definidas** — combinadas no WhatsApp.
- Número do WhatsApp: configurado por variável de ambiente (`VITE_LOJA_WHATSAPP`).

## Brand Commitments

- Nome: **Lú-Bia Flores**. Linha da loja: buquês de flores, cestas e chocolates.
- Logo oficial da loja ainda não está no repositório.

## Evidence on Hand

- Sem depoimentos, avaliações, número de clientes ou fotos próprias no repositório.
  Não inventar nenhum deles. Fotos dos produtos vêm do cadastro no estoque.

## Product Principles

1. Mostrar só o que é verdade agora: disponível, com preço e foto do estoque real.
2. O WhatsApp é o caixa da vitrine: a mensagem tem que chegar completa e legível.
3. Celular primeiro; o cliente está escolhendo um presente, não operando um sistema.
4. Nada interno vaza para o público.

## Accessibility & Inclusion

WCAG 2.1 AA na vitrine pública: contraste, alvos de toque de 44px, navegação por
teclado e leitores de tela no carrinho e no formulário.
