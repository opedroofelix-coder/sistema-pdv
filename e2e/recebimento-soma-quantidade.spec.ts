import { test, expect } from '@playwright/test'

/**
 * Decisão #52: o mesmo produto recebido duas vezes no mesmo lote soma a
 * quantidade numa linha só, em vez de criar outra linha. Cobre o caminho do
 * cadastro manual, que é onde o aviso de duplicata aparece -- e que também
 * exercita a mesclagem em `receiveStockItem`.
 */
test('recebimento: mesmo produto no mesmo lote soma a quantidade', async ({ page }) => {
  const email = `e2e-soma-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill('E2E Soma')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  await page.getByRole('link', { name: 'Lotes' }).click()
  await page.getByRole('button', { name: 'Novo lote' }).click()
  await page.getByLabel('Fornecedor / leiloeiro').fill('E2E Soma Fornecedor')
  await page.getByLabel('Valor pago (R$)').fill('10000') // R$ 100,00
  await page.getByRole('button', { name: 'Criar lote' }).click()

  await page.getByText('E2E Soma Fornecedor').click()
  await expect(page.getByRole('heading', { name: 'E2E Soma Fornecedor' })).toBeVisible()

  // 1ª entrada: cadastro manual normal, sem aviso nenhum.
  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill('Fone E2E')
  await expect(page.getByText('Já está neste lote')).toHaveCount(0)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByLabel('Seu preço de venda').fill('3000') // R$ 30,00
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  await expect(page.locator('input[type="number"]')).toHaveCount(1)

  // 2ª entrada: mesmo produto, nome digitado em caixa e espaçamento
  // diferentes -- a normalização tem que casar mesmo assim.
  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill('  fone   e2e ')
  await page.getByLabel('Nome').blur()

  await expect(page.getByText('Já está neste lote')).toBeVisible()
  await page.getByRole('button', { name: 'Somar a este' }).click()

  await page.getByLabel('Seu preço de venda').fill('3000')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  // O ponto do teste: UMA linha, com quantidade 2 -- não duas linhas de 1.
  const quantities = page.locator('input[type="number"]')
  await expect(quantities).toHaveCount(1)
  await expect(quantities.first()).toHaveValue('2')
})
