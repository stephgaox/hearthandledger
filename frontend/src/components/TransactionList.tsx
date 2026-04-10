import { useEffect, useRef, useState } from 'react'
import {
  bulkDeleteTransactions,
  createTransaction,
  deleteTransaction,
  getAccounts,
  getCategories,
  getTransactions,
  updateTransaction,
} from '../api/client'
import type { Account, Category, Transaction } from '../types'
import ManageModal from './ManageModal'

const EMPTY_ADD = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  type: 'expense' as 'expense' | 'income',
  category: 'Food & Dining',
  account_id: undefined as number | undefined,
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <svg aria-hidden="true" className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3l3 4H5l3-4z" opacity={active && dir === 'asc' ? 1 : 0.25} />
      <path d="M8 13l3-4H5l3 4z" opacity={active && dir === 'desc' ? 1 : 0.25} />
    </svg>
  )
}

function AccountTypeIcon({ type }: { type: string }) {
  if (type === 'credit_card') {
    return (
      <svg aria-hidden="true" className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="3" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="6" width="14" height="2.5" fill="currentColor" opacity="0.5"/>
        <rect x="3" y="10" width="3" height="1.5" rx="0.5" fill="currentColor" opacity="0.7"/>
      </svg>
    )
  }
  // bank_account or investment
  return (
    <svg aria-hidden="true" className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5L1.5 5h13L8 1.5z" opacity="0.8"/>
      <rect x="2.5" y="5.5" width="2" height="5.5" rx="0.5"/>
      <rect x="7" y="5.5" width="2" height="5.5" rx="0.5"/>
      <rect x="11.5" y="5.5" width="2" height="5.5" rx="0.5"/>
      <rect x="1.5" y="11.5" width="13" height="1.5" rx="0.5"/>
    </svg>
  )
}

function AccountBadge({ tx, accounts }: { tx: Transaction; accounts: Account[] }) {
  const acct = tx.account_id ? accounts.find(a => a.id === tx.account_id) : null
  if (acct) {
    return (
      <span className="inline-flex flex-col gap-0.5" title={`${acct.name}${acct.last4 ? ` ···${acct.last4}` : ''}`}>
        <span
          className="inline-flex items-center justify-center gap-1.5 px-2 py-0.5 rounded-full text-white text-xs font-medium w-32"
          style={{ backgroundColor: acct.color }}
        >
          <span className="truncate">{acct.name}</span>
        </span>
        {acct.last4 && (
          <span className="text-[10px] text-text-faint text-right inline-flex items-center justify-end gap-0.5">
            <AccountTypeIcon type={acct.type} />
            ···{acct.last4}
          </span>
        )}
      </span>
    )
  }
  if (tx.account) return <span className="text-xs text-text-muted truncate">{tx.account}</span>
  return <span className="text-xs text-text-faint">—</span>
}

interface Props {
  year: number
  month?: number
  filterCategory?: string
  onClearFilter?: () => void
  filterCat?: string
  onFilterCatChange?: (v: string | undefined) => void
  filterAccount?: number
  onFilterAccountChange?: (v: number | undefined) => void
  refreshKey?: number
  onDataChanged?: () => void
}

