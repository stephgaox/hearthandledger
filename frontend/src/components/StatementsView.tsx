import { useEffect, useState } from 'react'
import { deleteTransactionsByFile, getCategories, getSourceFiles, getTransactions, updateTransaction } from '../api/client'
import type { Account, Category, Transaction } from '../types'

interface SourceFile { file_hash: string; source_file: string; count: number; min_date: string; max_date: string }

interface Props {
  account: Account
  onBack: () => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const isIncoming = (tx: Transaction) =>
  tx.type === 'income' || tx.type === 'transfer_in'

const TYPE_OPTIONS = [
  { value: 'income',       label: '+ Income',      badgeClass: 'bg-income-light text-income' },
  { value: 'expense',      label: '− Expense',     badgeClass: 'bg-expense-light text-expense' },
  { value: 'transfer_in',  label: '↓ Transfer In', badgeClass: 'bg-surface-hover text-text-muted' },
  { value: 'transfer_out', label: '↑ Transfer Out',badgeClass: 'bg-surface-hover text-text-muted' },
  { value: 'transfer',     label: '↕ Transfer',    badgeClass: 'bg-surface-hover text-text-muted' },
] as const

function typeBadgeClass(type: string): string {
  return TYPE_OPTIONS.find(o => o.value === type)?.badgeClass ?? 'bg-surface-hover text-text-muted'
}
function typeLabel(type: string): string {
  return TYPE_OPTIONS.find(o => o.value === type)?.label ?? type
}

export default function StatementsView({ account, onBack }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Filter / sort state — date range replaces text search
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterCat, setFilterCat] = useState('')

  // Inline edit state
  const [editCatId, setEditCatId] = useState<number | null>(null)
  const [editCat, setEditCat] = useState('')
  const [editTypeId, setEditTypeId] = useState<number | null>(null)

