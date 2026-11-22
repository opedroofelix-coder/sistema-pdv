import { execSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'
import { formatCurrency } from '../src/lib/format'

/**
 * A cascata de catálogo (Cosmos/UPCitemdb/Open Beauty Facts/Open Food Facts)
 * roda hoje inteira na Edge Function `catalog-lookup` (pacote de melhorias
 * no catálogo, ajuste de segurança prioritário) -- um processo Deno separado
 * que `page.route()` não alcança, já que as chamadas às APIs externas nunca
 * passam pelo navegador. Por isso o mock acontece um nível acima: intercepta
 * a chamada do navegador pra `catalog-lookup` e devolve exatamente o que a
 * função teria produzido, com a linha correspondente já inserida direto no
 * Postgres local (mesmo padrão de fixture via docker exec já usado em
 * dashboard-por-perfil.spec.ts) -- precisa existir de verdade porque
 * stock_items.catalog_id é FK pra product_catalog.id.
 */
function sqlLiteral(value: string | null): string {
  if (value === null) return 'null'
  return `'${value.replace(/'/g, "''")}'`
}

function insertCatalogRow(fields: {
  ean: string
  name: string
  brand?: string | null
  photoUrl?: string | null
  origin: 'nacional' | 'importado'
  ncm?: string | null
  /** Plano B do preço de referência (CLAUDE.md decisão #23): simula a
   * Cosmos já tendo populado ref_price_min/avg/max no lookup. */
  refPriceAvg?: number
  refPriceMin?: number
  refPriceMax?: number
}): unknown {
  const ncmPending = fields.origin === 'importado' && !fields.ncm
  const hasRefPrice = fields.refPriceAvg !== undefined
  const sql = `
    insert into product_catalog (
      ean, name, brand, photo_url, source, origin, ncm, ncm_pending, needs_review, enrichment_status,
      ref_price_min, ref_price_avg, ref_price_max, ref_price_updated_at
    )
    values (
      ${sqlLiteral(fields.ean)}, ${sqlLiteral(fields.name)}, ${sqlLiteral(fields.brand ?? null)},
      ${sqlLiteral(fields.photoUrl ?? 'https://example.com/photo.jpg')}, 'off', ${sqlLiteral(fields.origin)},
      ${sqlLiteral(fields.ncm ?? null)}, ${ncmPending}, true, 'resolved',
      ${fields.refPriceMin ?? fields.refPriceAvg ?? 'null'}, ${fields.refPriceAvg ?? 'null'},
      ${fields.refPriceMax ?? fields.refPriceAvg ?? 'null'}, ${hasRefPrice ? 'now()' : 'null'}
    )
    returning row_to_json(product_catalog.*) as json;
  `
  const output = execSync('docker exec -i supabase_db_sistema-pdv psql -U postgres -d postgres -t -A -q', {
    input: sql,
  }).toString()
  // -t -A já tira cabeçalho/alinhamento, mas o psql ainda ecoa a tag de
  // comando ("INSERT 0 1") como linha própria -- filtra pela linha que é
  // JSON de verdade em vez de assumir posição fixa.
  const jsonLine = output.split('\n').find((line) => line.trim().startsWith('{'))
  if (!jsonLine) throw new Error(`insertCatalogRow: psql não retornou linha JSON pro EAN ${fields.ean}: ${output}`)
  return JSON.parse(jsonLine)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Um EAN sem match em fonte nenhuma: catalog-lookup responde null (mesmo
 * contrato de "cascata completou sem erro, nada encontrado"). A função e o
 * navegador rodam em origens diferentes mesmo em dev (:54331 vs :5183), então
 * o preflight OPTIONS real do browser passa por aqui também -- sem os
 * headers de CORS a chamada de verdade (POST) nunca sai do preflight. */
async function mockCatalogLookup(page: Page, row: unknown | null) {
  await page.route('**/functions/v1/catalog-lookup', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: CORS_HEADERS, body: 'ok' })
    }
    // `json: null` faz o Playwright tratar como "sem body" (a chamada volta
    // com um objeto vazio em vez do null literal que o contrato da função
    // usa pra "nada encontrado") -- manda o body como string JSON explícita.
    return route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
  })
}

