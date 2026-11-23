# Especificação de Interface — Sistema PDV (tema Pétalas)

Referência visual das telas. Complementa o `CLAUDE.md` (que trata de regras de
negócio e dados). Ao implementar ou refatorar uma tela, seguir esta descrição.

---

## Princípios gerais

- **Densidade alta, sem poluição**: o operador usa o sistema o dia inteiro; priorizar
  informação visível sem rolagem em vez de espaçamento generoso.
- **Uma ação principal por tela**, no botão escuro de ação (`--action`, tinta
  `#1B1420` no claro / quase branco no escuro) com brilho rosado e reflexo
  passando (Shimmer Button, Magic UI).
- **Rosa é a cor da marca** (`--primary`, `#C4306A` claro / `#FF7AA6` escuro):
  seleção, item ativo do menu, links e gráficos. Nunca em blocos grandes.
- **Hierarquia por tamanho, não por cor**: valores monetários grandes, rótulos pequenos
  em cinza-ameixa. Cor só para semântica (verde/vermelho/âmbar).
- **Vidro sobre pétalas, tema Pétalas** (substitui o tema Safira): o fundo da
  página tem quatro manchas desfocadas (rosa, pêssego, lilás, menta) e pétalas e
  folhas grandes em silhueta (`.petal-field`, no `index.html`, fixo atrás de
  todas as telas). Painéis são vidro: `.glass` (fundo translúcido `--surface` +
  aresta de luz em `inset` + sombra macia) e, nos painéis grandes e fixos,
  `.glass-blur`. Lista longa usa só `.glass`, sem desfoque.
- **Vidro d'água** (`.liquid`): refração real do fundo via filtro SVG `#water`
  (no `index.html`). Só no menu lateral, no dock do celular e em painéis de
  destaque. O Chromium aplica a refração; nos outros navegadores fica o vidro
  fosco (a classe `.water` no `<html>` é ligada pelo `ThemeProvider`).
- **Efeitos Magic UI, recriados em CSS** (sem dependência nova): Magic Card
  (borda acende onde o cursor passa, no `Card`), Shimmer Button (botão
  primário), Number Ticker (`ui/NumberTicker`, números do Dashboard), Blur Fade
  (`.blur-fade`, entrada dos blocos), Border Beam (`.beam`, feixe na borda de um
  painel de destaque) e troca de tema com revelação circular. Todos respeitam
  "reduzir movimento".
- **Tema claro é o padrão** (migration 0023). Escuro e Automático continuam no
  menu do usuário.
- **Modais**: véu `.modal-backdrop` (um tom só, com desfoque) e painel
  `Card raised` (quase opaco, `--surface-raised`). Menus suspensos e toasts
  também usam `--surface-raised`.
- **Cantos**: painéis em `rounded-panel` (24px), menu lateral 28px; botões em
  pílula (`rounded-full`); campos em 14px.
- Fonte **Geist** (auto-hospedada via `@fontsource/geist`, só o subconjunto
  latin), pesos 400–700. Títulos de tela 28–36px com espaçamento -0,035em.
- Todos os valores em `R$ 0.000,00` (padrão brasileiro).

### Tokens

| Token | Claro | Escuro |
|-------|-------|--------|
| Fundo da página | `#FBF6F8` | `#0C0A10` |
| Manchas do fundo | `#FFB3CB` · `#FFD0A8` · `#CBB8FF` · `#A8ECD0` | versões profundas das mesmas |
| Card / superfície (vidro) | branco 50% | ameixa 46% |
| Superfície elevada (modal, menu suspenso) | branco 95% | `#20192A` 96% |
| Chip de vidro (item ativo, secundário) | branco 72% | branco 8% |
| Borda (linhas, campos) | `#1B1420` 9% | branco 9% |
| Aresta do vidro | branco 85% | branco 16% |
| Texto principal | `#1B1420` | `#F5F0F7` |
| Texto secundário | `#4A4050` | `#CDC4D4` |
| Texto suave | `#625868` | `#A99FB2` |
| Ação (botão primário) | `#1B1420` | `#F5F0F7` |
| Primária / marca (seleção, links) | `#C4306A` | `#FF7AA6` |
| Pêssego (gradiente da marca) | `#F07A3E` | `#FFAD7D` |
| Info (selo importado, preço médio) | `#6A4FD8` | `#B29DFF` |
| Sucesso | `#10845C` | `#3FD39B` |
| Alerta/âmbar | `#B36B00` | `#FFBD45` |
| Erro | `#C62F2F` | `#FF6B6B` |

Valores exatos em `src/index.css` (fonte da verdade).

### Componentes (decisão #71)

Toda tela monta a interface com estas peças — não repetir classes soltas.

