# Site da floricultura

Vitrine com catálogo, sacola e checkout que **envia o pedido pronto para o
WhatsApp da loja**. Sem backend: é um site estático (Vite + React) que pode
ir para a Vercel como projeto separado (Root Directory = `floricultura`).

## O que tem

- **Catálogo** com fotos, filtro por categoria e por ocasião, favoritos e
  animação do produto "voando" até a sacola.
- **Monte seu buquê**: o cliente escolhe flores (por haste), embalagem, fita,
  extras e mensagem do cartão; o preço é calculado na hora e o buquê entra na
  sacola com a composição, que vai detalhada na mensagem do WhatsApp.
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

As fotos ficam em `src/assets/fotos/` (JPG, ~1000px). São fotos ilustrativas
de bancos de imagem livres (CC0); a origem de cada uma está em
`src/assets/fotos/CREDITOS.json`. Para usar as fotos da loja, substitua o
arquivo mantendo o nome (ex.: `p-peonias.jpg`) ou mude a chave `photo` do
produto em `src/data/products.ts`. Flores e preços do "Monte seu buquê" ficam
no mesmo arquivo, em `BUILDER`.

## Rodar

```bash
cd floricultura
npm install
npm run dev      # http://localhost:5173
npm test         # testes da montagem do pedido
npm run build
```
