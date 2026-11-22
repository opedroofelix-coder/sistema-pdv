import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { formatCurrency } from '../../lib/format'
import type { StockItem } from '../../lib/types'

interface LabelPrintProps {
  items: StockItem[]
}

function Label({ item }: { item: StockItem }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const code = item.product_catalog?.ean || item.internal_code || ''
  const isEan13 = /^\d{13}$/.test(code)

  useEffect(() => {
    if (!svgRef.current || !code) return
    JsBarcode(svgRef.current, code, {
      format: isEan13 ? 'EAN13' : 'CODE128',
      width: 1.6,
      height: 40,
      fontSize: 12,
      margin: 4,
    })
  }, [code, isEan13])

  return (
    <div className="label flex w-[38mm] flex-col items-center border border-dashed border-gray-300 bg-white p-1 text-center">
      <span className="line-clamp-1 text-[9px] font-medium text-gray-900">
        {item.product_catalog?.name ?? 'Sem descrição'}
      </span>
      <svg ref={svgRef} />
      <span className="text-[10px] font-semibold text-gray-900">
        {formatCurrency(item.sale_price)}
      </span>
    </div>
  )
}

export function LabelPrint({ items }: LabelPrintProps) {
  return (
    <div className="label-sheet flex flex-wrap gap-2 print:gap-1">
      {items.map((item) => (
        <Label key={item.id} item={item} />
      ))}
    </div>
  )
}
