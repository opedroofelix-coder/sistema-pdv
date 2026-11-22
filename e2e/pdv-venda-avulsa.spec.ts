import { test, expect } from '@playwright/test'
import { formatCurrency } from '../src/lib/format'

// Branch 5 (itens 11 e 8): busca por nome no MESMO campo da bipagem + venda de
// item avulso ("Diversos") sem código de barras, com preço inline no carrinho.
// Cobre uma venda MISTA (item de estoque achado pela busca + um avulso).
test('PDV: busca por nome + venda de item avulso (diversos)', async ({ page }) => {
  const email = `e2e-avulsa-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill('E2E Avulsa')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  // Recebimento: um lote com um item precificado, pra achar pela busca depois.
  await page.getByRole('link', { name: 'Lotes' }).click()
  await page.getByRole('button', { name: 'Novo lote' }).click()
  await page.getByLabel('Fornecedor / leiloeiro').fill('E2E Avulsa Fornecedor')
  await page.getByLabel('Valor pago (R$)').fill('8000') // R$ 80,00
  await page.getByRole('button', { name: 'Criar lote' }).click()
  await page.getByText('E2E Avulsa Fornecedor').click()

  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill('Produto Busca E2E')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByLabel('Seu preço de venda').fill('8000') // R$ 80,00
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  // PDV
  await page.getByRole('link', { name: 'PDV' }).click()
  await page.getByLabel('Valor de abertura (R$)').fill('10000')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()

  // Item 11: busca por nome no MESMO campo da bipagem -> clica no resultado.
  const field = page.getByPlaceholder('Bipar código ou buscar por nome…')
  await field.click()
  await field.fill('Produto Busca')
  await page.getByRole('button', { name: /Produto Busca E2E/ }).click()
  await expect(page.getByText('Produto Busca E2E')).toBeVisible()

  // Item 8: clicar "Diversos" escreve "Diversos" no campo de bipar e abre o
  // campo de valor ao lado; digita o preço e Enter adiciona ao carrinho.
  await page.getByRole('button', { name: 'Diversos' }).click()
  await expect(page.getByPlaceholder('Bipar código ou buscar por nome…')).toHaveValue('Diversos')
  await page.getByLabel('Valor do item avulso').fill('1500') // R$ 15,00
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('(avulso)')).toBeVisible()

  // Carrinho: estoque (80) + avulso (15) = 95.
  // Nenhuma forma vem marcada (decisao #53): escolher e obrigatorio, e o
  // campo de valor recebido so aparece depois de escolher Dinheiro.
  await page.getByRole('button', { name: 'Dinheiro' }).click()
  await page.getByLabel('Valor recebido (R$)').fill('10000') // R$ 100,00
  await page.getByRole('button', { name: 'Finalizar venda (F2)' }).click()

  const receipt = page.getByTestId('sale-receipt')
  await expect(receipt.getByText('Comprovante não fiscal')).toBeVisible()
  // Total 95 (aparece como subtotal e total no comprovante), troco 100-95=5.
  await expect(receipt.getByText(formatCurrency(95)).first()).toBeVisible()
  await expect(receipt.getByText(formatCurrency(5))).toBeVisible()
  // O avulso aparece no comprovante.
  await expect(receipt.getByText('1x Diversos')).toBeVisible()
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()

  // Fecha o caixa (getOpenSession é global). Esperado = 100 + venda 95 = 195.
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click()
  await page.getByLabel('Valor contado (R$)').fill('19500')
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).last().click()
  await expect(page.getByText('Caixa fechado')).toBeVisible()
})
