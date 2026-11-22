import { supabase } from './supabaseClient'
import type { Lot } from './types'

export async function listLots(): Promise<Lot[]> {
  const { data, error } = await supabase
    .from('lots')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Lot[]
}

export async function getLot(id: string): Promise<Lot> {
  const { data, error } = await supabase.from('lots').select('*').eq('id', id).single()
  if (error) throw error
  return data as Lot
}

export async function createLot(input: {
  supplier: string
  purchase_value: number
  purchase_date: string
  notes?: string
}): Promise<Lot> {
  const { data, error } = await supabase.from('lots').insert(input).select().single()
  if (error) throw error
  return data as Lot
}

/**
 * As tres acoes do lote (fechar/reabrir/excluir) sao RPC, nao update direto:
 * a checagem de papel (so o dono) e as validacoes de negocio vivem no servidor
 * (`0019_lotes_acoes.sql`), fora do alcance de quem chame a API direto. Mesmo
 * padrao de `deleteStockItem`/`deleteCatalogItem` -- o wrapper so repassa a
 * mensagem do `raise exception` pra tela.
 */
export async function closeLot(id: string): Promise<void> {
  const { error } = await supabase.rpc('close_lot', { p_lot_id: id })
  if (error) throw error
}

export async function reopenLot(id: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_lot', { p_lot_id: id })
  if (error) throw error
}

export async function deleteLot(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_lot', { p_lot_id: id })
  if (error) throw error
}

/**
 * Editar lote (decisão #65): fornecedor, valor pago e data da compra. Também é
 * RPC, pelo mesmo motivo das três acima -- a checagem de "somente o dono" e as
 * validações (fornecedor em branco, valor <= 0) vivem no servidor
 * (`0020_editar_lote.sql`).
 *
 * Os três campos vão sempre juntos, mesmo os que não mudaram: a RPC faz um
 * `update` único, então o trigger `lots_recalc` (`0002_receiving.sql`)
 * recalcula o rateio do lote uma vez só.
 */
export async function updateLot(
  id: string,
  input: { supplier: string; purchase_value: number; purchase_date: string },
): Promise<void> {
  const { error } = await supabase.rpc('update_lot', {
    p_lot_id: id,
    p_supplier: input.supplier,
    p_purchase_value: input.purchase_value,
    p_purchase_date: input.purchase_date,
  })
  if (error) throw error
}
