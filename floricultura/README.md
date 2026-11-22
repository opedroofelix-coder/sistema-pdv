# Site da floricultura

Vitrine com catálogo, sacola e checkout que **envia o pedido pronto para o
WhatsApp da loja**. Sem backend: é um site estático (Vite + React) que pode
ir para a Vercel como projeto separado (Root Directory = `floricultura`).

## O que tem

- **Catálogo** com filtro por categoria e por ocasião, ilustrações vetoriais
  geradas por produto (ou foto real, se preencher `image`).
- **Sacola** que fica salva no navegador, com quantidades e total.
- **Checkout em 2 passos**: entrega ou retirada, endereço, data e período,
  mensagem do cartão, forma de pagamento. Taxa de entrega com frete grátis a
  partir de um valor.
- **Envio pelo WhatsApp**: abre `wa.me` com o resumo formatado (itens,
  subtotal, entrega, total, dados do cliente). A loja confirma e cobra por lá.
- **Animações**: Lenis (rolagem suave) + GSAP ScrollTrigger (hero que
  "floresce", faixa que acelera com a rolagem, seção de ocasiões fixa com
  rolagem horizontal, manifesto que acende palavra a palavra), Motion
  (sacola, filtros, contador), cursor com rótulo e botões magnéticos.
  Tudo respeita `prefers-reduced-motion`.

## Onde mexer

| O quê | Arquivo |
|---|---|
| Nome, WhatsApp, endereço, horário, taxa de entrega, formas de pagamento | `src/config.ts` |
| Produtos, preços, descrições, categorias e ocasiões | `src/data/products.ts` |
| Texto da mensagem do WhatsApp | `src/lib/order.ts` |
| Cores e fontes | `src/styles.css` (bloco `:root`) |

Para usar foto real num produto, coloque o arquivo em `public/fotos/` e
preencha `image: '/fotos/nome.jpg'` no produto.

## Rodar

```bash
cd floricultura
npm install
npm run dev      # http://localhost:5173
npm test         # testes da montagem do pedido
npm run build
```