  // Files panel
  const [showFiles, setShowFiles] = useState(false)
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileDeletePending, setFileDeletePending] = useState<SourceFile | null>(null)
  const [fileDeleting, setFileDeleting] = useState(false)

  const loadFiles = () => {
    setFilesLoading(true)
    getSourceFiles(account.id)
      .then(r => setSourceFiles(r.data))
      .finally(() => setFilesLoading(false))
  }

  const handleDeleteFile = async () => {
    if (!fileDeletePending) return
    setFileDeleting(true)
    try {
      await deleteTransactionsByFile(fileDeletePending.file_hash)
      setSourceFiles(prev => prev.filter(f => f.file_hash !== fileDeletePending.file_hash))
      setTransactions(prev => prev.filter(t => t.file_hash !== fileDeletePending.file_hash))
      setFileDeletePending(null)
    } finally {
      setFileDeleting(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setDateFrom(''); setDateTo(''); setSortAsc(false); setFilterType(''); setFilterCat('')
    setEditCatId(null); setEditTypeId(null)
    Promise.all([
      getTransactions({ account_id: account.id }),
      getCategories(),
    ]).then(([txRes, catRes]) => {
      setTransactions(txRes.data)
      setCategories(catRes.data.slice().sort((a, b) => a.name.localeCompare(b.name)))
    }).finally(() => setLoading(false))
  }, [account.id])

  const catColor = (name: string) =>
    categories.find(c => c.name === name)?.color ?? '#a89268'

  const handleTypeChange = async (tx: Transaction, newType: Transaction['type']) => {
    await updateTransaction(tx.id, { type: newType })
    setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, type: newType as Transaction['type'] } : t))
    setEditTypeId(null)
  }

  // Flip income↔expense or transfer_in↔transfer_out
  const flipSign = async (tx: Transaction) => {
    const flipped =
      tx.type === 'income'       ? 'expense' :
      tx.type === 'expense'      ? 'income' :
      tx.type === 'transfer_in'  ? 'transfer_out' :
      tx.type === 'transfer_out' ? 'transfer_in' :
      tx.type
    if (flipped === tx.type) return
    await updateTransaction(tx.id, { type: flipped })
    setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, type: flipped as Transaction['type'] } : t))
  }

  const openCatEdit = (tx: Transaction) => {
    setEditTypeId(null)
    setEditCatId(tx.id)
    setEditCat(tx.category)
  }
  const saveCat = async (id: number) => {
    await updateTransaction(id, { category: editCat })
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: editCat } : t))
    setEditCatId(null)
  }

  const filtered = transactions
    .filter(t =>
      (!dateFrom || t.date >= dateFrom) &&
      (!dateTo   || t.date <= dateTo) &&
      (!filterType || t.type === filterType) &&
      (!filterCat  || t.category === filterCat)
    )
    .sort((a, b) =>
      sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
    )

  const hasFilter = !!(dateFrom || dateTo || filterType || filterCat)
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setFilterType(''); setFilterCat('') }

  const catsInList = Array.from(new Set(transactions.map(t => t.category))).sort()

  const byYear: Record<number, Transaction[]> = {}
  for (const tx of filtered) {
    const y = parseInt(tx.date.slice(0, 4))
    if (!byYear[y]) byYear[y] = []
    byYear[y].push(tx)
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => sortAsc ? a - b : b - a)

  const totalIncome  = filtered.filter(isIncoming).reduce((s, t) => s + t.amount, 0)
  const totalExpense = filtered.filter(t => !isIncoming(t)).reduce((s, t) => s + t.amount, 0)

  const handleDownload = () => {
    const rows = [
      ['Date', 'Description', 'Type', 'Category', 'Amount'],
      ...filtered.map(t => [
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        t.type,
        t.category,
        (isIncoming(t) ? '' : '-') + t.amount.toFixed(2),
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${account.name}${account.last4 ? `_${account.last4}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Shared type edit segmented control (used in both mobile and desktop)
  const TypeEditor = ({ tx }: { tx: Transaction }) => (
    <div className="flex rounded border border-surface-border overflow-hidden text-xs w-fit">
      {([
        { value: 'expense',      label: '−' },
        { value: 'income',       label: '+' },
        { value: 'transfer_out', label: '↑' },
        { value: 'transfer_in',  label: '↓' },
      ] as const).map(opt => (
        <button
          key={opt.value}
          onClick={() => handleTypeChange(tx, opt.value)}
          className={`px-2.5 py-1 font-medium transition-colors ${
            tx.type === opt.value
              ? 'bg-primary text-white'
              : 'bg-surface-card text-text-faint hover:bg-surface-hover'
          }`}
        >
          {opt.label}
        </button>
      ))}
      <button
        onClick={() => setEditTypeId(null)}
        aria-label="Cancel"
        className="px-2 py-1 bg-surface-card text-text-faint hover:bg-surface-hover border-l border-surface-border"
      >
        <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </button>
        <span className="text-text-faint">/</span>
        <span className="text-sm font-medium text-text">
          {account.name}{account.last4 ? ` ···${account.last4}` : ''}
        </span>
      </div>

      {/* Account header + download */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: account.color }} />
            <h2 className="text-xl font-semibold text-text">
              {account.name}{account.last4 ? ` ···${account.last4}` : ''}
            </h2>
          </div>
          {!loading && (
            <div className="flex items-center gap-4 text-sm text-text-muted">
              <span>
                {hasFilter
                  ? <>{filtered.length} <span className="text-text-faint">of {transactions.length}</span></>
                  : <>{transactions.length}</>
                } transactions
              </span>
              <span className="text-income font-medium">+{fmt(totalIncome)}</span>
              <span className="text-expense font-medium">−{fmt(totalExpense)}</span>
            </div>
          )}
        </div>

        {!loading && (
          <div className="flex items-center gap-2">
            {filtered.length > 0 && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-surface-border rounded-lg text-text-muted hover:bg-surface-hover transition-colors"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            )}
            <button
              onClick={() => setShowFiles(f => { if (!f) loadFiles(); return !f })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${showFiles ? 'border-primary bg-primary-light text-primary' : 'border-surface-border text-text-muted hover:bg-surface-hover'}`}
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              Manage Files
            </button>
          </div>
        )}
      </div>

      {/* Files panel */}
      {showFiles && (
        <div className="mb-5 rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Uploaded Files</p>
            <button onClick={() => { setShowFiles(false); setFileDeletePending(null) }} aria-label="Close files panel" className="text-text-faint hover:text-text-muted transition-colors">
              <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {filesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sourceFiles.length === 0 ? (
            <p className="text-xs text-text-faint text-center py-6">No uploaded files found for this account.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {sourceFiles.map(f => (
                <li key={f.file_hash}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <svg aria-hidden="true" className="w-4 h-4 text-text-faint flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text truncate">{f.source_file || 'Unknown file'}</p>
                      <p className="text-xs text-text-faint mt-0.5">{f.count} transactions · {f.min_date} → {f.max_date}</p>
                    </div>
                    {fileDeletePending?.file_hash === f.file_hash ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-expense font-medium">Delete {f.count} transactions?</span>
                        <button onClick={() => setFileDeletePending(null)} className="px-2 py-1 text-xs border border-surface-border rounded-lg text-text-muted hover:bg-surface-hover transition-colors">Cancel</button>
                        <button onClick={handleDeleteFile} disabled={fileDeleting} className="px-2 py-1 text-xs bg-expense text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                          {fileDeleting ? 'Deleting…' : 'Confirm'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setFileDeletePending(f)} className="flex-shrink-0 px-2.5 py-1 text-xs border border-expense/40 text-expense rounded-lg hover:bg-expense-light font-medium transition-colors">
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Filter toolbar */}
      {!loading && transactions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-surface-card rounded-xl border border-surface-border">
          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              aria-label="From date"
              className="text-xs border border-surface-border rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-primary text-text-muted"
            />
            <span className="text-text-faint text-xs">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              aria-label="To date"
              className="text-xs border border-surface-border rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-primary text-text-muted"
            />
          </div>

          {/* Sort toggle — visible on mobile only; desktop uses the Date column header */}
          <button
            onClick={() => setSortAsc(a => !a)}
            aria-pressed={sortAsc}
            className="md:hidden flex items-center gap-1 px-2.5 py-1.5 text-xs border border-surface-border rounded-lg hover:bg-surface-hover transition-colors text-text-muted"
          >
            Date
            <svg aria-hidden="true" className={`w-3 h-3 transition-transform ${sortAsc ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            aria-label="Filter by type"
            className="text-xs border border-surface-border rounded-lg px-2.5 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-primary text-text-muted"
          >
            <option value="">All Types</option>
            <option value="income">+ Income</option>
            <option value="expense">− Expense</option>
            <option value="transfer_in">↓ Transfer In</option>
            <option value="transfer_out">↑ Transfer Out</option>
            <option value="transfer">↕ Transfer</option>
          </select>

          {/* Category filter */}
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            aria-label="Filter by category"
            className="text-xs border border-surface-border rounded-lg px-2.5 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-primary text-text-muted"
          >
            <option value="">All Categories</option>
            {catsInList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {hasFilter && (
            <button onClick={clearFilters} className="text-xs text-primary hover:underline ml-1">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 text-text-faint text-sm">
          No transactions found for this account.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-text-faint text-sm">
          No transactions match the current filters.{' '}
          <button onClick={clearFilters} className="text-primary hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="space-y-8">
          {years.map(year => {
            const yearTxs = byYear[year]
            const yearIncome  = yearTxs.filter(isIncoming).reduce((s, t) => s + t.amount, 0)
            const yearExpense = yearTxs.filter(t => !isIncoming(t)).reduce((s, t) => s + t.amount, 0)
            return (
              <div key={year}>
                {/* Year group header */}
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-text-faint">{year}</h3>
                  <div className="flex-1 h-px bg-surface-border" />
                  <span className="text-xs text-text-faint">{yearTxs.length} transactions</span>
                  <span className="text-xs text-income font-medium">+{fmt(yearIncome)}</span>
                  <span className="text-xs text-expense font-medium">−{fmt(yearExpense)}</span>
                </div>

                {/* ── Mobile card list (< md) ── */}
                <div className="md:hidden bg-surface-card rounded-xl border border-surface-border overflow-hidden divide-y divide-surface-border">
                  {yearTxs.map(tx => {
                    const incoming = isIncoming(tx)
                    const color = catColor(tx.category)
                    const d = new Date(tx.date + 'T00:00:00')
                    const dateLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
                    return (
                      <div key={tx.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-text truncate flex-1">{tx.description}</p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => flipSign(tx)}
                                title="Flip sign"
                                aria-label="Flip income/expense sign"
                                className="p-0.5 rounded text-text-faint hover:text-text-muted transition-colors"
                              >
                                <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                              </button>
                              <p className={`text-sm font-semibold whitespace-nowrap ${incoming ? 'text-income' : 'text-expense'}`}>
                                {incoming ? '+' : '−'}{fmt(tx.amount)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs text-text-faint">{dateLabel}</span>
                            <button
                              onClick={() => openCatEdit(tx)}
                              className="inline-block px-2 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: color + '20', color }}
                              title="Click to change category"
                            >
                              {tx.category}
                            </button>
                            <button
                              onClick={() => { setEditCatId(null); setEditTypeId(tx.id) }}
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity ${typeBadgeClass(tx.type)}`}
                              title="Click to change type"
                            >
                              {typeLabel(tx.type)}
                            </button>
                          </div>
                          {editCatId === tx.id && (
                            <div className="mt-2">
                              <select
                                autoFocus
                                value={editCat}
                                onChange={e => setEditCat(e.target.value)}
                                onBlur={() => saveCat(tx.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveCat(tx.id)
                                  if (e.key === 'Escape') setEditCatId(null)
                                }}
                                className="text-xs border border-primary rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card"
                              >
                                {categories.map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {editTypeId === tx.id && (
                            <div className="mt-2"><TypeEditor tx={tx} /></div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ── Desktop table (≥ md) ── */}
                <div className="hidden md:block bg-surface-card rounded-xl border border-surface-border shadow-sm overflow-clip">
                  <table className="w-full text-sm">
                    <thead className="sticky top-16 z-10">
                      <tr className="border-b border-surface-border bg-surface">
                        {/* Date — clickable sort toggle */}
                        <th className="px-4 py-2.5 text-left w-28">
                          <button
                            onClick={() => setSortAsc(a => !a)}
                            aria-pressed={sortAsc}
                            className="flex items-center gap-1 text-xs font-semibold text-text-muted uppercase tracking-wide hover:text-text transition-colors"
                          >
                            Date
                            <svg aria-hidden="true" className={`w-3 h-3 transition-transform ${sortAsc ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide">Description</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide w-44">Category</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wide w-44">Type</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-text-muted uppercase tracking-wide w-36">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {yearTxs.map(tx => {
                        const incoming = isIncoming(tx)
                        const color = catColor(tx.category)
                        const editingCat  = editCatId === tx.id
                        const editingType = editTypeId === tx.id
                        const d = new Date(tx.date + 'T00:00:00')
                        const dateLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
                        return (
                          <tr key={tx.id} className="group hover:bg-surface-hover transition-colors">

                            {/* Date */}
                            <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{dateLabel}</td>

                            {/* Description — constrained so category/type get more room */}
                            <td className="px-4 py-3 text-sm text-text w-0 min-w-0">
                              <span className="block truncate max-w-[220px]">{tx.description}</span>
                            </td>

                            {/* Category */}
                            <td className="px-4 py-3 w-44">
                              {editingCat ? (
                                <select
                                  autoFocus
                                  value={editCat}
                                  onChange={e => setEditCat(e.target.value)}
                                  onBlur={() => saveCat(tx.id)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveCat(tx.id)
                                    if (e.key === 'Escape') setEditCatId(null)
                                  }}
                                  className="text-xs border border-primary rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card"
                                >
                                  {categories.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <button
                                  onClick={() => openCatEdit(tx)}
                                  className="inline-block px-2 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity"
                                  style={{ backgroundColor: color + '20', color }}
                                  title="Click to change category"
                                >
                                  {tx.category}
                                </button>
                              )}
                            </td>

                            {/* Type */}
                            <td className="px-4 py-3 w-44">
                              {editingType ? (
                                <TypeEditor tx={tx} />
                              ) : (
                                <button
                                  onClick={() => { setEditCatId(null); setEditTypeId(tx.id) }}
                                  className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity ${typeBadgeClass(tx.type)}`}
                                  title="Click to change type"
                                >
                                  {typeLabel(tx.type)}
                                </button>
                              )}
                            </td>

                            {/* Amount — hover reveals flip-sign button */}
                            <td className="px-4 py-3 w-36">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => flipSign(tx)}
                                  title="Flip sign"
                                  aria-label="Flip income/expense sign"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-text-faint hover:text-text-muted"
                                >
                                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                </button>
                                <span className={`text-sm font-medium whitespace-nowrap ${incoming ? 'text-income' : 'text-expense'}`}>
                                  {incoming ? '+' : '−'}{fmt(tx.amount)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
