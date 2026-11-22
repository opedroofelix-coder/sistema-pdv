import { test, expect } from '@playwright/test'
import { formatCurrency } from '../src/lib/format'
import { setRole } from './helpers'

test('recebimento: criar lote, bipar item sem EAN, precificar e fechar lote', async ({ page }) => {
  const email = `e2e-entrada-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill('E2E Entrada')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  // Fechar lote é só do dono (decisão #57) e o papel do cadastro depende da
  // ordem dos specs (só o 1º usuário do banco vira "dono"), então promovemos
  // aqui; o goto recarrega o app pro AuthContext ver o papel novo.
  setRole(email, 'dono')
  await page.goto('/lotes')
  await page.getByRole('button', { name: 'Novo lote' }).click()
  await page.getByLabel('Fornecedor / leiloeiro').fill('E2E Fornecedor')
  // Máscara de R$: dígitos são interpretados como centavos ao digitar
  // (ver src/lib/format.ts maskCurrencyInput) -- '10000' vira R$ 100,00.
  await page.getByLabel('Valor pago (R$)').fill('10000')
  await page.getByRole('button', { name: 'Criar lote' }).click()

  await page.getByText('E2E Fornecedor').click()
  await expect(page.getByRole('heading', { name: 'E2E Fornecedor' })).toBeVisible()

  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill('Item E2E')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // cadastro manual pula direto pro passo 2 (precificação) do fluxo em duas
  // etapas -- não há foto de API pra confirmar no passo 1.
  await page.getByLabel('Seu preço de venda').fill('5000')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  // custo rateado do único item do lote = 100% do valor pago no lote
  await expect(page.getByText(formatCurrency(100))).toBeVisible()

  await page.getByRole('button', { name: 'Fechar lote' }).click()
  await page
    .getByTestId('confirm-dialog')
    .getByRole('button', { name: 'Fechar lote' })
    .click()
  await expect(page.getByTestId('toast')).toHaveText('Lote fechado.')
  // "· Fechado" e não só "Fechado": o toast também contém a palavra, e
  // getByText casa substring sem diferenciar maiúsculas.
  await expect(page.getByText('· Fechado')).toBeVisible()
})
