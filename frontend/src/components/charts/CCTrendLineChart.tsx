import { useEffect, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CCAccountBreakdown, CCMonthlyItem } from '../../types'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const COLORS = {
  charge: 'var(--expense)',
  refund: 'var(--income)',
  net:    'var(--primary)',
}

interface Props {
  data: CCMonthlyItem[]
}

function buildLabelMap(data: CCMonthlyItem[], firstYear: number | undefined) {
  const map: Record<string, CCMonthlyItem> = {}
  for (const d of data) {
    const label = `${MONTH_SHORT[d.month - 1]}${d.year !== firstYear ? ` '${String(d.year).slice(2)}` : ''}`
    map[label] = d
  }
  return map
}

function AccountRows({ accounts, field, color }: {
  accounts: CCAccountBreakdown[]
  field: 'cc_spending' | 'cc_refunds' | 'net_cc'
  color: string
}) {
  const relevant = accounts.filter(a => a[field] !== 0).slice().sort((a, b) => a.name.localeCompare(b.name))
  if (relevant.length === 0) return null
  return (
    <ul className="mt-1 space-y-1 pl-3.5">
      {relevant.map((a, i) => (
        <li key={i} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || color }} />
            <span className="text-text-faint truncate">{a.name}{a.last4 ? ` ···${a.last4}` : ''}</span>
          </span>
          <span className="text-text-faint flex-shrink-0">{fmt(a[field])}</span>
        </li>
      ))}
    </ul>
  )
}

function CustomTooltip({
  active, label, labelMap,
}: {
  active?: boolean
  label?: string
  payload?: unknown[]
  labelMap: Record<string, CCMonthlyItem>
}) {
  if (!active || !label) return null
  const item = labelMap[label]
  if (!item) return null

  return (
    <div
      className="bg-surface-card border border-surface-border rounded-xl shadow-xl p-3 text-xs min-w-[180px] max-w-[240px]"
      style={{ animation: 'cc-tooltip-in 160ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
    >
      <p className="font-semibold text-text mb-2.5">{label}</p>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.charge }} />
          <span className="text-text-muted font-medium">Charges</span>
        </span>
        <span className="font-semibold text-text">{fmt(item.cc_spending)}</span>
      </div>
      <AccountRows accounts={item.accounts} field="cc_spending" color={COLORS.charge} />

      {item.cc_refunds > 0 && (
        <>
          <div className="flex items-center justify-between mt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.refund }} />
              <span className="text-text-muted font-medium">Refunds</span>
            </span>
            <span className="font-semibold text-text">{fmt(item.cc_refunds)}</span>
          </div>
          <AccountRows accounts={item.accounts} field="cc_refunds" color={COLORS.refund} />
        </>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-border">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.net }} />
          <span className="text-text-muted font-medium">Net</span>
        </span>
        <span className="font-semibold text-text">{fmt(item.net_cc)}</span>
      </div>
      <AccountRows accounts={item.accounts} field="net_cc" color={COLORS.net} />
    </div>
  )
}

// Pulsing active dot with an animated outer ring
function PulsingDot({ cx, cy, fill }: { cx?: number; cy?: number; fill: string }) {
  if (cx === undefined || cy === undefined) return null
  return (
    <g>
      <circle
        cx={cx} cy={cy} r={8} fill={fill} fillOpacity={0.15}
        style={{ animation: 'cc-dot-pulse 1.4s cubic-bezier(0.25, 1, 0.5, 1) infinite' }}
      />
      <circle cx={cx} cy={cy} r={5} fill={fill} />
    </g>
  )
}

export default function CCTrendLineChart({ data }: Props) {
  const hasData = data.some(d => d.cc_spending > 0 || d.cc_refunds > 0)
  const firstYear = data[0]?.year
  const labelMap = buildLabelMap(data, firstYear)

  const chartData = data.map(d => ({
    name: `${MONTH_SHORT[d.month - 1]}${d.year !== firstYear ? ` '${String(d.year).slice(2)}` : ''}`,
    charge: d.cc_spending,
    refund: d.cc_refunds,
    net:    d.net_cc,
  }))

  // Fade-up entrance on mount
  const [visible, setVisible] = useState(false)
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      requestAnimationFrame(() => setVisible(true))
    }
  }, [])

  return (
    <>
      <style>{`
        @keyframes cc-tooltip-in {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes cc-dot-pulse {
          0%, 100% { r: 8;  opacity: 0.15; }
          50%       { r: 12; opacity: 0.05; }
        }
        @keyframes cc-legend-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className={`group bg-surface-card rounded-xl border border-surface-border shadow-md h-full flex flex-col transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-xl hover:border-primary/30 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        <div className="chart-header-primary shrink-0 flex items-center justify-between gap-2 flex-wrap transition-colors duration-500 group-hover:bg-primary/10">
          <h3 className="text-sm font-semibold text-text transition-transform duration-500 group-hover:translate-x-0.5">Credit Card Trend</h3>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {([
              { color: COLORS.charge, label: 'Charges', delay: '0ms'   },
              { color: COLORS.refund, label: 'Refunds', delay: '80ms'  },
              { color: COLORS.net,    label: 'Net',     delay: '160ms' },
            ] as const).map(({ color, label, delay }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: color,
                    animation: visible 
                      ? `cc-legend-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay} both` 
                      : 'none',
                  }}
                />
                <span 
                  className="font-medium"
                  style={{
                    animation: visible 
                      ? `cc-tooltip-in 0.4s ease-out ${delay} both` 
                      : 'none',
                  }}
                >{label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 w-full relative px-5 pb-5 pt-3 flex flex-col justify-end">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-center">
              <svg aria-hidden="true" className="w-8 h-8 text-text-faint mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeWidth="1.5" />
                <path strokeLinecap="round" strokeWidth="1.5" d="M1 10h22" />
              </svg>
              <p className="text-sm text-text-muted">No credit card data</p>
              <p className="text-xs text-text-faint mt-1">Upload a CC statement to see trends</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ccChargeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.charge} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={COLORS.charge} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ccRefundGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.refund} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={COLORS.refund} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ccNetGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.net} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={COLORS.net} stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Tooltip content={(props) => <CustomTooltip {...props} labelMap={labelMap} />} />

              {/* Charges — draws first */}
              <Area
                type="monotone"
                dataKey="charge"
                name="Charges"
                stroke={COLORS.charge}
                strokeWidth={2}
                fill="url(#ccChargeGrad)"
                dot={{ fill: COLORS.charge, r: 3, strokeWidth: 0 }}
                activeDot={<PulsingDot fill={COLORS.charge as string} />}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />

              {/* Refunds — staggered 200ms */}
              <Area
                type="monotone"
                dataKey="refund"
                name="Refunds"
                stroke={COLORS.refund}
                strokeWidth={2}
                fill="url(#ccRefundGrad)"
                dot={{ fill: COLORS.refund, r: 3, strokeWidth: 0 }}
                activeDot={<PulsingDot fill={COLORS.refund as string} />}
                isAnimationActive={true}
                animationDuration={900}
                animationBegin={200}
                animationEasing="ease-out"
              />

              {/* Net — staggered 400ms */}
              <Area
                type="monotone"
                dataKey="net"
                name="Net"
                stroke={COLORS.net}
                strokeWidth={2}
                fill="url(#ccNetGrad)"
                dot={{ fill: COLORS.net, r: 3, strokeWidth: 0 }}
                activeDot={<PulsingDot fill={COLORS.net as string} />}
                isAnimationActive={true}
                animationDuration={900}
                animationBegin={400}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        </div>
      </div>
    </>
  )
}