| Peça | Onde mora | Como é |
|------|-----------|--------|
| Cabeçalho de tela | `layout/PageHeader` | título 28–36px negrito; complemento ao lado (contador, data, status); ações à direita, descem pra linha de baixo se não couberem; menu do usuário sempre no canto (só desktop) |
| Menu do usuário | `layout/UserMenu` | avatar com iniciais + nome + papel; abre painel com o seletor de tema e "Sair da conta". No celular fica na barra do topo |
| Menu lateral | `layout/AppShell` | painel de vidro d'água de 240px, flutuando a 16px das bordas, sempre aberto com rótulos; ativo = chip de vidro com ícone rosa. No celular vira um dock de vidro flutuante embaixo |
| Botão | `ui/Button` | tamanhos `sm` 36px / `md` 48px / `lg` 56px; pílulas; primário escuro com reflexo (Shimmer), secundário em chip de vidro, perigo em vermelho tinto, fantasma só texto rosa |
| Botão de ícone | `ui/IconButton` | círculo de vidro 36–48px, nome obrigatório (`aria-label`); editar = rosa, excluir = vermelho. Substitui "✎ Editar" com borda fina e lixeira solta |
| Campo | classe `.field` / `.field-sm` | 48px (40px no compacto), cantos 14px, foco com anel rosa de 4px; `select` com seta própria |
| Campo de bipagem | `scanner/BarcodeInput` | 52px com ícone de leitura; dica "Enter" ou botão ✓ quando há texto |
| Selo | `ui/Badge` | pílula 12px negrito, fundo tinto da cor, ponto opcional. Condição: novo = verde, caixa aberta = rosa, usado = neutro, avaria = vermelho |
| Seletor de período | `ui/SegmentedControl` | trilho de vidro com a opção marcada em pílula escura (Dashboard → Vendas, Usuários, seletor de tema) |
| Filtro liga/desliga | `ui/FilterChip` | pílula 40px; ligada = rosa com ✓. No lugar de caixinha de seleção |
| Estado vazio | `ui/EmptyState` | ícone num círculo rosa claro, título e uma linha de orientação, borda tracejada |
| Aviso (toast) | `ui/Toast` | painel elevado com ícone num círculo verde/vermelho |

Títulos de seção: 17px negrito. Rótulos de grupo e de coluna: 11–12px,
maiúsculo, espaçado, texto suave. Rótulo de campo: 13px seminegrito.

---

## 1. PDV — tela de venda (desktop, prioridade máxima)

**Layout**: duas colunas — carrinho à esquerda (~62%), painel de pagamento à
direita (~38%). Sem menu lateral visível durante a venda (tela limpa para o caixa).

**Topo**: ícone de carrinho + "Venda em andamento" à esquerda; à direita, badge verde
claro "Caixa aberto · [nome do operador]" e o relógio.

**Campo de bipagem**: barra larga logo abaixo do topo, fundo em superfície
secundária, ícone de código de barras à esquerda, placeholder
"Bipe o código ou digite o código interno…". **Sempre com foco automático** —
qualquer digitação vai para ele, mesmo depois de clicar em outro lugar.

**Tabela do carrinho**: colunas Item | Qtd | Unit. | Total | (lixeira).
Cada linha tem duas informações: nome do produto em peso 500 e, abaixo em
11px cinza, "Lote 0000-000 · [condição]". Valores alinhados à direita.
Item recém-bipado entra no topo com destaque breve (200ms) para o operador
confirmar visualmente que entrou.

**Painel de pagamento** (card à direita):
- Subtotal e Desconto (com o atalho "F4" em cinza ao lado do rótulo)
- Linha separadora, depois "Total" com o valor em ~26px
- Grade 2×2 de formas de pagamento (Dinheiro, Pix, Crédito, Débito), cada uma
  um card quadrado com ícone acima do rótulo; a selecionada ganha borda de 2px
- Botão "Finalizar venda" na cor primária, largura total, com ícone de check e o
  atalho "F2" menor ao lado
- Abaixo, botão "Cancelar venda" discreto, apenas contorno vermelho
- Rodapé em 11px cinza: "ESC cancela item · F6 sangria · F8 fechar caixa"

---

## 2. Recebimento de mercadoria (mobile, dois passos)

Tela de uso em pé, no estoque, com uma mão. Alvos de toque grandes (mín. 44px).

**Cabeçalho fixo**: seta de voltar, ao centro "Lote 0000-000" com
"[leiloeiro] · R$ 0.000,00" abaixo em 11px, e à direita um badge com a
contagem de itens já cadastrados no lote.

### Passo 1 — validação visual
- **Foto do catálogo em destaque**, ocupando ~150px de altura, largura total,
  fundo em superfície secundária
