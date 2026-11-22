/**
 * Formata uma data pura (YYYY-MM-DD, sem horário) sem deslocamento de fuso.
 * new Date('YYYY-MM-DD') interpreta a string como meia-noite UTC, o que faz
 * o dia "voltar" ao converter para fusos atrás de UTC (ex.: horário do Brasil).
 */
export function formatDate(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR')
}

/**
 * Converte o atalho mês/ano do recebimento (input type="month", "YYYY-MM")
 * pra uma data de validade completa: o último dia daquele mês, convenção
 * comum de embalagem que só imprime mês/ano ("Val. 08/2026" = vence no
 * fim de agosto, não no dia 1).
 */
export function monthToExpiryDate(monthValue: string): string {
  const [year, month] = monthValue.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

/** Extrai "YYYY-MM" de uma data de validade pro atalho mês/ano no formulário. */
export function expiryDateToMonth(expiryDate: string | null): string {
  if (!expiryDate) return ''
  return expiryDate.slice(0, 7)
}

/**
 * Dias até o vencimento (negativo = já venceu). Parse manual em vez de
 * `new Date(string)` pelo mesmo motivo do formatDate: uma data pura
 * ("YYYY-MM-DD") interpretada como meia-noite UTC "volta" um dia em fusos
 * atrás de UTC. Usado no alerta do dashboard, no bloqueio do PDV e na
 * tabela de conferência do lote.
 */
export function daysUntilExpiry(expiryDate: string): number {
  const [year, month, day] = expiryDate.split('-').map(Number)
  const expiry = new Date(year, month - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

/** Data e hora (timestamps completos, ex.: `created_at`), padrão brasileiro. */
export function formatDateTime(isoDateTime: string): string {
  return new Date(isoDateTime).toLocaleString('pt-BR')
}

/**
 * Único formatador de moeda do app (DESIGN.md: "Todos os valores em
 * R$ 0.000,00"). Instância criada uma vez e reaproveitada -- Intl.NumberFormat
 * é caro de construir e esse helper é chamado em toda lista/tabela.
 */
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

/**
 * Extrai os dígitos digitados (ignora tudo que não é número) e devolve o
 * valor decimal correspondente, tratando cada dígito como centavo -- mesma
 * convenção de máscara de moeda dos apps bancários (digitar "1234" vira
 * R$ 12,34). String vazia quando não sobra nenhum dígito, pra distinguir
 * "campo ainda não preenchido" de "R$ 0,00" nos formulários que dependem
 * disso (ex.: troco só calcula quando `amountReceived !== ''`).
 */
export function maskCurrencyInput(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, '')
  if (digits === '') return ''
  return (Number(digits) / 100).toFixed(2)
}

/** Formata o valor decimal (mesma convenção de `maskCurrencyInput`) pro
 * texto exibido dentro do campo mascarado -- string vazia continua vazia,
 * pra mostrar o placeholder em vez de forçar "R$ 0,00". */
export function displayCurrencyValue(decimalValue: string): string {
  if (decimalValue === '') return ''
  return formatCurrency(Number(decimalValue))
}
