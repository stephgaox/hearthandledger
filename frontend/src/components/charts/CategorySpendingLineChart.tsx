import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getTransactions } from '../../api/client'
import type { Category } from '../../types'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const DEFAULT_CATEGORY = 'Bills & Utilities'

interface Props {
  year: number
  categories: Category[]
}

export default function CategorySpendingLineChart({ year, categories }: Props) {
  const [selectedCat, setSelectedCat] = useState<string>('')
  const [chartData, setChartData] = useState<{ name: string; amount: number }[]>([])
  const [loading, setLoading] = useState(false)

  // Pick default category when list loads
  useEffect(() => {
    if (categories.length === 0) return
    setSelectedCat(prev => {
      if (prev && categories.some(c => c.name === prev)) return prev
      const def = categories.find(c => c.name === DEFAULT_CATEGORY)
      return def ? def.name : categories[0].name
    })
  }, [categories])

  // Fetch + aggregate by month whenever year or category changes
  useEffect(() => {
    if (!selectedCat) return
    setLoading(true)
    getTransactions({ year, category: selectedCat })
      .then(r => {
        const byMonth: Record<number, number> = {}
        for (const tx of r.data) {
          if (tx.type === 'expense' || tx.type === 'transfer_out') {
            const m = parseInt(tx.date.slice(5, 7), 10)
            byMonth[m] = (byMonth[m] ?? 0) + tx.amount
          }
        }
        setChartData(
          MONTH_SHORT.map((label, i) => ({ name: label, amount: byMonth[i + 1] ?? 0 }))
        )
      })
      .finally(() => setLoading(false))
  }, [year, selectedCat])

  const catColor = categories.find(c => c.name === selectedCat)?.color ?? '#6366f1'
  const hasData = chartData.some(d => d.amount > 0)

  return (
    <div className="bg-surface-card rounded-xl border border-surface-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-text">Category Trend</h3>
        <select
          value={selectedCat}
          onChange={e => setSelectedCat(e.target.value)}
          aria-label="Select category for trend chart"
          className="text-xs border border-surface-border rounded-lg px-2 py-1.5 bg-surface-card text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {categories.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[220px]">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasData ? (
        <div className="flex flex-col items-center justify-center h-[220px]">
          <svg aria-hidden="true" className="w-8 h-8 text-text-faint mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <p className="text-sm text-text-muted">No data for {year}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip
              formatter={(value: number) => [fmt(value), selectedCat]}
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--foreground)',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)',
                fontSize: '13px',
              }}
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke={catColor}
              strokeWidth={2}
              dot={{ fill: catColor, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
