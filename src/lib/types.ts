export type LotStatus = 'receiving' | 'closed'
export type StockItemCondition = 'novo' | 'caixa_aberta' | 'avaria' | 'usado'
export type CatalogSource = 'cosmos' | 'upcitemdb' | 'openbeautyfacts' | 'off' | 'manual'
export type ProductOrigin = 'nacional' | 'importado'
export type EnrichmentStatus = 'resolved' | 'pending' | 'manual'
export type PaymentMethod = 'dinheiro' | 'pix' | 'credito' | 'debito'

/** O que `sales.payment_method` pode conter (decisão #53): a forma única da
 * venda, ou `'misto'` quando ela foi dividida entre várias -- nesse caso o
 * detalhe vive em `sale_payments`. */
export type SalePaymentMethod = PaymentMethod | 'misto' | 'online'

/** Forma gravada numa parcela: as quatro do PDV + `online`, que é como a venda
 * do site (pedido pago na Nuvemshop, decisão #66) entra. `online` nunca é
 * oferecida no PDV -- o PDV tem a própria lista de formas. */
export type RecordedPaymentMethod = PaymentMethod | 'online'

/** Canal da venda (decisão #66): balcão ou pedido pago na Nuvemshop. */
export type SaleChannel = 'loja' | 'site'

/** Uma parcela do pagamento de uma venda (decisão #53). Venda em forma única
 * também gera uma linha, pra os relatórios lerem sempre daqui. */
export interface SalePayment {
  id: string
  sale_id: string
  method: RecordedPaymentMethod
  amount: number
  created_at: string
}

/** Parcela já gravada, como o comprovante lê (pode ser `online`, da venda do
 * site). `PaymentSplit` cabe aqui -- é o caso do PDV. */
export interface RecordedPaymentSplit {
  method: RecordedPaymentMethod
  amount: number
}

/** Parcela como o PDV monta antes de mandar pro `create_sale`. */
export interface PaymentSplit {
  method: PaymentMethod
  amount: number
}
export type SaleStatus = 'completed' | 'cancelled'
export type CashMovementType = 'sangria' | 'suprimento'

/** Preço de referência de mercado (Mercado Livre), com cache de 30 dias. */
export interface ReferencePrice {
  min: number
  avg: number
  max: number
}

export interface Lot {
  id: string
  store_id: string
  supplier: string | null
  purchase_value: number
  purchase_date: string
  notes: string | null
  status: LotStatus
  created_at: string
}

export interface ProductCatalog {
  id: string
  ean: string | null
  name: string | null
  brand: string | null
  photo_url: string | null
  ncm: string | null
  cest: string | null
  source: CatalogSource | null
  origin: ProductOrigin | null
  ncm_pending: boolean
  ref_price_min: number | null
  ref_price_avg: number | null
  ref_price_max: number | null
  ref_price_updated_at: string | null
  /** Plano B do preço de referência (decisão #23): preço único que o
   * operador digitou depois de olhar no site do Mercado Livre -- via
   * automática do ML foi encerrada (busca de produtos bloqueada por
   * política deles mesmo autenticado, decisão #22). */
  manual_ref_price: number | null
  manual_ref_price_updated_at: string | null
  needs_review: boolean
  enrichment_status: EnrichmentStatus
  enrichment_attempts: number
  enrichment_last_attempt_at: string | null
  /** Exclusão lógica (ajuste de UX): false quando excluído mas com histórico
   * de venda vinculado -- some das listas, preserva o dado pros relatórios. */
  active: boolean
  created_at: string
}

export interface StockItem {
  id: string
  lot_id: string
  catalog_id: string | null
  internal_code: string | null
  condition: StockItemCondition | null
  quantity: number
  quantity_sold: number
  sale_price: number
  allocated_cost: number
  photos: string[]
  expiry_date: string | null
  /** Apelido opcional, só desta peça neste lote (decisão #30). Se
   * preenchido, tem prioridade sobre `product_catalog.name` na exibição --
   * ver `stockItemDisplayName`. Livre para qualquer papel editar. */
  nickname: string | null
  /** Mesma exclusão lógica do catálogo, ver `ProductCatalog.active`. */
  active: boolean
  created_at: string
  product_catalog?: ProductCatalog | null
  lot?: Pick<Lot, 'id' | 'supplier' | 'status'> | null
}

