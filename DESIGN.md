# Especificação de Interface — PDV Leilão

Referência visual das telas. Complementa o `CLAUDE.md` (que trata de regras de
negócio e dados). Ao implementar ou refatorar uma tela, seguir esta descrição.

---

## Princípios gerais

- **Densidade alta, sem poluição**: o operador usa o sistema o dia inteiro; priorizar
  informação visível sem rolagem em vez de espaçamento generoso.
- **Uma ação principal por tela**, sempre na cor primária — azul royal da Safira
  (decisão #70, supera o preto/branco da #34): `#1D4ED8` claro / `#60A5FA` escuro,
  com sombra suave na própria cor.
- **Hierarquia por tamanho, não por cor**: valores monetários grandes, rótulos pequenos
  em cinza-azulado. Cor só para semântica (verde/vermelho/âmbar); links e emblemas
  sem preenchimento usam `--accent`, que na Safira é a própria primária.
- **Vidro (glass), tema Safira (decisão #70)**: o fundo da página tem três luzes
  azuis difusas (pintadas uma vez só no `body`; telas de tela cheia usam
  `.app-bg`). Painéis são vidro: `.glass` (fundo translúcido `--surface` + aresta
  clara `--glass-border` + sombra `--glass-shadow`) e, nos painéis grandes e
  fixos, `.glass-blur` (desfoque do que está atrás). Lista longa (cards do
  `/estoque`, conferência do lote) usa só `.glass`, sem desfoque — custa caro
  pra rolar e o fundo já é difuso.
- **Modais**: véu `.modal-backdrop` (um tom só, com desfoque) e painel
  `Card raised` (quase opaco, `--surface-raised`) — vidro translúcido sobre o véu
  ficaria cinza. Menus suspensos e toasts também usam `--surface-raised`.
- **Cantos**: painéis em `rounded-panel` (20px); botões e campos em 14px
  (10px no tamanho pequeno); pílulas em `rounded-full`.
- Fonte **Plus Jakarta Sans** (auto-hospedada, só o subconjunto latin), pesos
  400–700.
- Todos os valores em `R$ 0.000,00` (padrão brasileiro).

### Tokens

| Token | Claro | Escuro |
|-------|-------|--------|
| Fundo da página | `#EEF3FB` | `#060B18` |
| Luzes do fundo | `#93C5FD` · `#C7D2FE` · `#BAE6FD` | azul/marinho/petróleo translúcidos |
| Card / superfície (vidro) | branco 62% | branco 6% |
| Superfície elevada (modal, menu suspenso) | branco 94% | `#11192D` 96% |
| Superfície secundária | branco 78% | branco 10% |
| Borda (linhas, campos) | `#0B1B3A` 10% | branco 10% |
| Aresta do vidro | branco 85% | branco 12% |
| Texto principal | `#0B1B3A` | `#EAF0FB` |
| Texto secundário | `#3C4C6B` | `#B9C6DD` |
| Texto suave | `#52627F` | `#8C9AB5` |
| Primária (ação) | `#1D4ED8` | `#60A5FA` |
| Primária, hover | `#1E40AF` | `#93C5FD` |
| Texto sobre primária | `#FFFFFF` | `#06122B` |
| Acento (links e emblemas) | `#1D4ED8` | `#60A5FA` |
| Info (selo importado, preço médio) | `#0E7490` | `#67E8F9` |
| Sucesso (texto) | `#15803D` | `#4ADE80` |
| Alerta/âmbar | `#B45309` | `#FBBF24` |
| Erro (texto) | `#B91C1C` | `#F87171` |
| Erro (fundo) | `#FDE2E2` | vermelho 14% |
| Erro (borda) | `#F5A3A3` | vermelho 40% |

Valores exatos em `src/index.css` (fonte da verdade). Campos usam o token
`--field` (branco 85% / branco 6%).

### Componentes (decisão #71)

Toda tela monta a interface com estas peças — não repetir classes soltas.

| Peça | Onde mora | Como é |
|------|-----------|--------|
| Cabeçalho de tela | `layout/PageHeader` | título 26–30px negrito; complemento ao lado (contador, data, status); ações à direita, descem pra linha de baixo se não couberem; menu do usuário sempre no canto (só desktop) |
| Menu do usuário | `layout/UserMenu` | avatar com iniciais + nome + papel; abre painel com o seletor de tema e "Sair da conta". No celular fica na barra do topo |
| Menu lateral | `layout/AppShell` | trilho de 76px, itens de 48px com ícone de 20px; ativo = preenchimento da primária com sombra; abre no hover (decisão #40) |
| Botão | `ui/Button` | tamanhos `sm` 36px / `md` 48px / `lg` 56px; primário com sombra na cor, secundário com borda, perigo em vermelho tinto, fantasma só texto azul |
| Botão de ícone | `ui/IconButton` | quadrado 36–48px, nome obrigatório (`aria-label`); editar = azul, excluir = vermelho. Substitui "✎ Editar" com borda fina e lixeira solta |
| Campo | classe `.field` / `.field-sm` | 48px (40px no compacto), cantos 14px, foco com anel azul de 4px; `select` com seta própria |
| Campo de bipagem | `scanner/BarcodeInput` | 52px com ícone de leitura; dica "Enter" ou botão ✓ quando há texto |
| Selo | `ui/Badge` | pílula 12px negrito, fundo tinto da cor, ponto opcional. Condição: novo = verde, caixa aberta = azul, usado = neutro, avaria = vermelho |
| Seletor de período | `ui/SegmentedControl` | trilho único com a opção marcada em destaque (Dashboard → Vendas, Usuários, seletor de tema) |
| Filtro liga/desliga | `ui/FilterChip` | pílula 40px; ligada = azul com ✓. No lugar de caixinha de seleção |
| Estado vazio | `ui/EmptyState` | ícone num círculo azul claro, título e uma linha de orientação, borda tracejada |
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

Ícone da marca (mesma marca do `Logo`, reaproveita as mesmas
imagens — troca por tema via CSS, `dark:hidden`/`dark:block`, sem flash)
pulsando: opacidade e escala oscilam suavemente (`@keyframes pulse-soft` em
`src/index.css`, mais suave que o `animate-pulse` padrão do Tailwind, que é
abrupto demais pra um indicador que fica visível por segundos). Fundo
transparente, nunca ocupa a tela inteira: é sempre um indicador inline no
lugar do conteúdo que ainda não chegou (substitui os antigos
"Carregando…"/skeletons genéricos de cada tela — e substitui também o
loader anterior, em onda/SVG, que este componente veio para descontinuar).

- **Cor**: resolvida pela própria troca de imagem por tema (igual ao
  `Logo`) — quase-preto (`#111111`, primária do tema claro) no tema claro,
  branca no escuro (sobre o fundo quase preto do tema escuro, a versão
  escura não teria contraste suficiente).
- **Tamanhos**: `size="md"` (padrão, substitui um "Carregando…" de página
  inteira) e `size="sm"` (inline, ex.: ao lado do campo de bipagem no PDV
  enquanto busca o produto escaneado).
- **Uso**: `<PulseLoader />` — não bloqueia a tela (nunca desabilita outros
  campos/ações só por estar visível; qualquer bloqueio de interação durante
  o carregamento é uma decisão à parte, não vem do loader).

### Logo (`Logo`)

`src/components/ui/Logo.tsx` — mesma lógica de troca por tema: o arquivo
original (`src/assets/logo-branco.png`) é branco com fundo transparente
e some no tema claro, então existe uma variante escura gerada a partir dele
(`src/assets/logo-cor.png`; `npm run generate:icons` regenera a variante e os
ícones do PWA a partir do branco). As duas imagens ficam no DOM e a
troca é só CSS (`dark:hidden`/`dark:block`), sem flash ao alternar tema.
Usada no cabeçalho (`AppShell`) e nas telas de login/cadastro.
