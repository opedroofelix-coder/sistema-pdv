import { test, expect } from '@playwright/test'

/**
 * Decisão #53, itens 1 e 3: nenhuma forma de pagamento vem pré-selecionada
 * (finalizar sem escolher avisa) e a venda pode ser dividida entre várias
 * formas.
 */
test('PDV: exige escolher forma de pagamento e aceita venda dividida', async ({ page }) => {
  const email = `e2e-misto-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill('E2E Misto')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  // Lote com um item de R$ 100,00 pra dividir o pagamento depois.
  await page.getByRole('link', { name: 'Lotes' }).click()
  await page.getByRole('button', { name: 'Novo lote' }).click()
  await page.getByLabel('Fornecedor / leiloeiro').fill('E2E Misto Fornecedor')
  await page.getByLabel('Valor pago (R$)').fill('5000') // R$ 50,00
  await page.getByRole('button', { name: 'Criar lote' }).click()
  await page.getByText('E2E Misto Fornecedor').click()

  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill('Produto E2E Misto')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByLabel('Seu preço de venda').fill('10000') // R$ 100,00
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  const internalCode = await page.locator('.font-mono.tabular-nums').first().innerText()

  await page.getByRole('link', { name: 'PDV' }).click()
  await page.getByLabel('Valor de abertura (R$)').fill('0')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()

  await page.getByPlaceholder('Bipar código ou buscar por nome…').fill(internalCode)
  await page.getByPlaceholder('Bipar código ou buscar por nome…').press('Enter')
  await expect(page.getByText('Produto E2E Misto')).toBeVisible()

  // Item 1: finalizar sem escolher forma nenhuma avisa em vez de passar como
  // dinheiro -- e a venda NÃO é criada (o comprovante não aparece).
  await page.getByRole('button', { name: 'Finalizar venda (F2)' }).click()
  await expect(page.getByText('Escolha uma forma de pagamento.')).toBeVisible()
  await expect(page.getByTestId('sale-receipt')).toHaveCount(0)

  // Item 3: PIX + Crédito. A primeira forma leva o total; ao entrar a
  // segunda, o valor da primeira é reduzido na mão e a segunda fica com o
  // resto.
  await page.getByRole('button', { name: 'PIX' }).click()
  await page.getByRole('button', { name: 'Crédito' }).click()
  await page.getByLabel('Valor em PIX').fill('6000') // R$ 60,00
  await page.getByLabel('Valor em Crédito').fill('4000') // R$ 40,00

  await expect(page.getByText('Pagamento fechado')).toBeVisible()
  await page.getByRole('button', { name: 'Finalizar venda (F2)' }).click()

  // O comprovante lista uma linha por forma, com o valor de cada uma.
  const receipt = page.getByTestId('sale-receipt')
  await expect(receipt.getByText('Comprovante não fiscal')).toBeVisible()
  await expect(receipt.getByText('R$ 60,00')).toBeVisible()
  await expect(receipt.getByText('R$ 40,00')).toBeVisible()

  await page.getByRole('button', { name: 'Fechar', exact: true }).click()

  // No histórico a venda aparece como "Misto".
  await expect(page.getByText('Misto').first()).toBeVisible()
})

/**
 * Decisão #53, item 2: o caixa é por operador. Antes um índice único global
 * permitia uma única sessão aberta na loja inteira -- o segundo operador
 * recebia "Já existe um caixa aberto" ao tentar abrir o dele.
 */
test('PDV: dois operadores mantêm caixas abertos ao mesmo tempo', async ({ page }) => {
  const stamp = Date.now()
  const primeiro = `e2e-caixa-a-${stamp}@example.com`
  const segundo = `e2e-caixa-b-${stamp}@example.com`

  async function signup(email: string, name: string) {
    await page.goto('/signup')
    await page.getByLabel('Nome completo').fill(name)
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill('senha123456')
    await page.getByRole('button', { name: 'Criar conta' }).click()
  }

  /** Espera o redirect do logout terminar antes de navegar: sem isso o
   * `goto('/signup')` corre com a navegação pendente pra /login e a tela de
   * cadastro nunca chega a montar. */
  async function signOut() {
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL('/login')
  }

  await signup(primeiro, 'Caixa A E2E')
  await page.getByRole('link', { name: 'PDV' }).click()
  await page.getByLabel('Valor de abertura (R$)').fill('5000')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()
  await expect(page.getByText('Caixa aberto')).toBeVisible()

  // Sai e entra como outra pessoa: o caixa do primeiro segue aberto, e o
  // segundo consegue abrir o dele (antes isto falhava).
  await signOut()
  await signup(segundo, 'Caixa B E2E')
  await page.getByRole('link', { name: 'PDV' }).click()
  await expect(page.getByLabel('Valor de abertura (R$)')).toBeVisible()
  await page.getByLabel('Valor de abertura (R$)').fill('3000')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()
  await expect(page.getByText('Caixa aberto')).toBeVisible()
})