export interface Sale {
  id: string
  store_id: string
  cashier_id: string | null
  session_id: string | null
  total: number
  discount: number
  /** Forma única, ou `misto` quando dividida entre várias (decisão #53). */
  payment_method: SalePaymentMethod | null
  status: SaleStatus
  created_at: string
  /** `site` = pedido pago na Nuvemshop (decisão #66). Ausente na venda
   * sintetizada da fila offline, que é sempre da loja. */
  channel?: SaleChannel
  /** Número do pedido na Nuvemshop (só vendas do site). */
  external_order_number?: string | null
  idempotency_key?: string | null
  /** Só existe no objeto sintetizado no cliente enquanto a venda ainda não sincronizou. */
  pending?: boolean
}

export interface SaleItem {
  id: string
  sale_id: string
  stock_item_id: string
  quantity: number
  unit_price: number
  cost_at_sale: number
}

/** Linha do comprovante já normalizada -- serve tanto pra item de estoque
 * quanto pra item avulso (Branch 5), sem o comprovante conhecer StockItem.
 * Fica aqui (e não no componente Receipt) pra `sales.ts` montá-la a partir de
 * uma venda já gravada sem uma lib importar de um componente. */
export interface ReceiptLine {
  key: string
  name: string
  unitPrice: number
  quantity: number
}

export interface CashSession {
  id: string
  cashier_id: string | null
  opened_at: string
  closed_at: string | null
  opening_amount: number
  closing_amount: number | null
  expected_amount: number | null
}

export interface LotMarginReport {
  lot_id: string
  supplier: string | null
  purchase_value: number
  status: LotStatus
  revenue: number
  cost_of_sold: number
  remaining_stock_value: number
  remaining_units: number
}

/** Totais do estoque no Dashboard (decisão #50): quantas unidades estão
 * disponíveis e quanto elas valem pelo preço de venda. Substituiu os totais
 * do antigo relatório de estoque parado, que dependiam de um limiar de dias. */
export interface StockTotals {
  units: number
  saleValue: number
}

/** Resumo de vendas por período (Branch 3): faturamento, lucro (com custo
 * congelado), nº de vendas, ticket médio e o melhor dia do período. */
export interface SalesSummary {
  revenue: number
  /** Parte do faturamento que veio do site (decisão #66); o resto é da loja. */
  siteRevenue: number
  profit: number
  count: number
  avgTicket: number
}

/** Dia de maior faturamento (decisão #51): o recorde é de TODA a operação,
 * não do período escolhido no seletor de Vendas -- por isso vive fora do
 * `SalesSummary`, que é sempre relativo ao intervalo selecionado. */
export interface SalesDayTotal {
  date: string
  total: number
}

export type CatalogLookupSource = 'cache' | 'cosmos' | 'upcitemdb' | 'openbeautyfacts' | 'off'
export type CatalogLookupOutcome = 'hit' | 'miss' | 'error'

/** Uma linha por fonte efetivamente consultada (não por lookup) -- ver
 * comentário da tabela na migration 0006. "Não encontrado" não é um source:
 * aparece como uma sequência de linhas outcome='miss' sem nenhum 'hit'. */
export interface CatalogLookupLog {
  id: string
  ean: string
  origin: ProductOrigin | null
  source: CatalogLookupSource
  outcome: CatalogLookupOutcome
  error_detail: string | null
  created_at: string
}

/** Item 3 do pacote de melhorias no catálogo: relatório de taxa de acerto
 * (por fonte × origem, EANs inéditos/dia, % cache hit, consultas
 * consumidas por API). Lido de catalog_lookup_log. */
export interface CatalogSourceOriginStat {
  source: CatalogLookupSource
  origin: ProductOrigin | null
  hits: number
  misses: number
  errors: number
}

export interface CatalogDailyStat {
  day: string
  newEans: number
  cacheHits: number
  cacheHitPct: number
}

export interface CatalogHitRateReport {
  bySourceOrigin: CatalogSourceOriginStat[]
  daily: CatalogDailyStat[]
}

/** Painel de saúde das integrações de catálogo (CLAUDE.md, painel de
 * saúde). `acesso_restrito` é status próprio do Mercado Livre -- não vem
 * de `catalog_lookup_log` (a via automática foi encerrada, decisão #22),
 * é um estado estático pra não aparecer como "erro de infra" no painel. */
export type IntegrationHealthStatus = 'operacional' | 'erro_recente' | 'sem_atividade' | 'acesso_restrito'

export interface IntegrationHealth {
  id: string
  label: string
  status: IntegrationHealthStatus
  detail: string
  lastEventAt: string | null
}

export interface CashMovement {
  id: string
  session_id: string
  type: CashMovementType
  amount: number
  reason: string | null
  created_at: string
}
