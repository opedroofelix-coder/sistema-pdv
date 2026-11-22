import { useEffect, useRef, useState } from 'react'
import * as Sentry from '@sentry/react'
import { X } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import type { IScannerControls } from '@zxing/browser'

const CAMERA_ERROR_MESSAGE: Record<string, string> = {
  NotAllowedError: 'Permissão de câmera negada. Libere o acesso à câmera nas configurações do navegador.',
  NotFoundError: 'Nenhuma câmera encontrada neste dispositivo.',
  NotReadableError: 'A câmera está sendo usada por outro programa ou aba.',
  OverconstrainedError: 'Não foi possível configurar a câmera com os requisitos necessários.',
}

interface CameraScannerProps {
  onDetected: (code: string) => void
  onClose: () => void
}

const hints = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.CODE_128],
  ],
])

export function CameraScanner({ onDetected, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 })
    let controls: IScannerControls | null = null
    let cancelled = false

    async function start() {
      // Sem deviceId explícito, o ZXing pede facingMode: 'environment'
      // (câmera traseira) por padrão — em notebook/desktop, cuja câmera
      // embutida é frontal, essa negociação nunca resolve nem rejeita e a
      // tela fica "carregando" pra sempre. Por isso escolhemos o device
      // explicitamente: preferimos uma câmera traseira pelo label quando
      // existir (celular com mais de uma câmera), senão usamos a primeira
      // disponível (caso comum de notebook/desktop com uma única câmera).
      const devices = await BrowserMultiFormatReader.listVideoInputDevices()
      if (cancelled) return
      if (devices.length === 0) {
        setError(CAMERA_ERROR_MESSAGE.NotFoundError)
        return
      }
      const backCamera = devices.find((d) => /back|traseir|rear|environment/i.test(d.label))
      const deviceId = (backCamera ?? devices[0]).deviceId

      const c = await reader.decodeFromVideoDevice(deviceId, videoRef.current!, (result) => {
        // O callback roda a cada frame; frames sem código legível vêm com
        // `err` preenchido (NotFoundException/ChecksumException/
        // FormatException) — isso é o funcionamento normal do scan
        // contínuo, não uma falha de câmera, então é ignorado aqui.
        if (result) {
          controls?.stop()
          onDetected(result.getText())
        }
      })
      if (cancelled) {
        c.stop()
      } else {
        controls = c
      }
    }

    start().catch((err) => {
      Sentry.captureException(err)
      const name = err instanceof Error ? err.name : ''
      setError(CAMERA_ERROR_MESSAGE[name] ?? 'Não foi possível acessar a câmera.')
    })

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-medium text-white">Aponte para o código de barras</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="px-6 text-center text-sm text-danger">{error}</p>
        ) : (
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        )}
      </div>
    </div>
  )
}
