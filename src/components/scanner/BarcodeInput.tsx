import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ScanLine, Check } from 'lucide-react'

interface BarcodeInputProps {
  onScan: (code: string) => void
  disabled?: boolean
  placeholder?: string
  /**
   * Quando presente, o campo também serve de busca por texto (Branch 5, item
   * 11): emite o texto digitado a cada tecla e usa teclado alfanumérico. O
   * Enter continua sendo o caminho de código (leitor físico). Ausente = campo
   * só de bipagem (uso do recebimento em LotDetail, inalterado).
   */
  onValueChange?: (value: string) => void
  /** Muda pra (re)escrever o campo de fora quando `resetKey` muda: `presetValue`
   * vira o novo conteúdo (ex.: "Diversos" ao entrar no modo avulso), ou vazio
   * pra limpar (ex.: após clicar num resultado de busca). */
  resetKey?: number
  presetValue?: string
}

/**
 * Leitores físicos (USB/BT) emulam teclado: digitam o código e pressionam
 * Enter. Foca ao montar e depois de cada bipagem para o próximo item entrar
 * direto — mas não rouba o foco de volta em blur, senão o operador não
 * consegue clicar em outros campos da tela (preço, condição etc).
 *
 * Botão "Confirmar" (ajuste de UX) dispara o mesmo `submit` do Enter — no
 * teclado do celular nem sempre a tecla Enter é clara/acessível pro operador
 * digitando o código manualmente.
 */
export function BarcodeInput({
  onScan,
  disabled,
  placeholder = 'Bipar código de barras…',
  onValueChange,
  resetKey,
  presetValue,
}: BarcodeInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!disabled) inputRef.current?.focus()
  }, [disabled])

  // (Re)escreve o campo quando o pai sinaliza (busca escolhida -> vazio;
  // modo avulso -> "Diversos").
  useEffect(() => {
    if (resetKey === undefined) return
    const next = presetValue ?? ''
    setValue(next)
    onValueChange?.(next)
    // onValueChange/presetValue são estáveis o bastante no uso; só o resetKey
    // dispara a reescrita (senão o campo se limparia a cada render do pai).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  function change(next: string) {
    setValue(next)
    onValueChange?.(next)
  }

  function submit() {
    const code = value.trim()
    if (code) onScan(code)
    change('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    submit()
  }

  return (
    // Campo de bipar Safira (decisão #71): 52px, ícone azul, halo no foco e
    // a dica "Enter" -- o botão de confirmar só aparece com algo digitado
    // (no celular não há Enter físico).
    <div className="flex h-[52px] items-center gap-2.5 rounded-[14px] border border-border bg-field pl-4 pr-2 transition-shadow focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <ScanLine size={20} className="shrink-0 text-primary" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        inputMode={onValueChange ? 'text' : 'numeric'}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full min-w-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft"
      />
      {value.trim() ? (
        <button
          type="button"
          aria-label="Confirmar código"
          disabled={disabled}
          onClick={submit}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-content disabled:opacity-40"
        >
          <Check size={18} />
        </button>
      ) : (
        <span className="hidden shrink-0 rounded-[7px] bg-border px-2 py-0.5 text-[11.5px] font-bold text-ink-secondary sm:inline">
          Enter
        </span>
      )}
    </div>
  )
}
