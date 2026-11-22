import type { PaymentSplit, SalePaymentMethod } from './types'
import type { SaleCartItem } from './sales'

export interface PendingSale {
  idempotency_key: string
  cashier_id: string
  session_id: string
  items: SaleCartItem[]
  /** Forma única, ou `misto` quando dividida (decisão #53). */
  payment_method: SalePaymentMethod
  /** Uma entrada por forma (decisão #53). Opcional pra não quebrar a leitura
   * de vendas enfileiradas antes deste campo existir: ausente significa forma
   * única, e o replay manda só `payment_method`. */
  payments?: PaymentSplit[]
  discount: number
  /** Opcional pra não quebrar leitura de vendas já enfileiradas antes deste
   * campo existir -- ausente é tratado como false (sem override). */
  override_expired?: boolean
  created_at: string
  failures: number
  /** Mensagem (já em português) da última tentativa recusada pelo servidor --
   * mostrada no aviso de vendas pendentes do PDV, pra o operador saber POR QUE
   * a venda não sobe em vez de só ver o contador. */
  last_error?: string
}

const DB_NAME = 'pdv-offline'
const STORE = 'pending_sales'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'idempotency_key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = fn(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function enqueuePendingSale(sale: Omit<PendingSale, 'failures'>): Promise<void> {
  await withStore('readwrite', (store) => store.put({ ...sale, failures: 0 }))
}

export async function listPendingSales(): Promise<PendingSale[]> {
  return withStore('readonly', (store) => store.getAll())
}

export async function removePendingSale(idempotencyKey: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(idempotencyKey))
}

export async function incrementPendingSaleFailures(
  idempotencyKey: string,
  lastError?: string,
): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const getRequest = store.get(idempotencyKey)
    getRequest.onsuccess = () => {
      const record = getRequest.result as PendingSale | undefined
      if (record) store.put({ ...record, failures: record.failures + 1, last_error: lastError })
    }
    getRequest.onerror = () => reject(getRequest.error)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
  })
}
