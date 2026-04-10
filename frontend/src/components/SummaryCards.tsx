import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  getMonthlyCCNetBreakdown,
  getMonthlyAccountBreakdown, getMonthlyIncomeAccountBreakdown,
  getYearlyCCNetBreakdown,
  getYearlyAccountBreakdown, getYearlyIncomeAccountBreakdown,
} from '../api/client'
import type { AccountTypeBreakdown, MonthlySummary } from '../types'

interface Props {
  summary: MonthlySummary
  label?: string
  year?: number
  month?: number
  byAccountType?: AccountTypeBreakdown | null
  missingCCWarning?: boolean
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

type AccountRow = { name: string; color: string; last4: string | null; amount: number }

function AccountTooltip({
  show, loading, rows, total, title, accentClass,
}: {
  show: boolean
  loading: boolean
  rows: AccountRow[] | null
  total: number
  title: string
  accentClass: string
}) {
  if (!show) return null
  return (
    <div className="absolute left-0 top-full mt-2 z-50 w-64 bg-surface-card border border-surface-border rounded-xl shadow-xl p-4">
      <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${accentClass}`}>{title}</p>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const pct = total > 0 ? (row.amount / total) * 100 : 0
            return (
              <li key={i}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                    <span className="text-text truncate">
                      {row.name}{row.last4 ? ` ···${row.last4}` : ''}
                    </span>
                  </div>
                  <span className="text-text font-medium ml-2 flex-shrink-0">{fmtFull(row.amount)}</span>
                </div>
                <div className="h-1 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: row.color }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-text-faint text-center py-2">No data</p>
      )}
    </div>
  )
}


function Card({
  title, value, sub, valueClass, accentColor, tooltip, children, delayMs = 0,
}: {
  title: string; value: string; sub?: string; valueClass: string
  accentColor: string; tooltip?: string; children?: ReactNode; delayMs?: number;
}) {
  return (
    <div 
      className="relative p-5 transition-all duration-300 hover:bg-surface-hover/50 hover:z-10 group/card flex flex-col justify-center"
      style={{
        animation: `card-slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${delayMs}ms both`,
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 group-hover/card:w-2 transition-all duration-300 opacity-90" style={{ backgroundColor: accentColor }} />
      <p className="text-xs text-text-faint font-medium uppercase tracking-wide flex items-center gap-1">
        {title}
        {tooltip && (
          <span 
            className="relative group/tooltip inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            tabIndex={0}
            onMouseEnter={e => e.stopPropagation()} 
            onMouseLeave={e => e.stopPropagation()}
            onFocus={e => e.stopPropagation()}
            onBlur={e => e.stopPropagation()}
            aria-label="More information"
          >
            <svg className="w-3 h-3 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-surface-card border border-surface-border shadow-lg px-3 py-2 text-xs text-text-muted opacity-0 group-hover/tooltip:opacity-100 group-focus/tooltip:opacity-100 transition-opacity z-50 whitespace-normal normal-case tracking-normal">
              {tooltip}
            </span>
          </span>
        )}
      </p>
      <p className={`text-[22px] font-mono font-bold mt-1 tracking-tight ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-text-faint mt-1.5">{sub}</p>}
      {children}
    </div>
  )
}

export default function SummaryCards({ summary, label, year, month, byAccountType, missingCCWarning = false }: Props) {
  const isPositive = summary.net >= 0
  const savingsGood = summary.savings_rate >= 20
  const savingsOk   = summary.savings_rate >= 0

  // ── Total Income hover — breakdown by account ──
  const [showIncome, setShowIncome] = useState(false)
  const [incomeRows, setIncomeRows] = useState<AccountRow[] | null>(null)
  const [loadingIncome, setLoadingIncome] = useState(false)
  const fetchedIncome = useRef(false)

  const handleIncomeHover = () => {
    setShowIncome(true)
    if (fetchedIncome.current || !year) return
    fetchedIncome.current = true
    setLoadingIncome(true)
    const req = month
      ? getMonthlyIncomeAccountBreakdown(year, month, 'bank_account')
      : getYearlyIncomeAccountBreakdown(year, 'bank_account')
    req.then(r => setIncomeRows(r.data)).finally(() => setLoadingIncome(false))
  }

  // ── Total Spending hover — breakdown by account ──
  const [showSpending, setShowSpending] = useState(false)
  const [spendingRows, setSpendingRows] = useState<AccountRow[] | null>(null)
  const [loadingSpending, setLoadingSpending] = useState(false)
  const fetchedSpending = useRef(false)

  const handleSpendingHover = () => {
    setShowSpending(true)
    if (fetchedSpending.current || !year) return
    fetchedSpending.current = true
    setLoadingSpending(true)
    const req = month
      ? getMonthlyAccountBreakdown(year, month, 'bank_account')
      : getYearlyAccountBreakdown(year, 'bank_account')
    req.then(r => setSpendingRows(r.data)).finally(() => setLoadingSpending(false))
  }

  // ── Credit Cards hover ──
  const [showCC, setShowCC] = useState(false)
  const [ccRows, setCCRows] = useState<AccountRow[] | null>(null)
  const [loadingCC, setLoadingCC] = useState(false)
  const fetchedCC = useRef(false)

  const handleCCHover = () => {
    setShowCC(true)
    if (fetchedCC.current || !year) return
    fetchedCC.current = true
    setLoadingCC(true)
    const req = month
      ? getMonthlyCCNetBreakdown(year, month)
      : getYearlyCCNetBreakdown(year)
    req.then(r => setCCRows(r.data)).finally(() => setLoadingCC(false))
  }

  const incomeTotal   = incomeRows?.reduce((s, r) => s + r.amount, 0) ?? summary.income
  const spendingTotal = spendingRows?.reduce((s, r) => s + r.amount, 0) ?? summary.expenses
  const ccTotal       = ccRows?.reduce((s, r) => s + r.amount, 0) ?? byAccountType?.cc_spending ?? 0

  const hasCCData = byAccountType && (byAccountType.cc_spending > 0 || byAccountType.cc_refunds > 0)

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes card-slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {missingCCWarning && (
        <div className="flex items-start gap-3 px-4 py-3 bg-warning-light border border-warning/20 rounded-xl text-sm text-warning-text">
          <svg aria-hidden="true" className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>
            Credit card payments detected in your bank statement, but no credit card transactions found this month.
            Upload your credit card statement for a complete picture.
          </span>
        </div>
      )}

      {/* ── Period banner ── */}
      {label && (
        <div className="flex items-center gap-4 px-1 pb-3">
          <h2 className="font-serif text-2xl font-semibold text-text tracking-tight leading-none">{label}</h2>
          <div className="flex-1 h-px bg-surface-border" />
        </div>
      )}

      {/* ── Row 1: 5 KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 border border-surface-border bg-surface-card shadow-lg rounded-xl overflow-visible divide-y md:divide-y-0 md:divide-x divide-surface-border">

        {/* Total Income */}
        <div
          className="relative p-5 overflow-visible transition-all duration-300 hover:bg-surface-hover/50 group/card md:rounded-l-xl flex flex-col justify-center hover:z-10 focus:outline-none focus:bg-surface-hover/50 focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-primary"
          tabIndex={0}
          onMouseEnter={handleIncomeHover}
          onMouseLeave={() => setShowIncome(false)}
          onFocus={handleIncomeHover}
          onBlur={() => setShowIncome(false)}
          style={{ animation: 'card-slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0ms both' }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1.5 group-hover/card:w-2 transition-all duration-300 bg-income opacity-90 md:rounded-l-xl" />
          <p className="text-xs text-text-faint font-medium uppercase tracking-widest flex items-center gap-1">
            Total Income
            <span 
              className="relative group/tooltip inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm" 
              tabIndex={0}
              onMouseEnter={e => e.stopPropagation()} 
              onMouseLeave={e => e.stopPropagation()}
              onFocus={e => e.stopPropagation()}
              onBlur={e => e.stopPropagation()}
              aria-label="More information about Total Income"
            >
              <svg className="w-3 h-3 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-surface-card border border-surface-border shadow-lg px-3 py-2 text-xs text-text-muted opacity-0 group-hover/tooltip:opacity-100 group-focus/tooltip:opacity-100 transition-opacity z-50 normal-case tracking-normal font-normal">
                Money deposited into your bank accounts — payroll, direct deposits, and interest. Credit card refunds are not included.
              </span>
            </span>
          </p>
          <p className="text-[24px] font-mono font-bold mt-1.5 tracking-tight text-income">{fmt(summary.income)}</p>
          {label && <p className="text-[11px] text-text-faint mt-1.5 uppercase tracking-widest font-medium">{label}</p>}
          <AccountTooltip
            show={showIncome && !!year}
            loading={loadingIncome}
            rows={incomeRows}
            total={incomeTotal}
            title="Income by Account"
            accentClass="text-income"
          />
        </div>

        {/* Total Spending */}
        <div
          className="relative p-5 overflow-visible transition-all duration-300 hover:bg-surface-hover/50 group/card flex flex-col justify-center hover:z-10 focus:outline-none focus:bg-surface-hover/50 focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-primary"
          tabIndex={0}
          onMouseEnter={handleSpendingHover}
          onMouseLeave={() => setShowSpending(false)}
          onFocus={handleSpendingHover}
          onBlur={() => setShowSpending(false)}
          style={{ animation: 'card-slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 80ms both' }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1.5 group-hover/card:w-2 transition-all duration-300 bg-expense opacity-90" />
          <p className="text-xs text-text-faint font-medium uppercase tracking-wide flex items-center gap-1">
            Total Spending
            <span 
              className="relative group/tooltip inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm" 
              tabIndex={0}
              onMouseEnter={e => e.stopPropagation()} 
              onMouseLeave={e => e.stopPropagation()}
              onFocus={e => e.stopPropagation()}
              onBlur={e => e.stopPropagation()}
              aria-label="More information about Total Spending"
            >
              <svg className="w-3 h-3 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-surface-card border border-surface-border shadow-lg px-3 py-2 text-xs text-text-muted opacity-0 group-hover/tooltip:opacity-100 group-focus/tooltip:opacity-100 transition-opacity z-50 normal-case tracking-normal font-normal">
                Cash out of your bank accounts — direct purchases plus credit card bill payments. Individual card charges are shown separately in the pie chart.
              </span>
            </span>
          </p>
          <p className="text-[24px] font-mono font-bold mt-1.5 tracking-tight text-expense">{fmt(summary.expenses)}</p>
          {label && <p className="text-[11px] text-text-faint mt-1.5 uppercase tracking-widest font-medium">{label}</p>}
          <AccountTooltip
            show={showSpending && !!year}
            loading={loadingSpending}
            rows={spendingRows}
            total={spendingTotal}
            title="Spending by Account"
            accentClass="text-expense"
          />
        </div>

        {/* Saved */}
        <Card
          title="Saved"
          value={fmt(Math.abs(summary.net))}
          sub={isPositive ? 'saved this month' : 'overspent'}
          valueClass={isPositive ? 'text-net' : 'text-warning'}
          accentColor={isPositive ? 'var(--income)' : 'var(--warning)'}
          delayMs={160}
        />

        {/* Savings Rate */}
        {summary.income >= 1 ? (
          <Card
            title="Savings Rate"
            value={`${summary.savings_rate.toFixed(1)}%`}
            sub={`of ${fmt(summary.income)} income`}
            valueClass={savingsGood ? 'text-savings' : savingsOk ? 'text-warning' : 'text-expense'}
            accentColor={savingsGood ? 'var(--income)' : savingsOk ? 'var(--warning)' : 'var(--expense)'}
            delayMs={240}
          />
        ) : (
          <div 
            className="relative p-5 overflow-visible transition-all duration-300 hover:bg-surface-hover/50 group/card hover:z-10"
            style={{ animation: 'card-slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 240ms both' }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1.5 group-hover/card:w-2 transition-all duration-300 bg-surface-border opacity-90" />
            <div className="flex flex-col justify-center h-full">
              <p className="text-xs text-text-faint font-medium uppercase tracking-wide">Savings Rate</p>
              <p className="text-text-faint text-xs mt-3 leading-snug">Update income to see rate</p>
            </div>
          </div>
        )}

        {/* Credit Cards — 5th card */}
        {hasCCData && byAccountType ? (
          <div
            className="relative p-5 overflow-visible transition-all duration-300 hover:bg-surface-hover/50 group/card md:rounded-r-xl hover:z-10 focus:outline-none focus:bg-surface-hover/50 focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-primary"
            tabIndex={0}
            onMouseEnter={handleCCHover}
            onMouseLeave={() => setShowCC(false)}
            onFocus={handleCCHover}
            onBlur={() => setShowCC(false)}
            style={{ animation: 'card-slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 320ms both' }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1.5 group-hover/card:w-2 transition-all duration-300 bg-expense opacity-90" />
            <p className="text-xs text-text-faint font-medium uppercase tracking-wide mb-3">Credit Cards</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Charges</span>
                <span className="text-sm font-mono text-expense">{fmt(byAccountType.cc_spending)}</span>
              </div>
              {byAccountType.cc_refunds > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Refunds</span>
                  <span className="text-sm font-mono text-income">+{fmt(byAccountType.cc_refunds)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-surface-border">
                <span className="text-xs font-medium text-text-muted">Net</span>
                <span className={`text-[15px] font-mono tracking-tight ${byAccountType.net_cc > 0 ? 'text-expense' : 'text-income'}`}>
                  {fmt(byAccountType.net_cc)}
                </span>
              </div>
            </div>
            <AccountTooltip
              show={showCC && !!year}
              loading={loadingCC}
              rows={ccRows}
              total={ccTotal}
              title="Net Charges by Account"
              accentClass="text-expense"
            />
          </div>
        ) : (
          <div 
            className="relative p-5 overflow-visible transition-all duration-300 hover:bg-surface-hover/50 group/card text-center flex flex-col items-center justify-center gap-2 md:rounded-r-xl hover:z-10"
            style={{ animation: 'card-slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) 320ms both' }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1.5 group-hover/card:w-2 transition-all duration-300 bg-surface-border opacity-90" />
            <svg aria-hidden="true" className="w-6 h-6 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeWidth="1.5" />
              <path strokeLinecap="round" strokeWidth="1.5" d="M1 10h22" />
            </svg>
            <div>
              <p className="text-[11px] text-text-faint font-medium uppercase tracking-wide mb-1">Credit Cards</p>
              <p className="text-xs text-text-faint">Upload CC statement</p>
            </div>
          </div>
        )}

      </div>

    </div>
  )
}
