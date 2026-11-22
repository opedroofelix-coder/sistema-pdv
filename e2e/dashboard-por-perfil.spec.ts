import { test, expect, type Page } from '@playwright/test'
import { setRole } from './helpers'

async function signup(page: Page, name: string, email: string) {
  await page.goto('/signup')
  await page.getByLabel('Nome completo').fill(name)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Criar conta' }).click()
}

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha123456')
  await page.getByRole('button', { name: 'Entrar' }).click()
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL('/login')
}

test('cada papel cai na tela certa, logo após o cadastro e no login', async ({ page }) => {
  const stamp = Date.now()
  const donoEmail = `e2e-dono-${stamp}@example.com`
  const caixaEmail = `e2e-caixa-${stamp}@example.com`
  const estoquistaEmail = `e2e-estoquista-${stamp}@example.com`

  // dono: cadastro cai direto no Dashboard (skeleton some assim que o
  // perfil carrega -- é exatamente o redirecionamento que tinha o bug de
  // timing corrigido em AuthContext/ProtectedRoute).
  await signup(page, 'Dono E2E', donoEmail)
  setRole(donoEmail, 'dono')
  // goto('/') força reload do perfil (não bastaria reload(): a página atual
  // pode já estar em /lotes ou /pdv, onde nada re-decide o destino por papel
  // -- essa decisão só existe no Dashboard, montado em "/").
  await page.goto('/')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await signOut(page)

  await login(page, donoEmail)
  await expect(page).toHaveURL('/')
  await signOut(page)

  // caixa: cai direto no PDV.
  await signup(page, 'Caixa E2E', caixaEmail)
  setRole(caixaEmail, 'caixa')
  await page.goto('/')
  await expect(page).toHaveURL('/pdv')
  await signOut(page)

  await login(page, caixaEmail)
  await expect(page).toHaveURL('/pdv')
  await signOut(page)

  // estoquista: cai direto no recebimento (Lotes) -- é o papel padrão do
  // trigger pra qualquer cadastro além do primeiro, então nem precisa
  // promover, só confirmar o destino.
  await signup(page, 'Estoquista E2E', estoquistaEmail)
  setRole(estoquistaEmail, 'estoquista')
  await page.goto('/')
  await expect(page).toHaveURL('/lotes')
  await signOut(page)

  await login(page, estoquistaEmail)
  await expect(page).toHaveURL('/lotes')
})
