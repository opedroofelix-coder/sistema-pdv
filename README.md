# Sistema PDV

Sistema de **estoque e ponto de venda (PDV)** para lojas que compram mercadoria
**por lote** (por exemplo, em leilão) e revendem **item a item** no balcão e na
loja virtual. Funciona no navegador e pode ser instalado como aplicativo (PWA):
o computador do caixa vende, o celular do estoquista recebe mercadoria.

> Este repositório é uma versão genérica de um sistema que desenvolvi e que está
> em uso em produção numa loja real. Nome, marca e qualquer dado do cliente
> foram removidos; o código é o mesmo.

## Funcionalidades

**Entrada de mercadoria**
- Cadastro de lotes (fornecedor, valor pago, data) com fechar, reabrir, editar e excluir.
- Recebimento item a item lendo o código de barras pela **câmera do celular** (ZXing)
  ou por **leitor USB/Bluetooth**.
- Preenchimento automático de nome, marca, foto e NCM por APIs de catálogo, com
  conferência visual da foto antes de confirmar.
- Cadastro manual para itens sem código, com código interno e etiqueta impressa.
- Mesmo produto no mesmo lote soma quantidade em vez de duplicar a linha.

**Custeio por lote (regra central)**

```
custo do item = valor pago no lote × (preço de venda do item ÷ soma dos preços de venda do lote)
```

O rateio é recalculado no banco (trigger) sempre que o lote muda, enquanto o item
não foi vendido. Na venda, o custo vigente é **congelado** no item vendido, então a
margem histórica não muda depois.

**PDV**
- Venda por bipagem ou busca por nome, item avulso ("diversos") sem código.
- Dinheiro com troco, PIX, débito, crédito e **pagamento misto** (várias formas na mesma venda).
- Venda gravada numa **transação única** no Postgres (venda, itens, pagamentos e baixa de estoque).
- **Modo offline**: se a internet cai, a venda é concluída localmente (IndexedDB) e
  sincronizada depois, sem duplicar.
- Caixa por operador: abertura, sangria, suprimento e fechamento com conferência
  (esperado × contado).
- Cupom não fiscal para impressora térmica de 80 mm, com reimpressão pelo histórico.
- Bloqueio de venda de item vencido (liberação só pelo dono, checada no servidor).

**Gestão**
- Dashboard: vendas do dia e do mês, filtro por período, recorde de vendas,
  margem por lote e totais do estoque.
- Módulo financeiro: contas a pagar, despesas fixas recorrentes, fluxo de caixa e
  DRE com lucro líquido (taxas de cartão com vigência).
- Relatório de fechamentos de caixa, painel de usuários (troca de senha,
  ativar/desativar) e histórico por produto.
- Perfis de acesso: **dono**, **caixa** e **estoquista**.

**Vitrine pública com pedido pelo WhatsApp (`/loja`)**
- Catálogo para o cliente, sem login, lido do estoque real: só aparece o que tem
  saldo, está ativo e não venceu. Itens iguais de lotes diferentes viram um só.
- Leitura pela função `public_catalog()` (security definer): sai só nome, preço,
  foto e quantidade disponível. Custo, lote e fornecedor nunca vão para o público.
- Categorias pelo nome (buquês, cestas, arranjos, plantas, chocolates), busca e
  sacola salva no aparelho.
- Fechamento: nome, telefone, entrega ou retirada (endereço e quem recebe), dia e
  horário, mensagem do cartão e forma de pagamento. O resumo abre no WhatsApp da
  loja; nada é cobrado nem baixado do estoque até a loja confirmar no PDV.
- Configuração: `VITE_LOJA_WHATSAPP` (número com DDD), e opcionais
  `VITE_LOJA_NOME`, `VITE_LOJA_CIDADE`, `VITE_LOJA_INSTAGRAM`.

**Integrações**
- **Loja virtual (Nuvemshop)**: estoque único entre balcão e site. Mudanças de
  estoque entram numa fila no banco e são enviadas por Edge Function; pedido pago
  no site vira venda no sistema e cancelamento devolve o estoque (webhooks com
  verificação HMAC).
- **Catálogo**: cascata Cosmos → UPCitemdb → Open Beauty Facts → Open Food Facts,
  roteada pelo prefixo do código (nacional ou importado), com cache local, fila de
  reprocessamento diário e painel de saúde de cada fonte.

## Destaques técnicos

- **Regras de negócio no banco**: venda, cancelamento, fechamento de caixa e ações de
  lote são funções (RPC) no Postgres, com checagem de permissão no servidor.
- **Chaves de API nunca no navegador**: todas as chamadas externas rodam em
  Supabase Edge Functions (Deno).
- **Paginação contra o limite de 1.000 linhas do PostgREST**: listagens e relatórios
  buscam em páginas, para não truncar dados em silêncio.
- **Tema claro/escuro** com efeito vidro, design tokens e biblioteca de componentes
  própria (ver [`DESIGN.md`](DESIGN.md)).
- **Testes**: 149 testes unitários (Vitest), 53 testes das Edge Functions (Deno) e
  11 arquivos de testes ponta a ponta (Playwright) cobrindo recebimento, venda, caixa,
  pagamento misto, lotes, permissões e financeiro.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router, PWA |
| Leitura de código | `@zxing/browser` (câmera) e leitor físico (teclado) |
| Backend | Supabase: PostgreSQL, Auth, Storage, RLS, Edge Functions (Deno), pg_cron |
| Monitoramento | Sentry |
| Testes | Vitest, Deno test, Playwright |
| Deploy | Vercel (frontend) e Supabase (banco e funções) |

## Estrutura

```
src/
  pages/          telas (PDV, Estoque, Lotes, Dashboard, Financeiro, ...)
  components/     componentes por área (pdv, receiving, finance, reports, ui, ...)
  lib/            acesso a dados e regras puras (com testes *.test.ts)
  contexts/       autenticação, tema e avisos (toast)
supabase/
  migrations/     schema, regras de negócio (RPC), triggers e RLS
  functions/      Edge Functions (catálogo, Nuvemshop, admin de usuários)
e2e/              testes ponta a ponta (Playwright)
```

## Como rodar localmente

Pré-requisitos: Node 20+, Docker e a [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start            # sobe Postgres/Auth/Storage locais e aplica as migrations
cp .env.example .env.local
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com o que o `supabase start` mostrou
npm run dev               # http://localhost:5173
```

O **primeiro usuário cadastrado** vira **dono**; os seguintes entram como estoquista.

As integrações externas são opcionais: sem as chaves, o sistema funciona e o
cadastro de produto cai no preenchimento manual. Os secrets das Edge Functions
estão descritos no [`.env.example`](.env.example).

## Testes

```bash
npm run test:unit                                   # Vitest
deno test --allow-net supabase/functions/_shared    # Edge Functions
npm run test:e2e                                    # Playwright (precisa do Supabase local rodando)
npm run lint && npx tsc -b
```

## Observação

Alguns comentários do código citam "decisão #N": referem-se ao registro interno de
decisões mantido durante o desenvolvimento do projeto original, que não faz parte
desta versão pública.