- Abaixo, centralizados: nome do produto (13px, peso 500) e, em 11px cinza,
  "EAN 0000000000000 · [marca] · [nacional|importado]"
- Pergunta centralizada em peso 500: "Confere com o item físico?"
- Dois botões lado a lado: **"Não é este"** (contorno vermelho, ícone X) e
  **"Confere"** (cor primária, ícone de check). O positivo sempre à direita.
- Se a API não retornou foto: substituir o bloco por um botão grande
  "Tirar foto do produto" — obrigatório antes de prosseguir.

### Passo 2 — precificação
- Cabeçalho compacto do item: miniatura 42px à esquerda, nome, código e
  selo de origem ("importado · via UPCitemdb" em azul claro, quando aplicável)
- **Card de referência de mercado**: rótulo em 11px
  "Preço no mercado (Mercado Livre, N anúncios)" e três valores lado a lado —
  Menor / Médio / Maior, com o Médio destacado em azul
- Dois campos lado a lado: "Seu preço de venda" (borda de 2px, é o campo em foco)
  e "Margem estimada" (somente leitura, verde quando positiva, calculada em
  tempo real contra o custo rateado do lote)
- Seletor de condição em pílulas: Novo · Caixa aberta · Avaria · Usado
  (a selecionada com borda de 2px). **Avaria torna a foto própria obrigatória.**
- Quantidade com controles − / +
- Faixa âmbar quando `ncm_pending`: "Sem NCM — classificar com o contador (importado)"
- Botão "Confirmar e próximo" na cor primária, largura total
- Rodapé em 11px cinza: último item cadastrado à esquerda, rateio médio atual
  à direita

Após confirmar, volta direto para a câmera do passo 1 — o fluxo é contínuo,
sem telas intermediárias.

---

## 3. Conferência do lote (desktop)

**Cabeçalho**: "Lote 0000-000 · [leiloeiro]" com data e status abaixo; à direita,
badge âmbar "N itens a revisar" quando houver.

**Faixa de 4 indicadores** (cards lado a lado, iguais): Valor pago · Itens ·
Venda projetada · Margem projetada (esta em verde). Rótulo pequeno em cima,
número grande embaixo.

