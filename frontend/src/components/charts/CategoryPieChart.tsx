import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Category, CategoryAmount, PieSource } from '../../types'

const DEFAULT_COLOR = '#a8a29e'
const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

interface Props {
  data: CategoryAmount[]          // "all" — bank direct + CC charges
  dataBank?: CategoryAmount[]     // bank direct only
  dataCC?: CategoryAmount[]       // CC charges only
  categoryDefs?: Category[]
  onCategoryClick?: (cat: string) => void
  selectedCategory?: string
  ccPaymentsTotal?: number
}

const SOURCE_LABELS: { value: PieSource; label: string }[] = [
  { value: 'all',  label: 'All' },
  { value: 'bank', label: 'Bank' },
  { value: 'cc',   label: 'CC' },
]

export default function CategoryPieChart({
  data,
  dataBank = [],
  dataCC = [],
  categoryDefs = [],
  onCategoryClick,
  selectedCategory,
  ccPaymentsTotal = 0,
}: Props) {
  const [source, setSource] = useState<PieSource>('all')

  const activeData = source === 'bank' ? dataBank : source === 'cc' ? dataCC : data

  const colorOf = (name: string) =>
    categoryDefs.find(c => c.name === name)?.color ?? DEFAULT_COLOR

  const total = activeData.reduce((s, d) => s + d.amount, 0)
  const top = activeData.slice(0, 8)
  const remainder = activeData.slice(8).reduce((s, d) => s + d.amount, 0)
  let chartData: CategoryAmount[]
  if (remainder > 0) {
    const existingOther = top.find(d => d.name === 'Other')
    chartData = existingOther
      ? top.map(d => d.name === 'Other' ? { ...d, amount: d.amount + remainder } : d)
      : [...top, { name: 'Other', amount: remainder }]
  } else {
    chartData = top
  }

  const isEmpty = activeData.length === 0

  return (
    <div className="group bg-surface-card rounded-xl border border-surface-border shadow-md flex flex-col h-full transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-expense/30">
      {/* Header row: title + source toggle */}
      <div className="chart-header-expense flex items-center justify-between shrink-0 transition-colors duration-500 group-hover:bg-expense/[0.08]">
        <h3 className="text-sm font-semibold text-text transition-transform duration-500 group-hover:translate-x-0.5">Spending by Category</h3>
        <div className="flex rounded-lg border border-surface-border overflow-hidden text-xs flex-shrink-0">
          {SOURCE_LABELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSource(value)}
              aria-pressed={source === value}
              className={`flex items-center justify-center px-4 py-3 md:px-3 md:py-1.5 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 font-medium transition-colors ${
                source === value
                  ? 'bg-primary text-white'
                  : 'bg-surface-card text-text-muted hover:bg-surface-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 pb-5 pt-3">
        <p className="text-xs text-text-muted mb-3">Total: <span className="font-mono font-medium text-primary">{fmt(total)}</span></p>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-44 gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg aria-hidden="true" className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-text-muted">No spending data</p>
              <p className="text-xs text-text-faint mt-1">Upload a statement to see your breakdown</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-shrink-0" style={{ height: 180 }}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="amount"
                    onClick={(entry) => onCategoryClick?.(entry.name)}
                    cursor={onCategoryClick ? 'pointer' : 'default'}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={colorOf(entry.name)}
                      opacity={selectedCategory && selectedCategory !== entry.name ? 0.35 : 1}
                      stroke={selectedCategory === entry.name ? 'var(--ring)' : 'none'}
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const { name, value } = payload[0]
                    return (
                      <div style={{
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--card)',
                        color: 'var(--foreground)',
                        fontSize: '12px',
                        padding: '6px 10px',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{ fontWeight: 500 }}>{name}</span>
                        <span style={{ color: 'var(--muted-foreground)', margin: '0 4px' }}>·</span>
                        <span>{fmt(value as number)}</span>
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 overflow-y-auto max-h-48 space-y-0.5 scrollbar-thin">
            {chartData.map((entry) => {
              const pct = total > 0 ? (entry.amount / total) * 100 : 0
              const isSelected = selectedCategory === entry.name
              return (
                <button
                  key={entry.name}
                  onClick={() => onCategoryClick?.(entry.name)}
                  aria-pressed={isSelected}
                  aria-label={`${entry.name}: ${fmt(entry.amount)} (${pct.toFixed(0)}%)`}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    isSelected ? 'bg-primary-light ring-1 ring-primary' : 'hover:bg-surface-hover'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colorOf(entry.name) }}
                  />
                  <span className="text-xs text-text flex-1 truncate">{entry.name}</span>
                  <span className="text-xs text-text-muted">{pct.toFixed(0)}%</span>
                  <span className="text-xs font-mono font-medium" style={{ color: colorOf(entry.name) }}>{fmt(entry.amount)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {ccPaymentsTotal > 0 && (
        <p className="text-xs text-text-faint mt-3 pt-2.5 border-t border-surface-border">
          ⓘ CC bill payments ({fmt(ccPaymentsTotal)}) are not shown — individual charges appear above
        </p>
      )}
      </div>
    </div>
  )
}
