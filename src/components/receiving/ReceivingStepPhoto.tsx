import { useState } from 'react'
import { Camera, Check, X } from 'lucide-react'
import { Button } from '../ui/Button'
import type { ProductCatalog } from '../../lib/types'

interface ReceivingStepPhotoProps {
  catalog: ProductCatalog
  busy: boolean
  onConfirm: (ownPhoto: File | null) => void
  onReject: () => void
}

/**
 * Passo 1 do recebimento (DESIGN.md seção 2): validação visual. Quando a API
 * não trouxe foto, o campo de foto própria fica visível e fácil de usar
 * (útil sobretudo em avaria), mas é OPCIONAL (CLAUDE.md decisão #9,
 * invertida): o botão Confirmar nunca fica bloqueado por falta de foto, em
 * nenhum caso -- a validação visual passa a depender só da pergunta "confere
 * com o item físico?" quando há foto da API.
 */
export function ReceivingStepPhoto({ catalog, busy, onConfirm, onReject }: ReceivingStepPhotoProps) {
  const [ownPhoto, setOwnPhoto] = useState<File | null>(null)
  const hasApiPhoto = Boolean(catalog.photo_url)

  return (
    <div className="fixed inset-0 z-50 flex flex-col app-bg">
      <div className="flex-1 overflow-y-auto p-4">
        {hasApiPhoto ? (
          <img
            src={catalog.photo_url!}
            alt={catalog.name ?? ''}
            className="h-[150px] w-full rounded-panel border border-border bg-surface-raised object-contain"
          />
        ) : (
          <label className="flex h-[150px] w-full flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-border bg-field text-ink-soft">
            <Camera size={28} />
            <span className="text-sm font-medium">
              {ownPhoto ? ownPhoto.name : 'Tirar foto do produto (opcional)'}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setOwnPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        <div className="mt-4 text-center">
          <p className="text-base font-bold text-ink">{catalog.name ?? 'Sem descrição'}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {[catalog.ean ? `EAN ${catalog.ean}` : null, catalog.brand, catalog.origin]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        {hasApiPhoto && (
          <p className="mt-6 text-center text-lg font-bold text-ink">Confere com o item físico?</p>
        )}
      </div>

      <div className="flex gap-3 glass glass-blur border-x-0 border-b-0 p-4">
        {hasApiPhoto ? (
          <>
            <Button size="lg" variant="danger" className="flex-1" disabled={busy} onClick={onReject}>
              <X size={16} />
              Não é este
            </Button>
            <Button size="lg" className="flex-1" disabled={busy} onClick={() => onConfirm(null)}>
              <Check size={16} />
              Confere
            </Button>
          </>
        ) : (
          <Button size="lg" className="w-full" disabled={busy} onClick={() => onConfirm(ownPhoto)}>
            <Check size={16} />
            Confirmar
          </Button>
        )}
      </div>
    </div>
  )
}
