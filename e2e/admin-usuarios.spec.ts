import { test, expect, type Page } from '@playwright/test'

// Branch 6 (item 5): tela /usuarios (só do dono). A Edge Function admin-users
// roda num processo Deno separado que o page.route() não alcança e que o
// stack local não serve nos testes -- então, como recebimento-v2 faz com
// catalog-lookup, o mock intercepta a chamada do navegador pra admin-users e
// devolve o que a função produziria. Isso exercita a UI ponta a ponta (tabela,
// troca de senha inline, ativar/desativar); a lógica interna da função
// (checagem de dono no servidor, Admin API) é validada no deploy/smoke test.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MockUser {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  active: boolean
  created_at: string
}

async function mockAdminUsers(page: Page, users: MockUser[]) {
  const state = users.map((u) => ({ ...u }))
  await page.route('**/functions/v1/admin-users', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: CORS_HEADERS, body: 'ok' })
    }
    const body = JSON.parse(route.request().postData() || '{}')
    let payload: unknown = { ok: true }
    if (body.action === 'list') {
      payload = { users: state }
    } else if (body.action === 'set_access') {
      const u = state.find((x) => x.id === body.user_id)
      if (u) u.active = body.active
    }
    return route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })
}

test('admin: dono gerencia usuários (lista, troca senha, desativa)', async ({ page }) => {
  const email = `e2e-admin-${Date.now()}@example.com`

  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill('E2E Admin Dono')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  await mockAdminUsers(page, [
    { id: 'u-dono', email, full_name: 'E2E Admin Dono', role: 'dono', active: true, created_at: '2026-08-01T00:00:00Z' },
    { id: 'u-caixa', email: 'caixa@loja.com', full_name: 'Fulano Caixa', role: 'caixa', active: true, created_at: '2026-08-02T00:00:00Z' },
  ])

  // O item "Usuários" só aparece pro dono.
  await page.getByRole('link', { name: 'Usuários' }).click()

  // Tabela vem da função (mock): os dois usuários aparecem.
  await expect(page.getByText(email)).toBeVisible()
  await expect(page.getByText('caixa@loja.com')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Cadastrados' })).toBeVisible()

  // Trocar senha inline do caixa.
  const caixaRow = page.getByRole('row', { name: /Fulano Caixa/ })
  await caixaRow.getByRole('button', { name: 'Trocar senha' }).click()
  await page.getByLabel(/Nova senha para/).fill('novasenha123')
  await page.getByRole('button', { name: 'Salvar senha' }).click()
  // Some o formulário inline após salvar (sem erro).
  await expect(page.getByLabel(/Nova senha para/)).toHaveCount(0)

  // Desativar acesso do caixa -> status vira "Desativado".
  await caixaRow.getByRole('button', { name: 'Desativar' }).click()
  await expect(caixaRow.getByText('Desativado')).toBeVisible()

  // Histórico de produto presente.
  await expect(page.getByText('Histórico de um produto')).toBeVisible()
})