**Lista de itens em cards** (exceção à densidade da seção "Princípios gerais",
decisão #31 do CLAUDE.md): um card por item — `rounded-2xl`, `shadow-sm`,
`border`, `p-4` — em vez da tabela densa das outras telas. Cada card:
- Cabeçalho: nome exibido (apelido, se houver, senão nome do catálogo — ver
  decisão #30), EAN/código interno em monospace, badge "apelido" quando
  aplicável, botão "✎ Definir/Editar apelido" (qualquer papel, sem
  confirmação) e "Remover apelido" quando já definido
- Grade de campos abaixo, separada por borda superior: Condição (select) |
  Qtd | Preço venda | Validade — editáveis inline, recalculando o rateio da
  página ao sair do campo — e Custo rateado | Referência, somente leitura
- Condição diferente de "novo" fica visível no próprio select
- Botão "Separar unidade" (ícone de tesoura) quando `quantity > 1`

**Rodapé**: à esquerda, em 12px cinza, a validação do rateio
"Soma dos custos rateados = R$ 0.000,00 (bate com o valor pago)" — se não bater,
mostrar em vermelho e bloquear o fechamento. À direita, botão
"Fechar lote e liberar para venda" na cor primária com ícone de cadeado.

---

## 4. Dashboard (desktop)

**Faixa de 4 indicadores**: Vendas hoje (com variação vs. ontem em verde/vermelho) ·
Vendas no mês (com contagem de vendas) · Margem real do mês (verde) ·
Estoque parado (âmbar, com "+60 dias sem venda").

**Bloco "Desempenho por lote"**: uma linha por lote, cada uma com
- nome do lote à esquerda e "recuperado N%" à direita (verde acima de 100%,
  cinza em andamento, âmbar quando parado)
- **barra de progresso** de 6px mostrando o percentual do valor pago já recuperado
- linha de 11px cinza: "Pago R$ X · vendido R$ Y · restam N itens (R$ Z projetados)"

A barra é a informação central desta tela: mostra de relance quais lotes já se
pagaram e quais estão encalhando.

---

## 5. Fechamento de caixa (modal centrado, ~420px)

Lista vertical de linhas rótulo/valor, separadas por borda fina, na ordem:
Pix · Cartões · Dinheiro (vendas) · Fundo de troco inicial · Sangrias (em vermelho,
com a contagem entre parênteses).

Depois, card destacado em superfície secundária: **"Dinheiro esperado na gaveta"**
com o valor em 18px.

Campo de entrada "Dinheiro contado" e, abaixo, faixa colorida com a **diferença**:
verde quando zero, vermelha quando há quebra, mostrando "— R$ 0,00".

Botão "Fechar caixa e registrar diferença" na cor primária, largura total, ícone de
cadeado.

---

## 6. Estoque — `/estoque` (desktop)

Mesma exceção de densidade da seção 3 (decisão #31): lista de cards, um por
item, em vez de tabela.

**Filtros**: card no topo com busca (nome, EAN ou código interno) e três
checkboxes — "Só disponíveis", "Vencendo em 90 dias", "Acima da referência".

**Card por item** (`rounded-2xl`, `shadow-sm`, `border`, `p-4`):
- Cabeçalho: nome exibido (apelido → catálogo, decisão #30) com EAN/código
  interno em monospace abaixo; botão "✎ Editar nome" (só quando há
  `product_catalog`, restrito ao dono dentro do modal, com confirmação —
  decisão #30); botão de excluir (lixeira, só dono) no canto superior direito
- Grade de campos somente leitura, separada por borda superior: Lote (link
  pro lote) · Condição · Disponível · Preço venda · Validade (cor de alerta
  quando vencido/perto de vencer) · Custo rateado · Referência (verde/âmbar/
  vermelho conforme comparação com o preço de venda, decisão #23)

---

## Comportamentos transversais

- **Alternador de tema**: ícone de lua/sol no canto superior direito do app,
  abrindo menu com Claro / Escuro / Automático. Preferência salva por usuário.
- **Estados vazios**: ilustração simples com ícone, uma frase explicativa e o
  botão da ação principal (ex.: "Nenhum lote em conferência" + "Criar lote").
- **Carregamento**: componente padrão `PulseLoader`
  (`src/components/ui/PulseLoader.tsx`) — nunca spinner de tela cheia nem
  texto solto "Carregando…", a tela não pode "sumir" durante o uso. Usado em
  toda troca de tela/lista que depende de uma consulta (ver seção
  "Loader padrão" abaixo).
- **Erros de API de catálogo**: nunca travar o fluxo; cair para o cadastro manual
  com aviso discreto em âmbar.

### Carregamento de conteúdo: esqueletos (`components/ui/Skeleton.tsx`)

Desde a decisão #73, **todo conteúdo que ainda não chegou** (lista, tabela,
cards de número, página inteira) aparece como a **forma dele em cinza
pulsando**, no lugar do `PulseLoader` — escolha do dono: a logo sozinha num
espaço vazio não lia como carregamento numa espera de segundos.

- **Faixas** em `bg-ink/10` com `animate-pulse` (`SkeletonBar`): acompanha o
  tema sozinho e aparece sobre o vidro no claro (o `surface-secondary` some).
- **Peças prontas**: `SkeletonRows` (tabela/lista), `SkeletonKpis` (cards de
  número; `glass` = moldura do `StatCard`), `SkeletonCards` (cards de
  conteúdo: lotes, fechamentos), `SkeletonPanel` (painel de vidro com linhas)
  e `SkeletonStatus` (envelope acessível: o leitor de tela ouve um
  "Carregando …" só, as faixas ficam escondidas dele).
- **Formato do conteúdo real**: o esqueleto copia a moldura e o arranjo do
  que vai entrar (mesma grade, mesmo número de colunas), pra a tela não
  pular quando os dados chegam. Telas com forma própria montam o seu com
  `SkeletonBar` (card do `/estoque`, PDV, tela do lote).
- O cabeçalho da página continua visível; onde há contagem (ex.: "N itens"),
  ela vira "carregando…".

O `PulseLoader` abaixo fica só pro **indicador inline de ação** (ex.: ao
lado do campo de bipagem do PDV enquanto busca o código), não pra conteúdo.

### Loader padrão (`PulseLoader`)

O símbolo da marca (flor no quadrado com gradiente rosa → pêssego, o mesmo do
`Logo`) pulsando: opacidade e escala oscilam suavemente (`@keyframes
pulse-soft` em `src/index.css`). Fundo transparente, nunca ocupa a tela
inteira: é sempre um indicador inline no lugar do conteúdo que ainda não
chegou. Tamanhos `md` (padrão) e `sm` (inline, ex.: ao lado do campo de
bipagem). Não bloqueia a tela.

### Logo (`Logo`)

`src/components/ui/Logo.tsx`: símbolo em SVG (flor desenhada em traço branco
sobre gradiente rosa → pêssego, cantos de 11px) + o nome "Sistema PDV" em Geist
negrito. Como é SVG e texto, segue o tema sozinho. `showName={false}` mostra só
o símbolo. Os PNGs antigos em `src/assets/` ficam só para o script de ícones do
PWA (`npm run generate:icons`).