export default function TransactionList({ year, month, filterCategory, onClearFilter, filterCat, onFilterCatChange, filterAccount, onFilterAccountChange, refreshKey, onDataChanged }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])

  const setFilterCat = (v: string | undefined) => onFilterCatChange?.(v)
  const setFilterAccount = (v: number | undefined) => onFilterAccountChange?.(v)

  const [headerPopover, setHeaderPopover] = useState<'account' | 'category' | null>(null)
  const popoverContainerRef = useRef<HTMLTableSectionElement | null>(null)

  useEffect(() => {
    if (!headerPopover) return
    const handler = (e: MouseEvent) => {
      if (popoverContainerRef.current && !popoverContainerRef.current.contains(e.target as Node)) {
        setHeaderPopover(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [headerPopover])

  // Manage modal
  const [showManage, setShowManage] = useState(false)

  // Inline edit (category + account)
  const [editId, setEditId] = useState<number | null>(null)
  const [editData, setEditData] = useState<Partial<Transaction>>({})

  // Inline memo edit
  const [memoEditId, setMemoEditId] = useState<number | null>(null)
  const [memoValue, setMemoValue] = useState('')

  // Single-transaction delete: confirm toast then undo toast
  const [deletePending, setDeletePending] = useState<Transaction | null>(null)
  const [undoTx, setUndoTx] = useState<Transaction | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inline add
  const [showAdd, setShowAdd] = useState(false)
  const [addData, setAddData] = useState({ ...EMPTY_ADD })
  const [addSaving, setAddSaving] = useState(false)

  // Sort
  const [sortField, setSortField] = useState<'date' | 'amount' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)

  // "Change all same description?" prompt
  const [bulkCatPrompt, setBulkCatPrompt] = useState<{
    description: string
    oldCat: string
    newCat: string
    ids: number[]
  } | null>(null)
  const [editOriginalCategory, setEditOriginalCategory] = useState<string>('')
  const [bulkCatSuccess, setBulkCatSuccess] = useState<{ count: number; category: string } | null>(null)
  const bulkCatSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadCategoriesAndAccounts = () => {
    getCategories().then(r => setCategories(r.data.slice().sort((a, b) => a.name.localeCompare(b.name))))
    getAccounts().then(r => setAccounts(r.data.slice().sort((a, b) => a.name.localeCompare(b.name))))
  }

  useEffect(() => {
    loadCategoriesAndAccounts()
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelected(new Set())
    const effectiveCat = filterCat || filterCategory
    getTransactions({ year, month, category: effectiveCat, account_id: filterAccount })
      .then(r => setTransactions(r.data))
      .finally(() => setLoading(false))
  }, [year, month, filterCategory, filterAccount, filterCat, refreshKey])

  // transfer_in / income → green +    transfer_out → red −    expense → neutral
  const isIncoming = (tx: Transaction) =>
    tx.type === 'income' ||
    tx.type === 'transfer_in' ||
    tx.category === 'Payment Received' ||
    (tx.type === 'transfer' && tx.description.toLowerCase().includes(' from '))


  const toggleSort = (field: 'date' | 'amount') => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'amount' ? 'desc' : 'desc')
    }
  }

  const filtered = transactions
    .filter(t =>
      !search ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.account || '').toLowerCase().includes(search.toLowerCase())
    )
    .slice()
    .sort((a, b) => {
      if (!sortField) return 0
      const mul = sortDir === 'asc' ? 1 : -1
      if (sortField === 'date') return mul * a.date.localeCompare(b.date)
      if (sortField === 'amount') return mul * (a.amount - b.amount)
      return 0
    })

  // When a filter is active, show the full list so the user can switch to a different value.
  // When no filter is active, scope to what's actually present in the current period.
  const accountsInList = filterAccount
    ? accounts
    : accounts.filter(a => transactions.some(t => t.account_id === a.id))
  const categoriesInList = (filterCat || filterCategory)
    ? categories
    : categories.filter(c => transactions.some(t => t.category === c.name))

  // Selection helpers
  const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id))
  const someSelected = selected.size > 0

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(t => t.id)))
    }
  }

  // Infer income vs expense from description when leaving Transfer
  const inferType = (description: string): 'income' | 'expense' => {
    const d = description.toLowerCase()
    const incomeKeywords = ['interest', 'dividend', 'deposit', 'lending', 'payroll', 'paycheck', 'refund', 'credit', 'rebate', 'cashback']
    return incomeKeywords.some(k => d.includes(k)) ? 'income' : 'expense'
  }

  const handleCategoryChange = (newCat: string, description: string) => {
    setEditData(d => {
      const isTransferType = d.type === 'transfer' || d.type === 'transfer_in' || d.type === 'transfer_out'
      let newType = d.type
      if (newCat === 'CC Payments') {
        newType = 'transfer_out'
      } else if (newCat === 'Payment Received') {
        newType = 'transfer_in'
      } else if (newCat === 'Transfer') {
        newType = 'transfer_out'
      } else if (isTransferType) {
        newType = inferType(description)
      }
      return { ...d, category: newCat, type: newType }
    })
  }

  const handleEdit = (tx: Transaction) => {
    setShowAdd(false)
    setDeletePending(null)
    setMemoEditId(null)
    setBulkCatPrompt(null)
    setEditId(tx.id)
    setEditOriginalCategory(tx.category)
    setEditData({ category: tx.category, account_id: tx.account_id ?? undefined, notes: tx.notes || '', type: tx.type })
  }

  const openMemoEdit = (tx: Transaction) => {
    setEditId(null)
    setDeletePending(null)
    setMemoEditId(tx.id)
    setMemoValue(tx.notes || '')
  }

  const saveMemo = async (id: number) => {
    const notes = memoValue.trim() || undefined
    await updateTransaction(id, { notes })
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, notes } : t))
    setMemoEditId(null)
  }

  const handleSave = async (id: number) => {
    const newCat = editData.category
    const oldCat = editOriginalCategory
    const tx = transactions.find(t => t.id === id)

    await updateTransaction(id, editData)
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...editData } : t))
    setEditId(null)
    onDataChanged?.()

    // Prompt to apply same category change to all matching descriptions on this page
    if (newCat && oldCat && newCat !== oldCat && tx) {
      const desc = tx.description.toLowerCase()
      const similar = transactions.filter(t =>
        t.id !== id &&
        t.description.toLowerCase() === desc &&
        t.category === oldCat
      )
      if (similar.length > 0) {
        setBulkCatPrompt({ description: tx.description, oldCat, newCat, ids: similar.map(t => t.id) })
      }
    }
  }

  const handleApplyAllCategory = async () => {
    if (!bulkCatPrompt) return
    const { ids, newCat } = bulkCatPrompt
    const inferNewType = (t: Transaction) => {
      const isTransferType = t.type === 'transfer' || t.type === 'transfer_in' || t.type === 'transfer_out'
      if (newCat === 'CC Payments') return 'transfer_out'
      if (newCat === 'Payment Received') return 'transfer_in'
      if (newCat === 'Transfer') return 'transfer_out'
      if (isTransferType) return inferType(t.description)
      return t.type
    }
    await Promise.all(ids.map(id => {
      const t = transactions.find(t => t.id === id)
      if (!t) return Promise.resolve()
      return updateTransaction(id, { category: newCat, type: inferNewType(t) })
    }))
    setTransactions(prev => prev.map(t => {
      if (!ids.includes(t.id)) return t
      return { ...t, category: newCat, type: inferNewType(t) }
    }))
    setBulkCatPrompt(null)
    onDataChanged?.()

    if (bulkCatSuccessTimer.current) clearTimeout(bulkCatSuccessTimer.current)
    setBulkCatSuccess({ count: ids.length, category: newCat })
    bulkCatSuccessTimer.current = setTimeout(() => setBulkCatSuccess(null), 4000)
  }

  // Step 1: show confirm toast
  const requestDelete = (tx: Transaction) => {
    setEditId(null)
    setDeletePending(tx)
  }

  // Step 2: actually delete, then show undo toast for 5s
  const confirmDelete = async () => {
    if (!deletePending) return
    const tx = deletePending
    setDeletePending(null)
    await deleteTransaction(tx.id)
    setTransactions(prev => prev.filter(t => t.id !== tx.id))
    setSelected(prev => { const n = new Set(prev); n.delete(tx.id); return n })

    // Show undo toast
    setUndoTx(tx)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => setUndoTx(null), 5000)
  }

  // Undo: re-create the transaction (without id — backend assigns new one)
  const handleUndo = async () => {
    if (!undoTx) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoTx(null)
    const { id: _id, created_at: _ca, ...rest } = undoTx as Transaction & { created_at?: string }
    const res = await createTransaction(rest as Parameters<typeof createTransaction>[0])
    setTransactions(prev => [res.data, ...prev])
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      await bulkDeleteTransactions([...selected])
      setTransactions(prev => prev.filter(t => !selected.has(t.id)))
      setSelected(new Set())
      setBulkConfirm(false)
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleDownload = () => {
    const acctName = (tx: Transaction) => {
      const a = accounts.find(a => a.id === tx.account_id)
      return a ? `${a.name}${a.last4 ? ` ···${a.last4}` : ''}` : (tx.account || '')
    }
    const rows = [
      ['Date', 'Description', 'Account', 'Category', 'Type', 'Amount'],
      ...filtered.map(tx => [
        tx.date,
        `"${tx.description.replace(/"/g, '""')}"`,
        `"${acctName(tx)}"`,
        tx.category,
        tx.type,
        (tx.type === 'income' ? '' : '-') + tx.amount.toFixed(2),
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAdd = async () => {
    if (!addData.description.trim() || !addData.amount || !addData.date) return
    setAddSaving(true)
    try {
      const res = await createTransaction({
        date: addData.date,
        description: addData.description.trim(),
        amount: Math.abs(parseFloat(addData.amount)),
        type: addData.type,
        category: addData.category,
        account_id: addData.account_id,
      })
      setTransactions(prev => [res.data, ...prev])
      setAddData({ ...EMPTY_ADD, date: addData.date })
      setShowAdd(false)
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <div className="bg-surface-card rounded-xl border border-surface-border shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-surface-border flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-text">
          Transactions
          {filterCategory && !filterCat && <span className="ml-2 text-primary">— {filterCategory}</span>}
        </h3>
        {filterCategory && !filterCat && (
          <button onClick={onClearFilter} className="text-xs text-text-faint hover:text-text-muted underline">
            Clear filter
          </button>
        )}

        <div className="relative">
          <svg aria-hidden="true" className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search transactions"
            className="pl-8 pr-3 py-1.5 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-40"
          />
        </div>
        <span className="text-xs text-text-faint">{filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Manage */}
          <button
            onClick={() => setShowManage(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-border text-text-muted hover:bg-surface-hover transition-colors"
            title="Manage accounts & categories"
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:inline">Manage</span>
          </button>

          {/* Download */}
          <div className="relative group/dl">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-border text-text-muted hover:bg-surface-hover transition-colors"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
            <div className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover/dl:block z-50">
              <div className="bg-surface-card border border-surface-border shadow-lg rounded-lg px-3 py-1.5 text-xs text-text-muted whitespace-nowrap">
                Download the transactions on this page
              </div>
            </div>
          </div>

          {/* Add */}
          <button
            onClick={() => { setShowAdd(s => !s); setEditId(null) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showAdd ? 'bg-surface-hover text-text-muted' : 'bg-primary text-white hover:bg-primary-hover'}`}
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showAdd ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'} />
            </svg>
            {showAdd ? 'Cancel' : 'Add'}
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="px-4 py-2.5 bg-primary-light border-b border-primary/20 flex items-center gap-3">
          <span className="text-xs font-medium text-primary-text">
            {selected.size} selected
          </span>
          <button onClick={() => setSelected(new Set())} className="text-xs text-primary-text/70 hover:text-primary-text underline">
            Deselect all
          </button>
          <button onClick={toggleAll} className="text-xs text-primary-text/70 hover:text-primary-text underline">
            {allSelected ? 'Deselect all' : `Select all ${filtered.length}`}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {bulkConfirm ? (
              <>
                <span className="text-xs text-expense font-medium">Delete {selected.size} transactions?</span>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="px-3 py-1.5 text-xs bg-expense text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {bulkDeleting ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setBulkConfirm(false)}
                  className="px-3 py-1.5 text-xs border border-surface-border rounded-lg text-text-muted hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setBulkConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-expense text-white rounded-lg font-medium hover:opacity-90"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete {selected.size}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inline Add Row */}
      {showAdd && (
        <div className="p-3 bg-primary-light border-b border-primary/20 flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border border-surface-border overflow-hidden text-xs">
            {(['expense', 'income'] as const).map(t => (
              <button key={t} onClick={() => setAddData(d => ({ ...d, type: t }))}
                className={`px-2.5 py-1.5 font-medium transition-colors ${addData.type === t
                  ? t === 'expense' ? 'bg-expense text-white' : 'bg-income text-white'
                  : 'bg-surface-card text-text-muted hover:bg-surface-hover'}`}>
                {t === 'expense' ? '− Expense' : '+ Income'}
              </button>
            ))}
          </div>

          <input type="date" value={addData.date}
            onChange={e => setAddData(d => ({ ...d, date: e.target.value }))}
            className="text-xs border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card" />

          <input type="text" placeholder="Description" value={addData.description}
            onChange={e => setAddData(d => ({ ...d, description: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="text-xs border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card w-44" />

          <input type="number" min="0" step="0.01" placeholder="Amount" value={addData.amount}
            onChange={e => setAddData(d => ({ ...d, amount: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="text-xs border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card w-24" />

          <select value={addData.category}
            onChange={e => setAddData(d => ({ ...d, category: e.target.value }))}
            className="text-xs border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card">
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>

          <select value={addData.account_id ?? ''}
            onChange={e => setAddData(d => ({ ...d, account_id: e.target.value ? Number(e.target.value) : undefined }))}
            className="text-xs border border-surface-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card">
            <option value="">No account</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ···${a.last4}` : ''}</option>
            ))}
          </select>

          <button onClick={handleAdd} disabled={addSaving || !addData.description.trim() || !addData.amount}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
            {addSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Content */}
      <>
        {/* ── Mobile card list (< md) ── */}
        <div className="md:hidden divide-y divide-surface-border">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-text-faint">
              No transactions found
              {!showAdd && (
                <div className="mt-2">
                  <button onClick={() => setShowAdd(true)} className="text-primary hover:underline text-xs">
                    + Add one manually
                  </button>
                </div>
              )}
            </div>
          ) : filtered.map(tx => {
              const catObj = categories.find(c => c.name === tx.category)
              const catColor = catObj?.color || '#a89268'
              const isSelected = selected.has(tx.id)
              return (
                <div key={tx.id} className={`px-4 py-3 flex items-start gap-3 transition-colors ${isSelected ? 'bg-primary-light' : ''}`}>
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(tx.id)}
                    aria-label={`Select ${tx.description}`}
                    className="mt-1 flex-shrink-0 w-4 h-4 rounded border-surface-border accent-primary cursor-pointer"
                  />
                  {/* Color strip */}
                  <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: catColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-text truncate flex-1">{tx.description}</p>
                      <p className={`text-base font-mono font-medium whitespace-nowrap flex-shrink-0 ${isIncoming(tx) ? 'text-income' : 'text-text'}`}>
                        {isIncoming(tx) ? '+' : ''}{fmt(tx.amount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[13px] font-mono text-text-faint">
                        {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: catColor + '20', color: catColor }}>
                        {tx.category}
                      </span>
                      {(tx.account_id || tx.account) && (
                        <AccountBadge tx={tx} accounts={accounts} />
                      )}
                    </div>
                    {tx.notes && <p className="text-xs text-text-faint mt-0.5 truncate">{tx.notes}</p>}
                  </div>
                  {/* Actions — 44px touch targets on mobile */}
                  <div className="flex-shrink-0">
                    {deletePending?.id === tx.id ? (
                      <div className="flex flex-col gap-1">
                        <button onClick={confirmDelete}
                          className="min-h-[44px] px-3 text-xs bg-expense text-white rounded-lg font-medium"
                          aria-label="Confirm delete">Delete</button>
                        <button onClick={() => setDeletePending(null)}
                          className="min-h-[44px] px-3 text-xs border border-surface-border text-text-muted rounded-lg"
                          aria-label="Cancel delete">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(tx)}
                          className="w-11 h-11 flex items-center justify-center text-text-faint hover:text-primary hover:bg-primary-light rounded-lg"
                          aria-label="Edit transaction">
                          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => requestDelete(tx)}
                          className="w-11 h-11 flex items-center justify-center text-text-faint hover:text-expense hover:bg-expense-light rounded-lg"
                          aria-label="Delete transaction">
                          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
        </div>


        {/* ── Desktop table (≥ md) ── */}
        <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead ref={popoverContainerRef} className="sticky top-16 bg-surface-card">
                <tr className="border-b border-surface-border">
                  <th className="px-4 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all transactions"
                      className="w-4 h-4 rounded border-surface-border accent-primary cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-2.5">
                    <button
                      onClick={() => toggleSort('date')}
                      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-text transition-colors ${sortField === 'date' ? 'text-primary' : 'text-text-muted'}`}
                    >
                      Date
                      <SortIcon active={sortField === 'date'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wide">Description</th>

                  {/* Account column — clickable filter */}
                  <th className="text-left px-4 py-2.5 relative w-52">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHeaderPopover(p => p === 'account' ? null : 'account')}
                        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-text transition-colors ${filterAccount ? 'text-primary' : 'text-text-muted'}`}
                      >
                        Account
                        <svg aria-hidden="true" className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {filterAccount && (
                        <button onClick={() => setFilterAccount(undefined)} className="text-text-faint hover:text-text leading-none" title="Clear filter">×</button>
                      )}
                    </div>
                    {headerPopover === 'account' && (
                      <div className="absolute top-full left-0 z-[20] bg-surface-card border border-surface-border rounded-lg shadow-lg py-1 min-w-[170px] mt-0.5">
                        <button onClick={() => { setFilterAccount(undefined); setHeaderPopover(null) }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover ${!filterAccount ? 'text-primary font-medium' : 'text-text-muted'}`}>
                          All accounts
                        </button>
                        {accountsInList.map(a => (
                          <button key={a.id} onClick={() => { setFilterAccount(a.id); setHeaderPopover(null) }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover flex items-center gap-2 ${filterAccount === a.id ? 'text-primary font-medium' : 'text-text'}`}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                            {a.name}{a.last4 ? ` ···${a.last4}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>

                  {/* Category column — clickable filter */}
                  <th className="text-left px-4 py-2.5 relative">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHeaderPopover(p => p === 'category' ? null : 'category')}
                        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-text transition-colors ${filterCat ? 'text-primary' : 'text-text-muted'}`}
                      >
                        Category
                        <svg aria-hidden="true" className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {filterCat && (
                        <button onClick={() => setFilterCat(undefined)} className="text-text-faint hover:text-text leading-none" title="Clear filter">×</button>
                      )}
                    </div>
                    {headerPopover === 'category' && (
                      <div className="absolute top-full left-0 z-[20] bg-surface-card border border-surface-border rounded-lg shadow-lg py-1 min-w-[160px] mt-0.5 max-h-60 overflow-y-auto">
                        <button onClick={() => { setFilterCat(undefined); setHeaderPopover(null) }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover ${!filterCat ? 'text-primary font-medium' : 'text-text-muted'}`}>
                          All categories
                        </button>
                        {categoriesInList.map(c => (
                          <button key={c.id} onClick={() => { setFilterCat(c.name); setHeaderPopover(null) }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover flex items-center gap-2 ${filterCat === c.name ? 'text-primary font-medium' : 'text-text'}`}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>

                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wide">Memo</th>
                  <th className="text-right px-4 py-2.5 w-28">
                    <button
                      onClick={() => toggleSort('amount')}
                      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-text transition-colors ml-auto ${sortField === 'amount' ? 'text-primary' : 'text-text-muted'}`}
                    >
                      Amount
                      <SortIcon active={sortField === 'amount'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-12">
                    <div className="flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-sm text-text-faint">
                    No transactions found
                    {!showAdd && (
                      <div className="mt-2">
                        <button onClick={() => setShowAdd(true)} className="text-primary hover:underline text-xs">
                          + Add one manually
                        </button>
                      </div>
                    )}
                  </td></tr>
                ) : null}
                {filtered.map(tx => {
                  const catObj = categories.find(c => c.name === tx.category)
                  const catColor = catObj?.color || '#a89268'
                  const isSelected = selected.has(tx.id)
                  return (
                    <tr key={tx.id} className={`transition-colors group ${isSelected ? 'bg-primary-light' : 'hover:bg-surface-hover'}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(tx.id)}
                          aria-label={`Select ${tx.description}`}
                          className="w-4 h-4 rounded border-surface-border accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 text-text-muted whitespace-nowrap font-mono text-[13px]">
                        {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-text max-w-xs">
                        <div className="relative group/desc">
                          <div className="truncate">{tx.description}</div>
                          <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50 hidden group-hover/desc:block">
                            <div className="bg-surface-card border border-surface-border shadow-lg rounded-lg px-3 py-2 text-xs text-text whitespace-normal max-w-sm leading-relaxed">
                              {tx.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 w-52">
                        {editId === tx.id ? (
                          <select
                            value={editData.account_id ?? ''}
                            onChange={e => setEditData(d => ({ ...d, account_id: e.target.value ? Number(e.target.value) : undefined }))}
                            className="text-xs border border-primary rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-surface-card max-w-[130px]"
                          >
                            <option value="">— unassigned —</option>
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ···${a.last4}` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <AccountBadge tx={tx} accounts={accounts} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editId === tx.id ? (
                          <div className="flex flex-col gap-1">
                            <select value={editData.category}
                              onChange={e => handleCategoryChange(e.target.value, tx.description)}
                              className="text-xs border border-primary rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary">
                              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                            <div className="flex rounded border border-surface-border overflow-hidden text-xs">
                              {([
                                { value: 'expense',      label: '−',  activeClass: 'bg-expense text-white' },
                                { value: 'income',       label: '+',  activeClass: 'bg-income text-white' },
                                { value: 'transfer_out', label: '↑',  activeClass: 'bg-surface-hover text-text-muted' },
                                { value: 'transfer_in',  label: '↓',  activeClass: 'bg-surface-hover text-text-muted' },
                              ] as const).map(({ value, label, activeClass }) => (
                                <button key={value} onClick={() => setEditData(d => ({ ...d, type: value }))}
                                  className={`flex-1 py-0.5 font-medium transition-colors ${
                                    editData.type === value ? activeClass : 'bg-surface-card text-text-faint hover:bg-surface-hover'
                                  }`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: catColor + '20', color: catColor }}
                          >
                            {tx.category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        {memoEditId === tx.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={memoValue}
                            onChange={e => setMemoValue(e.target.value)}
                            onBlur={() => saveMemo(tx.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveMemo(tx.id)
                              if (e.key === 'Escape') setMemoEditId(null)
                            }}
                            placeholder="Add memo…"
                            className="w-full text-xs border border-primary rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-surface-card"
                          />
                        ) : tx.notes ? (
                          <button
                            onClick={() => openMemoEdit(tx)}
                            className="text-xs text-text-muted hover:text-text truncate block w-full text-left"
                            title={tx.notes}
                          >
                            {tx.notes}
                          </button>
                        ) : (
                          <button
                            onClick={() => openMemoEdit(tx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-text-faint hover:text-text-muted"
                            aria-label="Add memo"
                          >
                            + memo
                          </button>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap w-28 ${isIncoming(tx) ? 'text-income' : 'text-text'}`}>
                        {isIncoming(tx) ? '+' : ''}{fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-3">
                        {editId === tx.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleSave(tx.id)} className="w-8 h-8 flex items-center justify-center text-income hover:bg-income-light rounded-lg" aria-label="Save">
                              <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button onClick={() => setEditId(null)} className="w-8 h-8 flex items-center justify-center text-text-faint hover:bg-surface-hover rounded-lg" aria-label="Cancel edit">
                              <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : deletePending?.id === tx.id ? (
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <span className="text-xs text-expense font-medium">Delete?</span>
                            <button onClick={confirmDelete}
                              className="px-2 py-1 text-xs bg-expense text-white rounded font-medium hover:opacity-90"
                              aria-label="Confirm delete">Yes</button>
                            <button onClick={() => setDeletePending(null)}
                              className="px-2 py-1 text-xs border border-surface-border text-text-muted rounded hover:bg-surface-hover"
                              aria-label="Cancel delete">No</button>
                          </div>
                        ) : (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEdit(tx)} className="w-8 h-8 flex items-center justify-center text-text-faint hover:text-primary hover:bg-primary-light rounded-lg" aria-label="Edit transaction">
                              <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => requestDelete(tx)} className="w-8 h-8 flex items-center justify-center text-text-faint hover:text-expense hover:bg-expense-light rounded-lg" aria-label="Delete transaction">
                              <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      </>

      {/* Bulk category change prompt */}
      {bulkCatPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-3 px-4 py-3 bg-text text-surface-card rounded-xl shadow-xl text-sm max-w-[90vw]">
          <span className="flex-1 min-w-0">
            Change all <strong className="font-semibold">"{bulkCatPrompt.description}"</strong> to{' '}
            <strong className="font-semibold">{bulkCatPrompt.newCat}</strong>?{' '}
            <span className="opacity-60">({bulkCatPrompt.ids.length} more item{bulkCatPrompt.ids.length > 1 ? 's' : ''})</span>
          </span>
          <button
            onClick={handleApplyAllCategory}
            className="px-3 py-1 bg-primary text-white rounded-lg font-medium hover:opacity-90 whitespace-nowrap text-xs"
          >
            Yes, apply to all
          </button>
          <button
            onClick={() => setBulkCatPrompt(null)}
            className="px-3 py-1 border border-surface-card/30 rounded-lg text-xs hover:bg-surface-card/10 whitespace-nowrap"
          >
            No, only this one
          </button>
        </div>
      )}

      {/* Bulk category success toast */}
      {bulkCatSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-text text-surface-card rounded-xl shadow-xl text-sm">
          <svg aria-hidden="true" className="w-4 h-4 text-income flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            <strong>{bulkCatSuccess.count}</strong> transaction{bulkCatSuccess.count > 1 ? 's' : ''} updated to{' '}
            <strong>{bulkCatSuccess.category}</strong>
          </span>
          <button
            onClick={() => { setBulkCatSuccess(null); if (bulkCatSuccessTimer.current) clearTimeout(bulkCatSuccessTimer.current) }}
            className="ml-1 opacity-60 hover:opacity-100" aria-label="Dismiss"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Undo toast — shown for 5s after a transaction is deleted */}
      {undoTx && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-text text-surface-card rounded-xl shadow-xl text-sm">
          <svg aria-hidden="true" className="w-4 h-4 text-income flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Transaction deleted.</span>
          <button
            onClick={handleUndo}
            className="ml-1 font-semibold underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
          >
            Undo
          </button>
          <button onClick={() => { setUndoTx(null); if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }}
            className="ml-1 opacity-60 hover:opacity-100" aria-label="Dismiss">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {showManage && (
        <ManageModal
          onClose={() => setShowManage(false)}
          onChanged={loadCategoriesAndAccounts}
        />
      )}
    </div>
  )
}
