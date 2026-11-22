import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { STORE } from '../config'
import { useCart } from '../lib/cart'
import { brl, maskPhone } from '../lib/format'
import { buildOrderMessage, deliveryFeeOf, missingFields, whatsappUrl, type Customer } from '../lib/order'
import { FlowerArt } from './FlowerArt'

type Step = 'sacola' | 'dados' | 'enviado'

const DRAFT_KEY = 'floricultura:cliente'

function today(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

function loadDraft(): Customer {
  const blank: Customer = {
    name: '',
    phone: '',
    mode: 'entrega',
    recipient: '',
    address: '',
    neighborhood: '',
    date: today(),
    period: STORE.periods[0],
    cardMessage: '',
    payment: STORE.payments[0],
    notes: '',
  }
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Customer>
    // só reaproveita dados pessoais; data, cartão e observações começam limpos
    return { ...blank, name: saved.name ?? '', phone: saved.phone ?? '', address: saved.address ?? '', neighborhood: saved.neighborhood ?? '' }
  } catch {
    return blank
  }
}

const LABELS: Partial<Record<keyof Customer, string>> = {
  name: 'seu nome',
  phone: 'telefone com DDD',
  date: 'data',
  period: 'período',
  payment: 'pagamento',
  address: 'endereço',
  neighborhood: 'bairro',
}

const ease = [0.16, 1, 0.3, 1] as const

