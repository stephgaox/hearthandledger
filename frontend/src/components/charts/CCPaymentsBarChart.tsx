import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CCPaymentMonthItem } from '../../types'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

interface Props {
  data: CCPaymentMonthItem[]
}

// Collect the ordered set of unique card ids across all months (stable order = first appearance)
function getCardKeys(data: CCPaymentMonthItem[]): { id: string; name: string; color: string }[] {
  const seen = new Map<string, { id: string; name: string; color: string }>()
  for (const month of data) {
    for (const card of month.cards) {
      if (!seen.has(card.id)) seen.set(card.id, { id: card.id, name: card.name, color: card.color })
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { dataKey: string; value: number; fill: string; name: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0)
  const entries = payload.filter(p => p.value > 0).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-text mb-2">{label}</p>
      {entries.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.fill }} />
            <span className="text-text-muted truncate">{p.name}</span>
          </span>
          <span className="font-medium text-text flex-shrink-0">{fmt(p.value)}</span>
        </div>
      ))}
      {entries.length > 1 && (
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-surface-border">
          <span className="text-text-muted font-medium">Total</span>
          <span className="font-semibold text-text">{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

export default function CCPaymentsBarChart({ data }: Props) {
  const cardKeys = getCardKeys(data)
  const hasData = data.some(d => d.total > 0)

  const firstYear = data[0]?.year
  const chartData = data.map(d => {
    const row: Record<string, number | string> = {
      name: `${MONTH_SHORT[d.month - 1]}${d.year !== firstYear ? ` '${String(d.year).slice(2)}` : ''}`,
    }
    for (const card of d.cards) {
      row[card.id] = card.amount
    }
    return row
  })

  return (
    <div className="group/card bg-surface-card rounded-xl border border-surface-border shadow-md h-full flex flex-col transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-primary/30">
      <div className="chart-header-primary flex items-center gap-1.5 shrink-0 transition-colors duration-500 group-hover/card:bg-primary/10">
        <h3 className="text-sm font-semibold transition-transform duration-500 group-hover/card:translate-x-0.5">
          <span className="text-primary">CC</span>
          <span className="text-text"> Payments by Card</span>
        </h3>
        {hasData && cardKeys.length > 0 && (
          <span className="relative group">
            <svg aria-hidden="true" className="w-3.5 h-3.5 text-text-faint cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <div className="bg-surface-card border border-surface-border rounded-xl shadow-xl p-3 space-y-1.5 w-max max-w-[200px]">
                {cardKeys.map(c => (
                  <span key={c.id} className="flex items-center gap-2 text-xs text-text-muted whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          </span>
        )}
      </div>

      <div className="flex-1 w-full relative px-5 pb-5 pt-4 flex flex-col justify-end">
        {!hasData ? (
        <div className="flex flex-col items-center justify-center h-[220px] text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg aria-hidden="true" className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeWidth="1.5" />
              <path strokeLinecap="round" strokeWidth="1.5" d="M1 10h22" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-text-muted">No CC payments found</p>
            <p className="text-xs text-text-faint mt-1">Upload both bank and CC statements to see payments by card</p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barSize={24}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--chart-cursor)', radius: 4 }} />
            {cardKeys.map(card => (
              <Bar key={card.id} dataKey={card.id} name={card.name} stackId="a" fill={card.color} radius={0}>
                {chartData.map((_, i) => <Cell key={i} fill={card.color} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
      </div>
    </div>
  )
}