async function mockSupportingApis(page: Page) {
  // Preço de referência (Mercado Livre) não é mais chamado automaticamente
  // pela UI (plano B, CLAUDE.md decisão #22/#23: busca de produtos do ML
  // bloqueada por política deles mesmo autenticado) -- nada pra mockar aqui.

  // Evita requisição de rede real pra imagem do catálogo (não é o foco do teste).
  await page.route('https://example.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/gif',
      body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7', 'base64'),
    }),
  )
}

/**
 * `purchaseValue` chega em reais (ex.: '100' = R$ 100,00) e é convertido pra
 * dígitos-centavos aqui dentro, já que o campo "Valor pago (R$)" agora tem
 * máscara de moeda (ver src/lib/format.ts maskCurrencyInput) -- os
 * chamadores continuam passando o valor "de negócio", sem se importar com o
 * detalhe de digitação.
 */
async function signupAndCreateLot(page: Page, emailPrefix: string, purchaseValue: string) {
  const email = `e2e-${emailPrefix}-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill(`E2E ${emailPrefix}`)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  // Destino pós-cadastro depende do papel (só o 1º usuário do banco vira
  // "dono" e cai no Dashboard; os demais caem direto em Lotes) -- o teste
  // não depende de qual, só precisa chegar em Lotes.
  await page.getByRole('link', { name: 'Lotes' }).click()
  await page.getByRole('button', { name: 'Novo lote' }).click()
  await page.getByLabel('Fornecedor / leiloeiro').fill(`Fornecedor ${emailPrefix}`)
  await page.getByLabel('Valor pago (R$)').fill(String(Math.round(Number(purchaseValue) * 100)))
  await page.getByRole('button', { name: 'Criar lote' }).click()
  await page.getByText(`Fornecedor ${emailPrefix}`).click()
}

test('recebimento v2: produto nacional confirmado sem selo nem NCM pendente', async ({ page }) => {
  await mockSupportingApis(page)
  const row = insertCatalogRow({
    ean: '7890000000015',
    name: 'Refrigerante Nacional',
    brand: 'MarcaBR',
    origin: 'nacional',
    refPriceMin: 8,
    refPriceAvg: 10,
    refPriceMax: 12,
  })
  await mockCatalogLookup(page, row)
  await signupAndCreateLot(page, 'nacional', '100')

  await page.getByPlaceholder('Bipar código de barras…').fill('7890000000015')
  await page.getByPlaceholder('Bipar código de barras…').press('Enter')

  await expect(page.getByText('Confere com o item físico?')).toBeVisible()
  await expect(page.getByText('Refrigerante Nacional')).toBeVisible()
  await expect(page.getByText('· nacional')).toBeVisible()
  await page.getByRole('button', { name: 'Confere' }).click()

  await expect(page.getByRole('button', { name: 'Confirmar e próximo' })).toBeVisible()
  await expect(page.getByText('Importado', { exact: true })).not.toBeVisible()
  await expect(page.getByText('Sem NCM')).not.toBeVisible()

  // Plano B do preço de referência (decisão #23): Cosmos já tinha o dado,
  // card mostra automático sem precisar de anotação manual.
  await expect(page.getByText('Médio (Cosmos)')).toBeVisible()
  await expect(page.getByText(formatCurrency(10))).toBeVisible()

  await page.getByLabel('Seu preço de venda').fill('3000')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  await expect(page.getByText('Refrigerante Nacional')).toBeVisible()
  await expect(page.getByText(formatCurrency(100))).toBeVisible() // único item: 100% do rateio
})

test('recebimento v2: sem referência automática, operador anota o preço visto no Mercado Livre', async ({
  page,
}) => {
  await mockSupportingApis(page)
  const row = insertCatalogRow({
    ean: '7890000000039',
    name: 'Produto Sem Cosmos',
    brand: 'MarcaSemPreco',
    origin: 'nacional',
  })
  await mockCatalogLookup(page, row)
  await signupAndCreateLot(page, 'semreferencia', '100')

  await page.getByPlaceholder('Bipar código de barras…').fill('7890000000039')
  await page.getByPlaceholder('Bipar código de barras…').press('Enter')
  await page.getByRole('button', { name: 'Confere' }).click()

  await expect(page.getByText('Sem referência automática da Cosmos')).toBeVisible()
  const mlLink = page.getByRole('link', { name: 'Ver no Mercado Livre ↗' })
  await expect(mlLink).toBeVisible()
  await expect(mlLink).toHaveAttribute('href', 'https://lista.mercadolivre.com.br/7890000000039')
  await expect(mlLink).toHaveAttribute('target', '_blank')

  await page.getByPlaceholder('Preço visto no ML').fill('19.90')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText(`${formatCurrency(19.9)} anotado em`)).toBeVisible()
})

test('recebimento v2: produto importado ganha selo e alerta de NCM pendente', async ({ page }) => {
  await mockSupportingApis(page)
  const row = insertCatalogRow({
    ean: '4001234567892',
    name: 'Produto Importado Teste',
    brand: 'MarcaXYZ',
    origin: 'importado',
  })
  await mockCatalogLookup(page, row)
  await signupAndCreateLot(page, 'importado', '100')

  await page.getByPlaceholder('Bipar código de barras…').fill('4001234567892')
  await page.getByPlaceholder('Bipar código de barras…').press('Enter')

  await expect(page.getByText('Confere com o item físico?')).toBeVisible()
  await expect(page.getByText('· importado')).toBeVisible()
  await page.getByRole('button', { name: 'Confere' }).click()

  await expect(page.getByText('Importado', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Sem NCM — classificar com o contador (importado)')).toBeVisible()

  await page.getByLabel('Seu preço de venda').fill('4000')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  await expect(page.getByText('Produto Importado Teste')).toBeVisible()
  await expect(page.getByText('Sem NCM — falar com o contador')).toBeVisible()
})

test('recebimento v2: código sem match em nenhuma fonte abre o cadastro manual', async ({ page }) => {
  await mockSupportingApis(page)
  await mockCatalogLookup(page, null)
  await signupAndCreateLot(page, 'semmatch', '50')

  await page.getByPlaceholder('Bipar código de barras…').fill('9999999999991')
  await page.getByPlaceholder('Bipar código de barras…').press('Enter')

  await expect(page.getByText('Produto não encontrado para o código 9999999999991.')).toBeVisible()
  await page.getByLabel('Nome').fill('Item Sem Match')
  await page.getByRole('button', { name: 'Importado' }).click()
  await page.getByRole('button', { name: 'Salvar' }).click()

  // cadastro manual sem foto de API pula direto pro passo 2
  await expect(page.getByRole('button', { name: 'Confirmar e próximo' })).toBeVisible()
  await expect(page.getByText('Item Sem Match')).toBeVisible()

  await page.getByLabel('Seu preço de venda').fill('2000')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  await expect(page.getByText('Item Sem Match')).toBeVisible()
})

test('recebimento v2: foto rejeitada corrige o cadastro em vez de duplicar', async ({ page }) => {
  await mockSupportingApis(page)
  const row = insertCatalogRow({ ean: '7890000000022', name: 'Nome Errado', brand: 'MarcaErrada', origin: 'nacional' })
  await mockCatalogLookup(page, row)
  await signupAndCreateLot(page, 'rejeita', '100')

  await page.getByPlaceholder('Bipar código de barras…').fill('7890000000022')
  await page.getByPlaceholder('Bipar código de barras…').press('Enter')

  await expect(page.getByText('Nome Errado')).toBeVisible()
  await page.getByRole('button', { name: 'Não é este' }).click()

  await expect(page.getByText('Corrigir cadastro')).toBeVisible()
  await page.getByLabel('Nome').fill('Nome Corrigido')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // corrigido, pula direto pro passo 2 com o nome já certo
  await expect(page.getByRole('button', { name: 'Confirmar e próximo' })).toBeVisible()
  await expect(page.getByText('Nome Corrigido')).toBeVisible()
  await expect(page.getByText('Nome Errado')).not.toBeVisible()

  await page.getByLabel('Seu preço de venda').fill('2500')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  await expect(page.getByText('Nome Corrigido')).toBeVisible()
})
