import { getErrorMessage } from '../../lib/errors'
import { useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Card } from '../ui/Card'
import { createManualCatalogEntry, correctCatalogEntry } from '../../lib/catalog'
import { findDuplicateInLot, stockItemDisplayName } from '../../lib/stockItems'
import { uploadPhoto } from '../../lib/storage'
import { formatCurrency } from '../../lib/format'
import { ConditionBadge } from './ConditionBadge'
import type { ProductCatalog, ProductOrigin, StockItem } from '../../lib/types'

interface ManualProductFormProps {
  ean: string | null
  /**
   * Presente quando o operador rejeitou a foto de um match automático
   * ("Não é este", DESIGN.md seção 2, passo 1): corrige a entrada de
   * catálogo já cacheada em vez de criar uma segunda entrada para o mesmo
   * EAN. Ausente no cadastro de um código nunca visto por nenhuma fonte.
   */
  catalogId?: string
  /**
   * Por que a entrada de catálogo está em modo correção (só importa quando
   * `catalogId` está presente):
   * - `photo` (padrão): operador rejeitou a foto do match automático.
   * - `unavailable`: nenhuma fonte respondeu (sem cota/indisponível, decisão
   *   #18/#37) -- o item ficaria na fila do dia seguinte; o operador preenche
   *   na hora em vez de esperar.
   */
  correctionReason?: 'photo' | 'unavailable'
  initialName?: string
  initialBrand?: string | null
  initialOrigin?: ProductOrigin
  /**
   * Itens já no lote (decisão #52). Quando presente, digitar um nome que já
   * existe no lote abre o aviso de duplicata com "Somar a este" / "Cadastrar
   * separado" -- produto sem código não tem EAN pra comparar, só o nome, por
   * isso o operador confirma em vez de mesclar sozinho. Opcional de
   * propósito: `CatalogoPendente` reusa este form fora de um lote.
   */
  lotItems?: StockItem[]
  onCreated: (catalog: ProductCatalog) => void
  onCancel: () => void
}

const ORIGIN_OPTIONS: { value: ProductOrigin; label: string }[] = [
  { value: 'nacional', label: 'Nacional' },
  { value: 'importado', label: 'Importado' },
]

export function ManualProductForm({
  ean,
  catalogId,
  correctionReason = 'photo',
  initialName = '',
  initialBrand = '',
  initialOrigin = 'nacional',
  lotItems,
  onCreated,
  onCancel,
}: ManualProductFormProps) {
  const [name, setName] = useState(initialName)
  const [brand, setBrand] = useState(initialBrand ?? '')
  const [origin, setOrigin] = useState<ProductOrigin>(initialOrigin)
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Item do lote com o mesmo nome, achado ao sair do campo Nome. `null`
   * enquanto não há duplicata; volta a null quando o operador escolhe
   * "Cadastrar separado" (dispensa o aviso para este cadastro). */
  const [duplicate, setDuplicate] = useState<StockItem | null>(null)
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false)

  const isCorrection = Boolean(catalogId)

  // O aviso só vale no cadastro de produto novo dentro de um lote: em modo
  // correção o `catalog_id` já está definido, não há o que escolher.
  function handleNameBlur() {
    if (!lotItems || isCorrection || dismissedDuplicate) return
    setDuplicate(findDuplicateInLot(lotItems, name))
  }

  /** "Somar a este": não cria entrada de catálogo nenhuma -- devolve a do
   * item que já está no lote, e o `receiveStockItem` faz a soma no passo de
   * precificação. */
  function handleMergeIntoExisting() {
    if (!duplicate?.product_catalog) return
    onCreated(duplicate.product_catalog)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let photoUrl: string | null = null
      if (photo) {
        photoUrl = await uploadPhoto(photo, `catalog/${Date.now()}-${photo.name}`)
      }
      const catalog = catalogId
        ? await correctCatalogEntry(catalogId, { name, brand: brand || null, photo_url: photoUrl, origin })
        : await createManualCatalogEntry({ ean, name, brand: brand || null, photo_url: photoUrl, origin })
      onCreated(catalog)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao cadastrar produto.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
      <Card raised className="w-full max-w-sm">
        <h2 className="mb-1 text-xl font-bold tracking-tight text-ink">
          {isCorrection && correctionReason === 'photo' ? 'Corrigir cadastro' : 'Cadastro rápido'}
        </h2>
        <p className="mb-6 text-sm text-ink-soft">
          {isCorrection
            ? correctionReason === 'unavailable'
              ? 'Nenhuma fonte respondeu (sem crédito/indisponível) — preencha os dados manualmente.'
              : 'A foto não confere com o item físico — corrija os dados deste código.'
            : ean
              ? `Produto não encontrado para o código ${ean}.`
              : 'Item sem código de barras.'}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="name"
            label="Nome"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
          />

          {duplicate && (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-warning/45 bg-warning/10 p-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-warning">
                  Já está neste lote
                </p>
                <p className="mt-0.5 text-sm font-bold text-ink">
                  {stockItemDisplayName(duplicate)}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-secondary">
                  <span>
                    {duplicate.quantity} {duplicate.quantity === 1 ? 'unidade' : 'unidades'}
                  </span>
                  <span>·</span>
                  <span>{formatCurrency(duplicate.sale_price)}</span>
                  <ConditionBadge condition={duplicate.condition} />
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={handleMergeIntoExisting} className="flex-1">
                  Somar a este
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDuplicate(null)
                    setDismissedDuplicate(true)
                  }}
                  className="flex-1"
                >
                  Cadastrar separado
                </Button>
              </div>
            </div>
          )}

          <Input
            id="brand"
            label="Marca"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-secondary">Origem</span>
            <div className="flex gap-2">
              {ORIGIN_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOrigin(o.value)}
                  aria-pressed={origin === o.value}
                  className={`h-11 flex-1 rounded-[14px] border px-3 text-sm transition-colors ${
                    origin === o.value
                      ? 'border-primary/50 bg-primary/[0.14] font-bold text-primary'
                      : 'border-border bg-field font-semibold text-ink-secondary hover:text-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="photo" className="text-[13px] font-semibold text-ink-secondary">
              Foto (opcional)
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="text-sm text-ink-secondary"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
