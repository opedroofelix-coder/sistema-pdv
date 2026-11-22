import { test, expect, type Page } from '@playwright/test'
import { setRole } from './helpers'

/**
 * Ações do lote, todas só do dono: fechar, reabrir e excluir (decisão #57) e
 * editar fornecedor/valor pago/data (decisão #65). Cada uma com confirmação, e
 * dois bloqueios do banco (lote com itens, lote com venda). O bloqueio de venda
 * não é exercido aqui -- exigiria montar uma venda inteira; o de itens cobre o
 * mesmo caminho de erro (mensagem da RPC chegando na tela).
 */

async function signupAs(page: Page, prefix: string, role: 'dono' | 'estoquista') {
  const email = `e2e-${prefix}-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill(`E2E ${prefix}`)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  // O papel do cadastro depende da ordem dos specs (só o 1º usuário do banco
  // vira dono), então fixamos aqui; o goto recarrega o perfil no cliente.
  setRole(email, role)
  await page.goto('/lotes')
  return email
}

async function createLot(page: Page, supplier: string, purchaseValue: number) {
  await page.getByRole('button', { name: 'Novo lote' }).click()
  await page.getByLabel('Fornecedor / leiloeiro').fill(supplier)
  await page.getByLabel('Valor pago (R$)').fill(String(Math.round(purchaseValue * 100)))
  await page.getByRole('button', { name: 'Criar lote' }).click()
  await expect(page.getByRole('link', { name: supplier })).toBeVisible()
}

async function addItem(page: Page, name: string, salePriceCents: string) {
  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill(name)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByLabel('Seu preço de venda').fill(salePriceCents)
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()
}

async function confirmDialog(page: Page, label: string) {
  await page.getByTestId('confirm-dialog').getByRole('button', { name: label }).click()
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
}

test('dono fecha, reabre e é bloqueado ao excluir lote com itens', async ({ page }) => {
  await signupAs(page, 'lote-dono', 'dono')
  await createLot(page, 'E2E Lote Com Itens', 100)
  await page.getByRole('link', { name: 'E2E Lote Com Itens' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Lote Com Itens' })).toBeVisible()

  // um item, pra o lote não ficar vazio (e pra o fechamento ter o que validar)
  await addItem(page, 'Item do lote', '5000')

  // fechar: pede confirmação antes
  await page.getByRole('button', { name: 'Fechar lote' }).click()
  await expect(
    page.getByText('Depois de fechado, os itens não podem mais ser editados'),
  ).toBeVisible()
  await confirmDialog(page, 'Fechar lote')
  await expect(page.getByTestId('toast')).toHaveText('Lote fechado.')
  // '· Fechado' e não só 'Fechado': o toast também contém a palavra, e
  // getByText casa substring sem diferenciar maiúsculas.
  await expect(page.getByText('· Fechado')).toBeVisible()

  // reabrir: some o "Fechar", aparece o "Reabrir"
  await page.getByRole('button', { name: 'Reabrir lote' }).click()
  await confirmDialog(page, 'Reabrir lote')
  await expect(page.getByTestId('toast').filter({ hasText: 'Lote reaberto.' })).toBeVisible()
  await expect(page.getByText('· Recebendo')).toBeVisible()

  // excluir com item cadastrado: recusado pelo banco, mensagem na tela
  await page.getByRole('button', { name: 'Excluir lote' }).click()
  await confirmDialog(page, 'Excluir lote')
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Exclua os itens deste lote antes de excluí-lo.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'E2E Lote Com Itens' })).toBeVisible()

  // cancelar a confirmação não faz nada
  await page.getByRole('button', { name: 'Excluir lote' }).click()
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'E2E Lote Com Itens' })).toBeVisible()
})

test('dono exclui lote vazio pelo card da lista', async ({ page }) => {
  await signupAs(page, 'lote-vazio', 'dono')
  await createLot(page, 'E2E Lote Vazio', 50)

  // `listLots` ordena por created_at desc, então o primeiro card é o recém-criado
  // (o banco é compartilhado entre os specs, sem reset por teste).
  await page.getByRole('button', { name: 'Excluir lote' }).first().click()
  await confirmDialog(page, 'Excluir lote')

  await expect(page.getByTestId('toast')).toHaveText('Lote excluído.')
  await expect(page.getByRole('link', { name: 'E2E Lote Vazio' })).toHaveCount(0)
})

test('dono edita fornecedor e valor do lote, e o rateio acompanha', async ({ page }) => {
  await signupAs(page, 'lote-editar', 'dono')
  await createLot(page, 'E2E Lote Editar', 100)
  await page.getByRole('link', { name: 'E2E Lote Editar' }).click()

  // Item único de R$ 50,00 num lote de R$ 100,00: o rateio inteiro cai nele.
  await addItem(page, 'Item pra ratear', '5000')
  await expect(page.getByTestId('allocated-cost').first()).toHaveText('R$ 100,00')

  // Só o fornecedor: salva direto, sem passo de confirmação.
  await page.getByRole('button', { name: 'Editar lote' }).click()
  const modal = page.getByTestId('edit-lot-modal')
  await modal.getByLabel('Fornecedor / leiloeiro').fill('E2E Lote Renomeado')
  await modal.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByTestId('edit-lot-modal')).toHaveCount(0)
  // `.first()`: o toast de sucesso dura 4s, então a segunda edição deste teste
  // pode encontrar dois "Lote atualizado." na pilha ao mesmo tempo.
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Lote atualizado.' }).first(),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'E2E Lote Renomeado' })).toBeVisible()

  // Valor pago: exige confirmação, e o rateio do item dobra junto.
  await page.getByRole('button', { name: 'Editar lote' }).click()
  // campo com máscara de moeda: preenche em centavos, igual ao `createLot`
  await page.getByTestId('edit-lot-modal').getByLabel('Valor pago (R$)').fill('20000')
  await page.getByTestId('edit-lot-modal').getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Alterar o valor pago do lote?')).toBeVisible()
  await page
    .getByTestId('edit-lot-modal')
    .getByRole('button', { name: 'Confirmar alteração' })
    .click()

  await expect(page.getByTestId('edit-lot-modal')).toHaveCount(0)
  await expect(
    page.getByTestId('toast').filter({ hasText: 'Lote atualizado.' }).first(),
  ).toBeVisible()
  await expect(page.getByTestId('allocated-cost').first()).toHaveText('R$ 200,00')

  // Fornecedor em branco é recusado na tela, antes de chegar no banco.
  await page.getByRole('button', { name: 'Editar lote' }).click()
  await page.getByTestId('edit-lot-modal').getByLabel('Fornecedor / leiloeiro').fill('')
  await expect(page.getByText('Fornecedor não pode ficar em branco.')).toBeVisible()
  await expect(
    page.getByTestId('edit-lot-modal').getByRole('button', { name: 'Salvar' }),
  ).toBeDisabled()
  await page.getByTestId('edit-lot-modal').getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('edit-lot-modal')).toHaveCount(0)
})

test('estoquista não vê fechar, reabrir, excluir nem editar', async ({ page }) => {
  await signupAs(page, 'lote-estoquista', 'estoquista')
  await createLot(page, 'E2E Lote Estoquista', 80)

  // na lista
  await expect(page.getByRole('button', { name: 'Excluir lote' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reabrir lote' })).toHaveCount(0)

  // e na tela do lote -- o recebimento continua disponível
  await page.getByRole('link', { name: 'E2E Lote Estoquista' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Lote Estoquista' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sem código' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fechar lote' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Excluir lote' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar lote' })).toHaveCount(0)
})

test('estoquista não vê valor pago, custo rateado nem margem (decisão #68)', async ({ page }) => {
  await signupAs(page, 'lote-sem-valor', 'estoquista')
  await createLot(page, 'E2E Lote Sem Valor', 80)

  // card da lista: só a data, sem o "R$ 80,00 ·" (pro estoquista nenhum
  // card da lista mostra valor, então basta não achar o texto na página)
  await expect(page.getByText('R$ 80,00')).toHaveCount(0)

  await page.getByRole('link', { name: 'E2E Lote Sem Valor' }).click()
  await expect(page.getByText('· Recebendo')).toBeVisible()
  await expect(page.getByText('R$ 80,00')).toHaveCount(0)

  // recebimento: sem margem estimada nem rateio médio
  await page.getByRole('button', { name: 'Sem código' }).click()
  await page.getByLabel('Nome').fill('Item sem custo visível')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByLabel('Seu preço de venda')).toBeVisible()
  await expect(page.getByText('Margem estimada')).toHaveCount(0)
  await page.getByLabel('Seu preço de venda').fill('5000')
  await page.getByRole('button', { name: 'Confirmar e próximo' }).click()

  // conferência do lote: o item aparece, o custo rateado não
  await expect(page.getByText('Item sem custo visível')).toBeVisible()
  await expect(page.getByTestId('allocated-cost')).toHaveCount(0)
  await expect(page.getByText('Rateio médio')).toHaveCount(0)
})
