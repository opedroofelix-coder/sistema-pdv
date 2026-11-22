import { test, expect, type Page } from '@playwright/test'
import { setRole } from './helpers'

/**
 * Módulo financeiro (decisão #72): só o dono entra; despesa fixa criada com
 * "Repetir todo mês" aparece no mês seguinte sozinha; marcar como paga move a
 * conta pro filtro "Pagas"; a despesa entra no DRE do mês.
 */

async function signupAs(page: Page, prefix: string, role: 'dono' | 'estoquista') {
  const email = `e2e-${prefix}-${Date.now()}@example.com`
  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill(`E2E ${prefix}`)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  setRole(email, role)
  return email
}

test('dono lança despesa fixa, ela se repete no mês seguinte e entra no DRE', async ({ page }) => {
  await signupAs(page, 'fin-dono', 'dono')
  await page.goto('/financeiro')
  await expect(page.getByRole('heading', { name: 'Financeiro' })).toBeVisible()

  const description = `Aluguel E2E ${Date.now()}`
  await page.getByRole('tab', { name: 'Contas a pagar' }).click()
  await page.getByRole('button', { name: 'Nova despesa' }).click()
  const form = page.getByRole('form', { name: 'Nova despesa' })
  await form.getByLabel('Descrição').fill(description)
  await form.getByLabel('Categoria').selectOption({ label: 'Aluguel' })
  await form.getByLabel('Valor').fill('350000')
  await form.getByText('Repetir todo mês').click()
  await form.getByRole('button', { name: 'Salvar despesa' }).click()
  await expect(page.getByTestId('toast').filter({ hasText: 'Despesa fixa criada.' })).toBeVisible()

  const row = page.getByTestId('finance-expenses').getByRole('row', { name: new RegExp(description) })
  await expect(row).toBeVisible()
  await expect(row).toContainText('mensal')
  await expect(row).toContainText('R$ 3.500,00')

  // a despesa fixa já foi gerada pro mês seguinte
  await page.getByRole('button', { name: 'Próximo mês' }).click()
  await expect(
    page.getByTestId('finance-expenses').getByRole('row', { name: new RegExp(description) }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Mês anterior' }).click()

  // marcar como paga: sai de "Em aberto" e aparece em "Pagas"
  await row.getByRole('button', { name: 'Marcar como paga' }).click()
  await page.getByRole('form', { name: 'Marcar como paga' }).getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(page.getByTestId('toast').filter({ hasText: 'Conta marcada como paga.' })).toBeVisible()
  await page.getByRole('button', { name: /^Pagas/ }).click()
  await expect(
    page.getByTestId('finance-expenses').getByRole('row', { name: new RegExp(description) }),
  ).toContainText('Paga em')

  // entra no DRE do mês, na categoria escolhida
  await page.getByRole('tab', { name: 'Resumo' }).click()
  const dre = page.getByTestId('finance-dre')
  await expect(dre).toContainText('Aluguel')
  await expect(dre).toContainText('Lucro líquido')
})

test('estoquista não vê nem entra no financeiro', async ({ page }) => {
  await signupAs(page, 'fin-est', 'estoquista')
  await page.goto('/financeiro')
  await expect(page).toHaveURL(/\/lotes$/)
  await expect(page.getByRole('link', { name: 'Financeiro' })).toHaveCount(0)
})
