import { describe, expect, it } from 'vitest'
import {
  displayCurrencyValue,
  expiryDateToMonth,
  formatCurrency,
  formatDate,
  maskCurrencyInput,
  monthToExpiryDate,
} from './format'

describe('formatCurrency', () => {
  it('formata zero', () => {
    expect(formatCurrency(0)).toBe('R$ 0,00')
  })

  it('formata centavos', () => {
    expect(formatCurrency(0.05)).toBe('R$ 0,05')
  })

  it('formata milhar com separador de ponto', () => {
    expect(formatCurrency(1234.5)).toBe('R$ 1.234,50')
  })

  it('formata milhão com dois separadores de milhar', () => {
    expect(formatCurrency(1000000)).toBe('R$ 1.000.000,00')
  })

  it('formata valores negativos com o sinal antes do símbolo', () => {
    expect(formatCurrency(-50)).toBe('-R$ 50,00')
  })

  it('arredonda pra duas casas decimais', () => {
    expect(formatCurrency(9.999)).toBe('R$ 10,00')
  })
})

describe('maskCurrencyInput', () => {
  it('trata dígitos como centavos', () => {
    expect(maskCurrencyInput('1234')).toBe('12.34')
  })

  it('string vazia continua vazia (campo não preenchido)', () => {
    expect(maskCurrencyInput('')).toBe('')
  })

  it('ignora tudo que não é dígito (R$, ponto, vírgula)', () => {
    expect(maskCurrencyInput('R$ 1.234,56')).toBe('1234.56')
  })

  it('um único dígito vira centavos (0,05)', () => {
    expect(maskCurrencyInput('5')).toBe('0.05')
  })

  it('zeros à esquerda não alteram o valor', () => {
    expect(maskCurrencyInput('0050')).toBe('0.50')
  })

  it('só caracteres não numéricos vira vazio', () => {
    expect(maskCurrencyInput('R$ ,.')).toBe('')
  })
})

describe('displayCurrencyValue', () => {
  it('formata um valor decimal como moeda (mesma saída de formatCurrency)', () => {
    expect(displayCurrencyValue('12.34')).toBe(formatCurrency(12.34))
  })

  it('string vazia continua vazia (mostra o placeholder)', () => {
    expect(displayCurrencyValue('')).toBe('')
  })

  it('round-trip com maskCurrencyInput fica estável', () => {
    const masked = maskCurrencyInput('R$ 1.234,56')
    expect(displayCurrencyValue(masked)).toBe(formatCurrency(1234.56))
  })
})

describe('formatDate', () => {
  it('formata no padrão dd/mm/aaaa', () => {
    expect(formatDate('2026-07-28')).toBe('28/07/2026')
  })

  it('preserva zero à esquerda em dia e mês', () => {
    expect(formatDate('2026-01-05')).toBe('05/01/2026')
  })

  it('lida com 29 de fevereiro em ano bissexto', () => {
    expect(formatDate('2024-02-29')).toBe('29/02/2024')
  })

  it('não retrocede o dia por causa de fuso horário (regressão UTC)', () => {
    // new Date('2026-01-01') interpretaria a string como meia-noite UTC, que
    // em fusos atrás de UTC (ex.: horário do Brasil) mostraria 31/12/2025.
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
  })
})

describe('monthToExpiryDate', () => {
  it('converte pro último dia de um mês de 31 dias', () => {
    expect(monthToExpiryDate('2026-08')).toBe('2026-08-31')
  })

  it('converte pro último dia de um mês de 30 dias', () => {
    expect(monthToExpiryDate('2026-04')).toBe('2026-04-30')
  })

  it('converte pro último dia de fevereiro em ano bissexto', () => {
    expect(monthToExpiryDate('2024-02')).toBe('2024-02-29')
  })

  it('converte pro último dia de fevereiro fora de ano bissexto', () => {
    expect(monthToExpiryDate('2026-02')).toBe('2026-02-28')
  })
})

describe('expiryDateToMonth', () => {
  it('extrai ano-mês de uma data de validade', () => {
    expect(expiryDateToMonth('2026-08-31')).toBe('2026-08')
  })

  it('retorna string vazia quando não há validade', () => {
    expect(expiryDateToMonth(null)).toBe('')
  })
})
