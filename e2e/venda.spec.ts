import { test, expect } from '@playwright/test'
import { formatCurrency } from '../src/lib/format'

test('PDV: abrir caixa, bipar item, finalizar venda em dinheiro e fechar caixa', async ({ page }) => {
  const email = `e2e-venda-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill('E2E Venda')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  // Destino pós-cadastro depende do papel (só o 1º usuário do banco vira
  // "dono" e cai no Dashboard; os demais caem direto em Lotes) -- o teste
  // não depende de qual, só precisa chegar em Lotes.
  // recebimento: cria um lote com um item precificado pra vender depois
  await page.getByRole('link', { name: 'Lotes' }).click()
  await page.getByRole('button', { name: 'Novo lote' }).click()
  await page.getByLabel('Fornecedor / leiloeiro').fill('E2E Venda Fornecedor')
  // Máscara de R$: dígitos são interpretados como centavos ao digitar
  // (ver src/lib/format.ts maskCurrencyInput) -- '8000' vira R$ 80,00.
  await page.getByLabel('Valor pago (R$)').fill('8000')
  await page.getByRole('button', { name: 'Criar lote' }).click()
  await page.getByText('E2E Venda Fornecedor').click()

  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill('Produto E2E Venda')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // cadastro manual pula direto pro passo 2 (precificação) do fluxo em duas
  // etapas -- não há foto de API pra confirmar no passo 1.
  await page.getByLabel('Seu preço de venda').fill('8000')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  // Conferência do lote é uma lista de cards desde a decisão #31 (CLAUDE.md),
  // não uma tabela -- código interno/EAN fica no div `font-mono` do card.
  const internalCode = await page.locator('.font-mono.tabular-nums').first().innerText()

  // PDV
  await page.getByRole('link', { name: 'PDV' }).click()
  await page.getByLabel('Valor de abertura (R$)').fill('10000')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()

  await page.getByPlaceholder('Bipar código ou buscar por nome…').fill(internalCode)
  await page.getByPlaceholder('Bipar código ou buscar por nome…').press('Enter')
  await expect(page.getByText('Produto E2E Venda')).toBeVisible()

  // Nenhuma forma vem marcada (decisao #53): escolher e obrigatorio, e o
  // campo de valor recebido so aparece depois de escolher Dinheiro.
  await page.getByRole('button', { name: 'Dinheiro' }).click()
  await page.getByLabel('Valor recebido (R$)').fill('10000')
  await page.getByRole('button', { name: 'Finalizar venda (F2)' }).click()

  const receipt = page.getByTestId('sale-receipt')
  await expect(receipt.getByText('Comprovante não fiscal')).toBeVisible()
  await expect(receipt.getByText(formatCurrency(20))).toBeVisible() // troco: 100 - 80
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()

  // A venda concluída aparece na lista "Vendas"; clicar nela abre o comprovante
  // logo abaixo (acordeão), com o produto e o total.
  await page.getByRole('cell', { name: 'Concluída' }).click()
  const historyReceipt = page.getByTestId('sale-history-receipt')
  await expect(historyReceipt.getByText('Produto E2E Venda')).toBeVisible()
  await expect(historyReceipt.getByText(formatCurrency(80))).toBeVisible()

  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click()
  await page.getByLabel('Valor contado (R$)').fill('18000')
  // depois de abrir a modal, dois botões "Fechar caixa" coexistem (o
  // gatilho e o submit) -- o submit é o último no DOM.
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).last().click()
  await expect(page.getByText('Caixa fechado')).toBeVisible()
  const diffValue = page.getByText('Diferença', { exact: true }).locator('xpath=following-sibling::span[1]')
  await expect(diffValue).toHaveText(formatCurrency(0))
})