export function CartDrawer() {
  const { items, subtotal, count, open, setOpen, setQty, clear } = useCart()
  const [step, setStep] = useState<Step>('sacola')
  const [c, setC] = useState<Customer>(loadDraft)
  const [tried, setTried] = useState(false)
  const [sentUrl, setSentUrl] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const fee = deliveryFeeOf(subtotal, c.mode, STORE.delivery)
  const total = subtotal + fee
  const missing = missingFields(c)
  const missingSet = new Set(tried ? missing : [])

  // Esc fecha; foco vai para o painel
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => panel.current?.focus(), 50)
    document.documentElement.classList.add('no-scroll')
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      document.documentElement.classList.remove('no-scroll')
    }
  }, [open, setOpen])

  // sacola esvaziada no meio do caminho volta para o começo
  useEffect(() => {
    if (count === 0 && step === 'dados') setStep('sacola')
  }, [count, step])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [step])

  useEffect(() => {
    try {
      const { name, phone, address, neighborhood } = c
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, phone, address, neighborhood }))
    } catch {
      /* ignora */
    }
  }, [c])

  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setC((prev) => ({ ...prev, [k]: v }))

  const orderUrl = whatsappUrl(
    STORE.whatsapp,
    buildOrderMessage(
      items.map((i) => ({ name: i.product.name, price: i.product.price, qty: i.qty })),
      c,
      STORE.delivery,
    ),
  )

  // O envio é um link de verdade (abre em nova aba); só é barrado se faltar campo.
  const send = (e?: { preventDefault: () => void }) => {
    setTried(true)
    if (missing.length) {
      e?.preventDefault()
      const first = scroller.current?.querySelector<HTMLElement>(`[name="${missing[0]}"]`)
      first?.focus()
      return
    }
    setSentUrl(orderUrl)
    setStep('enviado')
  }

  const finish = () => {
    clear()
    setC((prev) => ({ ...prev, cardMessage: '', notes: '', recipient: '', date: today() }))
    setTried(false)
    setStep('sacola')
    setOpen(false)
  }

  const close = () => {
    setOpen(false)
    if (step === 'enviado') finish()
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="drawer-root">
          <motion.div
            className="drawer-veil"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />
          <motion.div
            ref={panel}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.7, ease }}
          >
            <div className="drawer-head">
              <div>
                <p className="drawer-step">
                  {step === 'sacola' ? 'Passo 1 de 2' : step === 'dados' ? 'Passo 2 de 2' : 'Pronto'}
                </p>
                <h2 id="drawer-title" className="drawer-title">
                  {step === 'sacola' ? 'Sua sacola' : step === 'dados' ? 'Entrega e cartão' : 'Pedido enviado'}
                </h2>
              </div>
              <button className="icon-btn" onClick={close} aria-label="Fechar sacola">
                <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className="drawer-body" ref={scroller} data-lenis-prevent>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.35, ease }}
                >
                  {step === 'sacola' ? (
                    count === 0 ? (
                      <div className="drawer-empty">
                        <svg viewBox="0 0 64 64" aria-hidden>
                          <path d="M14 22h36l-3 32H17z" />
                          <path d="M24 22v-4a8 8 0 0116 0v4" />
                        </svg>
                        <p>Sua sacola está vazia.</p>
                        <button className="btn btn-primary" onClick={() => setOpen(false)}>
                          Ver catálogo
                        </button>
                      </div>
                    ) : (
                      <ul className="lines">
                        <AnimatePresence initial={false}>
                          {items.map(({ product, qty }) => (
                            <motion.li
                              key={product.id}
                              className="line"
                              layout
                              exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }}
                            >
                              <span className="line-art" style={{ background: product.art.bg }}>
                                {product.image ? <img src={product.image} alt="" /> : <FlowerArt spec={product.art} seed={product.id} />}
                              </span>
                              <span className="line-info">
                                <span className="line-name">{product.name}</span>
                                <span className="line-unit">{brl(product.price)} cada</span>
                                <span className="stepper stepper-sm">
                                  <button onClick={() => setQty(product.id, qty - 1)} aria-label={`Diminuir ${product.name}`}>−</button>
                                  <span>{qty}</span>
                                  <button onClick={() => setQty(product.id, qty + 1)} aria-label={`Aumentar ${product.name}`}>+</button>
                                </span>
                              </span>
                              <span className="line-total">{brl(product.price * qty)}</span>
                            </motion.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    )
                  ) : null}

                  {step === 'dados' ? (
                    <form className="form" onSubmit={(e) => e.preventDefault()} noValidate>
                      <div className="seg" role="radiogroup" aria-label="Como receber">
                        {(['entrega', 'retirada'] as const).map((m) => (
                          <button
                            type="button"
                            key={m}
                            role="radio"
                            aria-checked={c.mode === m}
                            className={c.mode === m ? 'is-on' : ''}
                            onClick={() => set('mode', m)}
                          >
                            {m === 'entrega' ? 'Entregar' : 'Retirar na loja'}
                          </button>
                        ))}
                      </div>
                      <p className="form-hint">
                        {c.mode === 'entrega' ? STORE.delivery.area : `Retire em ${STORE.address}.`}
                      </p>

                      <fieldset>
                        <legend>Seus dados</legend>
                        <Field label="Seu nome" error={missingSet.has('name')}>
                          <input name="name" value={c.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
                        </Field>
                        <Field label="WhatsApp / telefone" error={missingSet.has('phone')}>
                          <input
                            name="phone"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="(00) 00000-0000"
                            value={c.phone}
                            onChange={(e) => set('phone', maskPhone(e.target.value))}
                          />
                        </Field>
                      </fieldset>

                      {c.mode === 'entrega' ? (
                        <fieldset>
                          <legend>Para onde</legend>
                          <Field label="Quem vai receber" optional>
                            <input name="recipient" value={c.recipient} onChange={(e) => set('recipient', e.target.value)} placeholder="Se for presente" />
                          </Field>
                          <Field label="Endereço com número" error={missingSet.has('address')}>
                            <input
                              name="address"
                              value={c.address}
                              onChange={(e) => set('address', e.target.value)}
                              autoComplete="street-address"
                              placeholder="Rua, número, complemento"
                            />
                          </Field>
                          <Field label="Bairro" error={missingSet.has('neighborhood')}>
                            <input name="neighborhood" value={c.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
                          </Field>
                        </fieldset>
                      ) : null}

                      <fieldset>
                        <legend>Quando</legend>
                        <div className="row-2">
                          <Field label="Data" error={missingSet.has('date')}>
                            <input name="date" type="date" min={today()} value={c.date} onChange={(e) => set('date', e.target.value)} />
                          </Field>
                          <Field label="Período" error={missingSet.has('period')}>
                            <select name="period" value={c.period} onChange={(e) => set('period', e.target.value)}>
                              {STORE.periods.map((p) => (
                                <option key={p}>{p}</option>
                              ))}
                            </select>
                          </Field>
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend>Cartão</legend>
                        <Field label="Mensagem do cartão" optional>
                          <textarea
                            name="cardMessage"
                            rows={3}
                            maxLength={280}
                            value={c.cardMessage}
                            onChange={(e) => set('cardMessage', e.target.value)}
                            placeholder="Escreva aqui. A gente escreve à mão."
                          />
                        </Field>
                      </fieldset>

                      <fieldset>
                        <legend>Pagamento</legend>
                        <div className="pay">
                          {STORE.payments.map((p) => (
                            <label key={p} className={`pay-opt${c.payment === p ? ' is-on' : ''}`}>
                              <input type="radio" name="payment" value={p} checked={c.payment === p} onChange={() => set('payment', p)} />
                              {p}
                            </label>
                          ))}
                        </div>
                        <p className="form-hint">Você paga depois que confirmarmos o pedido no WhatsApp.</p>
                        <Field label="Observações" optional>
                          <input name="notes" value={c.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: interfone, ponto de referência" />
                        </Field>
                      </fieldset>

                      {tried && missing.length ? (
                        <p className="form-error" role="alert">
                          Falta preencher: {missing.map((m) => LABELS[m] ?? m).join(', ')}.
                        </p>
                      ) : null}
                    </form>
                  ) : null}

                  {step === 'enviado' ? (
                    <div className="sent">
                      <div className="sent-art">
                        <FlowerArt spec={items[0]?.product.art ?? { flowers: [{ kind: 'rose', colors: ['#c8553d'], count: 1 }], holder: 'wrap', holderColor: '#d9b98c', bg: '' }} seed="obrigado" />
                      </div>
                      <p className="sent-lead">Abrimos o WhatsApp com o seu pedido pronto.</p>
                      <p>
                        É só tocar em <strong>enviar</strong> na conversa. A gente confirma a disponibilidade e o horário e passa os
                        dados de pagamento.
                      </p>
                      <a className="btn btn-ghost" href={sentUrl} target="_blank" rel="noreferrer">
                        O WhatsApp não abriu? Toque aqui
                      </a>
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            {count > 0 && step !== 'enviado' ? (
              <div className="drawer-foot">
                <dl className="totals">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{brl(subtotal)}</dd>
                  </div>
                  <div>
                    <dt>{c.mode === 'entrega' ? 'Entrega' : 'Retirada'}</dt>
                    <dd>{c.mode === 'retirada' || fee === 0 ? 'grátis' : brl(fee)}</dd>
                  </div>
                  {c.mode === 'entrega' && fee > 0 && STORE.delivery.freeFrom > 0 ? (
                    <p className="totals-note">Falta {brl(STORE.delivery.freeFrom - subtotal)} para entrega grátis</p>
                  ) : null}
                  <div className="totals-total">
                    <dt>Total</dt>
                    <dd>{brl(total)}</dd>
                  </div>
                </dl>
                {step === 'sacola' ? (
                  <button className="btn btn-primary btn-block btn-lg" onClick={() => setStep('dados')}>
                    Continuar
                    <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </button>
                ) : (
                  <div className="foot-actions">
                    <button className="btn btn-ghost" onClick={() => setStep('sacola')}>
                      Voltar
                    </button>
                    <a className="btn btn-whats btn-lg" href={orderUrl} target="_blank" rel="noreferrer" onClick={send}>
                      <WhatsIcon />
                      Enviar pedido no WhatsApp
                    </a>
                  </div>
                )}
              </div>
            ) : null}
            {step === 'enviado' ? (
              <div className="drawer-foot">
                <button className="btn btn-primary btn-block btn-lg" onClick={finish}>
                  Concluir e limpar sacola
                </button>
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}

function Field({ label, children, error, optional }: { label: string; children: ReactNode; error?: boolean; optional?: boolean }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">
        {label}
        {optional ? <em> · opcional</em> : null}
      </span>
      {children}
    </label>
  )
}

export function WhatsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="whats-icon">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"
      />
    </svg>
  )
}
