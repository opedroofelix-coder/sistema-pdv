import { execSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'

/**
 * Mesmo padrão de fixture via docker exec já usado em
 * dashboard-por-perfil.spec.ts: promove o papel direto no Postgres
 * (não há UI de gestão de papel) e semeia um item de estoque já vencido
 * direto no banco (mais rápido e determinístico que passar pelo fluxo de
 * recebimento só pra testar o bloqueio do PDV).
 */
function setRole(email: string, role: 'dono' | 'caixa' | 'estoquista') {
  const sql = `
    alter table profiles disable trigger protect_profile_role_trigger;
    update profiles set role = '${role}'
      where id = (select id from auth.users where email = '${email}');
    alter table profiles enable trigger protect_profile_role_trigger;
  `
  execSync('docker exec -i supabase_db_sistema-pdv psql -U postgres -d postgres', { input: sql })
}

function seedExpiredStockItem(internalCode: string, salePrice: number) {
  const sql = `
    with lot as (
      insert into lots (supplier, purchase_value, status)
      values ('E2E Vencido ${internalCode}', ${salePrice}, 'receiving')
      returning id
    )
    insert into stock_items (lot_id, internal_code, quantity, sale_price, allocated_cost, expiry_date, condition)
    select id, '${internalCode}', 1, ${salePrice}, ${salePrice}, current_date - 5, 'novo' from lot;
  `
  execSync('docker exec -i supabase_db_sistema-pdv psql -U postgres -d postgres', { input: sql })
}

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

test('PDV bloqueia venda de item vencido pro caixa; dono libera', async ({ page }) => {
  const stamp = Date.now()
  const internalCode = `E2EVENC${stamp}`
  const donoEmail = `e2e-dono-venc-${stamp}@example.com`
  const caixaEmail = `e2e-caixa-venc-${stamp}@example.com`

  seedExpiredStockItem(internalCode, 50)

  // Promove explicitamente em vez de contar com "1º usuário = dono": esse
  // teste roda dentro da mesma suíte que dashboard-por-perfil.spec.ts, que
  // já criou o próprio dono antes -- na suíte completa este não é mais o
  // primeiro cadastro do banco.
  await signup(page, 'Dono Venc E2E', donoEmail)
  setRole(donoEmail, 'dono')
  await signOut(page)

  await signup(page, 'Caixa Venc E2E', caixaEmail)
  setRole(caixaEmail, 'caixa')
  // goto('/') força reload do perfil pra pegar o papel promovido (mesmo
  // motivo do dashboard-por-perfil.spec.ts: SPA não reconsulta sozinha).
  await page.goto('/')
  await expect(page).toHaveURL('/pdv')

  // Máscara de R$: dígitos são interpretados como centavos ao digitar
  // (ver src/lib/format.ts maskCurrencyInput) -- '10000' vira R$ 100,00.
  await page.getByLabel('Valor de abertura (R$)').fill('10000')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()

  await page.getByPlaceholder('Bipar código ou buscar por nome…').fill(internalCode)
  await page.getByPlaceholder('Bipar código ou buscar por nome…').press('Enter')

  await expect(page.getByText(/Só o dono pode liberar a venda/)).toBeVisible()
  await expect(page.getByText('Nenhum item bipado ainda.')).toBeVisible() // não entrou no carrinho

  // O operador fecha o PRÓPRIO caixa antes de sair (decisão #53: o caixa é
  // por operador). Deixá-lo aberto faria o dono ver o bloco "Outros caixas
  // abertos", cujo botão "Fechar" competiria com o "Fechar" do comprovante.
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click()
  await page.getByLabel('Valor contado (R$)').fill('10000')
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).last().click()
  await page.getByRole('button', { name: 'OK' }).click()

  await signOut(page)

  // Não afirma a URL pós-login aqui (isso já é coberto por
  // dashboard-por-perfil.spec.ts) -- só garante que chega no PDV.
  await login(page, donoEmail)
  if (new URL(page.url()).pathname !== '/pdv') {
    await page.getByRole('link', { name: 'PDV' }).click()
  }

  // O caixa do operador não serve pro dono (decisão #53) -- ele abre o dele.
  await page.getByLabel('Valor de abertura (R$)').fill('10000')
  await page.getByRole('button', { name: 'Abrir caixa' }).click()

  await page.getByPlaceholder('Bipar código ou buscar por nome…').fill(internalCode)
  await page.getByPlaceholder('Bipar código ou buscar por nome…').press('Enter')

  await expect(page.getByText(/Vencido em/)).toBeVisible()
  await expect(page.getByText('Carrinho tem item vencido — venda liberada como dono.')).toBeVisible()

  // Nenhuma forma vem marcada (decisao #53): escolher e obrigatorio, e o
  // campo de valor recebido so aparece depois de escolher Dinheiro.
  await page.getByRole('button', { name: 'Dinheiro' }).click()
  await page.getByLabel('Valor recebido (R$)').fill('5000')
  await page.getByRole('button', { name: 'Finalizar venda (F2)' }).click()

  await expect(page.getByTestId('sale-receipt').getByText('Comprovante não fiscal')).toBeVisible()
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()

  // Fecha o caixa do dono. Desde a decisão #53 um caixa esquecido aberto não
  // bloqueia mais outro operador (é um por pessoa), mas fechar mantém o
  // estado do banco limpo entre os specs.
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).click()
  await page.getByLabel('Valor contado (R$)').fill('15000')
  await page.getByRole('button', { name: 'Fechar caixa', exact: true }).last().click()
  await expect(page.getByText('Caixa fechado')).toBeVisible()
})
