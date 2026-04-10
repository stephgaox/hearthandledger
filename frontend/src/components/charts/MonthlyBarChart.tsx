import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyContextItem, MonthlyData } from '../../types'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

interface Props {
  data: (MonthlyData | MonthlyContextItem)[]
  currentMonth?: number
}

export default function MonthlyBarChart({ data, currentMonth }: Props) {
  const years = new Set(data.map(d => ('year' in d ? d.year : 0)))
  const multiYear = years.size > 1

  const chartData = data.map((d) => {
    const label = MONTH_SHORT[d.month - 1]
    const name = multiYear && 'year' in d
      ? `${label} '${String(d.year).slice(2)}`
      : label
    return { name, Income: d.income, Spending: d.expenses, month: d.month }
  })

  return (
    <div className="group bg-surface-card rounded-xl border border-surface-border shadow-md transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:border-income/30">
      <div className="chart-header-income transition-colors duration-500 group-hover:bg-income/10">
        <h3 className="text-sm font-semibold text-text transition-transform duration-500 group-hover:translate-x-0.5">
          <span className="text-income">Income</span>
          <span className="text-text-faint mx-1.5">vs</span>
          <span className="text-expense">Spending</span>
        </h3>
      </div>
      <div className="px-5 pb-5 pt-2">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} barCategoryGap="25%" barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip
            cursor={{ fill: 'var(--chart-cursor)', radius: 4 }}
            formatter={(value: number, name: string) => [fmt(value), name]}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)',
              fontSize: '13px',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '13px', paddingTop: '8px' }}
            iconType="circle"
            iconSize={8}
          />
          <Bar
            dataKey="Income"
            fill="var(--income)"
            radius={[3, 3, 0, 0]}
            maxBarSize={30}
          />
          <Bar
            dataKey="Spending"
            fill="var(--expense)"
            radius={[3, 3, 0, 0]}
            maxBarSize={30}
          />
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
