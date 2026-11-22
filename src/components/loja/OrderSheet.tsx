import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, MessageCircle, Store, Truck, X } from 'lucide-react'
import {
  buildOrderMessage,
  cartTotal,
  maskPhone,
  PAYMENT_LABELS,
  todayIso,
  validateOrder,
  whatsappLink,
  type CartLine,
  type OrderDetails,
  type OrderErrors,
  type OrderPayment,
} from '../../lib/storefront'
import { formatCurrency } from '../../lib/storefrontFormat'
import { BagLines } from './BagLines'

interface Props {
  open: boolean
  lines: CartLine[]
  order: OrderDetails
  storeName: string
  storeWhatsapp: string
  onOrderChange: (order: OrderDetails) => void
  onQuantityChange: (productId: string, delta: number) => void
  onClose: () => void
  onSent: () => void
}

const CARD_LIMIT = 200
const TIMES = ['Manhã (8h–12h)', 'Tarde (12h–18h)', 'Qualquer hora']
const FIELD_ORDER: (keyof OrderDetails)[] = ['name', 'phone', 'address', 'date', 'payment']

export function OrderSheet({
  open,
  lines,
  order,
  storeName,
  storeWhatsapp,
  onOrderChange,
  onQuantityChange,
  onClose,
  onSent,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [errors, setErrors] = useState<OrderErrors>({})
  const [sentUrl, setSentUrl] = useState('')
  const total = cartTotal(lines)
  const today = todayIso()

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      setSentUrl('')
      setErrors({})
    }
  }, [open])

  if (!open) return null

  function set<K extends keyof OrderDetails>(key: K, value: OrderDetails[K]) {
    onOrderChange({ ...order, [key]: value })
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function submit() {
    const found = validateOrder(order, today)
    setErrors(found)
    const first = FIELD_ORDER.find((k) => found[k])
    if (first) {
      document.getElementById(`loja-${first}`)?.focus()
      return
    }
    const url = whatsappLink(storeWhatsapp, buildOrderMessage(lines, order, storeName))
    if (!url) return
    setSentUrl(url)
    onSent()
    // Sem 'noopener' nas features: com ele o window.open sempre devolve null
    // e não dá pra saber se o navegador bloqueou a aba.
    const win = window.open(url, '_blank')
    if (win) win.opener = null
    else window.location.href = url
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="loja-veil-anim absolute inset-0 bg-[rgba(30,26,22,0.45)]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="loja-slip loja-sheet loja-sheet-anim relative flex h-full w-full flex-col outline-none md:max-w-[480px] md:shadow-[-20px_0_60px_-30px_rgba(30,26,22,0.6)]"
      >
        <header className="flex items-center gap-2 border-b border-[var(--l-line)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--l-ground)]"
            aria-label={sentUrl ? 'Fechar' : 'Voltar ao catálogo'}
          >
            {sentUrl ? <X size={22} aria-hidden /> : <ArrowLeft size={22} aria-hidden />}
          </button>
          <div className="min-w-0">
            <h2 id={titleId} className="loja-hand text-[24px] leading-none">
              {sentUrl ? 'Pedido enviado' : 'Seu pedido'}
            </h2>
            <p className="loja-stamp mt-1 text-[12px] text-[var(--l-ink-2)]">
              {storeName} · talão de {new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
        </header>

        {sentUrl ? (
          <SentState url={sentUrl} onClose={onClose} />
        ) : lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <p className="loja-hand text-[26px]">A sacola está vazia</p>
            <p className="mt-2 max-w-[30ch] text-[var(--l-ink-2)]">
              Volte ao catálogo e toque em Adicionar nas flores que quiser.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 h-12 rounded-full border-[1.5px] border-[var(--l-ink)] px-6 font-semibold hover:bg-[var(--l-ground)]"
            >
              Ver catálogo
            </button>
          </div>
        ) : (
          <>
            <form
              className="flex-1 overflow-y-auto"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              id="loja-order-form"
            >
              <Segment title="Itens">
                <BagLines lines={lines} onChange={onQuantityChange} />
              </Segment>

              <Segment title="Quem está pedindo">
                <div className="grid gap-3">
                  <Field id="name" label="Seu nome" error={errors.name}>
                    <input
                      id="loja-name"
                      className="loja-field"
                      autoComplete="name"
                      value={order.name}
                      aria-invalid={!!errors.name}
                      onChange={(e) => set('name', e.target.value)}
                    />
                  </Field>
                  <Field id="phone" label="Telefone com DDD" error={errors.phone}>
                    <input
                      id="loja-phone"
                      className="loja-field"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="(11) 98765-4321"
                      value={order.phone}
                      aria-invalid={!!errors.phone}
                      onChange={(e) => set('phone', maskPhone(e.target.value))}
                    />
                  </Field>
                </div>
              </Segment>

              <Segment title="Entrega">
                <div role="radiogroup" aria-label="Entrega ou retirada" className="grid grid-cols-2 gap-2">
                  <Choice
                    checked={order.fulfillment === 'entrega'}
                    onSelect={() => set('fulfillment', 'entrega')}
                    icon={<Truck size={18} aria-hidden />}
                    label="Entregar"
                  />
                  <Choice
                    checked={order.fulfillment === 'retirada'}
                    onSelect={() => set('fulfillment', 'retirada')}
                    icon={<Store size={18} aria-hidden />}
                    label="Retirar na loja"
                  />
                </div>
                {order.fulfillment === 'entrega' ? (
                  <div className="mt-3 grid gap-3">
                    <Field id="recipient" label="Quem vai receber" hint="Deixe em branco se for para você.">
                      <input
                        id="loja-recipient"
                        className="loja-field"
                        value={order.recipient}
                        onChange={(e) => set('recipient', e.target.value)}
                      />
                    </Field>
                    <Field id="address" label="Endereço de entrega" error={errors.address}>
                      <textarea
                        id="loja-address"
                        className="loja-field"
                        rows={2}
                        autoComplete="street-address"
                        placeholder="Rua, número, bairro e referência"
                        value={order.address}
                        aria-invalid={!!errors.address}
                        onChange={(e) => set('address', e.target.value)}
                      />
                    </Field>
                    <p className="text-[13px] text-[var(--l-ink-2)]">
                      A taxa de entrega é combinada com a loja no WhatsApp.
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[14px] text-[var(--l-ink-2)]">
                    A loja confirma no WhatsApp quando o pedido estiver pronto para retirar.
                  </p>
                )}
              </Segment>

              <Segment title="Quando">
                <div className="grid grid-cols-[1fr_1fr] gap-3">
                  <Field id="date" label="Dia" error={errors.date}>
                    <input
                      id="loja-date"
                      className="loja-field"
                      type="date"
                      min={today}
                      value={order.date}
                      aria-invalid={!!errors.date}
                      onChange={(e) => set('date', e.target.value)}
                    />
                  </Field>
                  <Field id="time" label="Horário">
                    <select
                      id="loja-time"
                      className="loja-field"
                      value={order.time}
                      onChange={(e) => set('time', e.target.value)}
                    >
                      <option value="">A combinar</option>
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Segment>

              <Segment title="Cartão">
                <Field
                  id="cardMessage"
                  label="Mensagem do cartão"
                  hint={`Opcional · ${order.cardMessage.length}/${CARD_LIMIT}`}
                >
                  <textarea
                    id="loja-cardMessage"
                    className="loja-field loja-card-text"
                    rows={3}
                    maxLength={CARD_LIMIT}
                    placeholder="Escreva o que vai no cartãozinho"
                    value={order.cardMessage}
                    onChange={(e) => set('cardMessage', e.target.value)}
                  />
                </Field>
              </Segment>

              <Segment title="Pagamento" last>
                <div
                  role="radiogroup"
                  aria-label="Forma de pagamento"
                  aria-describedby={errors.payment ? 'loja-payment-error' : undefined}
                  id="loja-payment"
                  tabIndex={-1}
                  className="grid grid-cols-3 gap-2 outline-none"
                >
                  {(Object.keys(PAYMENT_LABELS) as OrderPayment[]).map((p) => (
                    <Choice
                      key={p}
                      checked={order.payment === p}
                      onSelect={() => set('payment', p)}
                      label={PAYMENT_LABELS[p]}
                    />
                  ))}
                </div>
                {errors.payment && (
                  <p id="loja-payment-error" className="mt-2 text-[13px] font-medium text-[var(--l-error)]">
                    {errors.payment}
                  </p>
                )}
                <p className="mt-3 text-[13px] text-[var(--l-ink-2)]">
                  Nada é cobrado aqui. A loja confirma o pedido e o pagamento no WhatsApp.
                </p>
              </Segment>
            </form>

            <footer className="border-t-2 border-dashed border-[var(--l-line-strong)] bg-[var(--l-paper)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="loja-stamp text-[13px] text-[var(--l-ink-2)]">Total dos itens</span>
                <span className="loja-hand text-[28px] leading-none">{formatCurrency(total)}</span>
              </div>
              {storeWhatsapp ? (
                <button
                  type="submit"
                  form="loja-order-form"
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[var(--l-action)] text-[17px] font-semibold text-[var(--l-on-action)] shadow-[0_10px_24px_-12px_rgba(163,21,76,0.8)] transition-colors hover:bg-[var(--l-action-hover)] active:translate-y-px"
                >
                  <MessageCircle size={20} aria-hidden />
                  Enviar pedido no WhatsApp
                </button>
              ) : (
                <p role="alert" className="rounded-xl bg-[var(--l-ground)] p-3 text-[14px] text-[var(--l-error)]">
                  O WhatsApp da loja ainda não foi configurado (VITE_LOJA_WHATSAPP).
                </p>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

function SentState({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--l-leaf)] text-white">
        <Check size={32} strokeWidth={2.6} aria-hidden />
      </span>
      <p className="loja-hand mt-5 text-[28px] leading-tight">Seu pedido foi para o WhatsApp</p>
      <p className="mt-2 max-w-[34ch] text-[var(--l-ink-2)]">
        Toque em enviar na conversa. A loja responde por lá para confirmar flores, entrega e pagamento.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener"
        className="mt-6 font-semibold text-[var(--l-action)] underline"
      >
        O WhatsApp não abriu? Toque aqui
      </a>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 h-12 rounded-full border-[1.5px] border-[var(--l-ink)] px-6 font-semibold hover:bg-[var(--l-ground)]"
      >
        Voltar ao catálogo
      </button>
    </div>
  )
}

function Segment({ title, children, last }: { title: string; children: ReactNode; last?: boolean }) {
  return (
    <section className="px-5">
      <h3 className="loja-stamp pb-2 pt-5 text-[14px] text-[var(--l-ink-2)]">{title}</h3>
      {children}
      <div className="pt-5">{!last && <hr className="loja-perf" />}</div>
    </section>
  )
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={`loja-${id}`} className="text-[14px] font-semibold">
          {label}
        </label>
        {hint && <span className="text-[12px] text-[var(--l-ink-2)]">{hint}</span>}
      </div>
      {children}
      {error && (
        <p className="mt-1.5 text-[13px] font-medium text-[var(--l-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function Choice({
  checked,
  onSelect,
  label,
  icon,
}: {
  checked: boolean
  onSelect: () => void
  label: string
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] px-3 text-[15px] font-semibold transition-colors ${
        checked
          ? 'border-[var(--l-ink)] bg-[var(--l-ink)] text-[var(--l-paper)]'
          : 'border-[var(--l-line-strong)] bg-white text-[var(--l-ink)] hover:border-[var(--l-ink)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
