import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useDropzone } from 'react-dropzone'
import { confirmUpload, createTransaction, getAccounts, parseStatement } from '../api/client'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { Account, AccountHint, ParsedTransaction } from '../types'
import ColorPicker from './ColorPicker'

const CATEGORY_LIST = [
  'Food & Dining', 'Groceries', 'Kids & Childcare', 'Transportation',
  'Entertainment', 'Shopping', 'Home', 'Subscriptions', 'Medical',
  'Education', 'Travel', 'Pet', 'Bills & Utilities', 'Income', 'Refund', 'Other',
]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

type Tab = 'upload' | 'manual'
type Step = 'upload' | 'parsing' | 'account' | 'saving' | 'done' | 'duplicate'

interface Props {
  onClose: () => void
  onDone: (jumpTo?: { year: number; month: number }) => void
}

const EMPTY_MANUAL = {
  date: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  type: 'expense' as 'expense' | 'income',
  category: 'Food & Dining',
  account: '',
}

interface QueueResult {
  fileName: string
  saved: number
  skipped: number
  duplicate: boolean
}

export default function UploadModal({ onClose, onDone }: Props) {
  const [tab, setTab] = useState<Tab>('upload')

  // Upload flow
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [parsedCount, setParsedCount] = useState(0)
  const [error, setError] = useState('')
  const [fileHash, setFileHash] = useState<string | undefined>()
  const [skippedCount, setSkippedCount] = useState(0)
  const [expandedPreviewRows, setExpandedPreviewRows] = useState<Set<number>>(new Set())
  const togglePreviewRow = (i: number) =>
    setExpandedPreviewRows(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s })

  // Multi-file queue
  const [fileQueue, setFileQueue] = useState<File[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [queueResults, setQueueResults] = useState<QueueResult[]>([])

  // Account info
  const [existingAccounts, setExistingAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [showAccountOverride, setShowAccountOverride] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<'credit_card' | 'bank_account' | 'investment'>('credit_card')
  const [accountLast4, setAccountLast4] = useState('')
  const [accountInstitution, setAccountInstitution] = useState('')
  const [accountColor, setAccountColor] = useState('#a67c52')

  // Jump target after save
  const [jumpTo, setJumpTo] = useState<{ year: number; month: number } | undefined>()

  // Manual entry
  const [manual, setManual] = useState({ ...EMPTY_MANUAL })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualDone, setManualDone] = useState(0)
  const [manualError, setManualError] = useState('')

  const trapRef = useFocusTrap(true, onClose)

  const processFile = useCallback(async (f: File) => {
    setFile(f)
    setError('')
    setTransactions([])
    setParsedCount(0)
    setSkippedCount(0)
    setExpandedPreviewRows(new Set())
    setStep('parsing')
    try {
      const res = await parseStatement(f)
      setTransactions(res.data.transactions)
      setParsedCount(res.data.count)

      const hint: AccountHint = res.data.account_hint
      setFileHash(res.data.file_hash)
      setAccountName(hint.suggested_name || '')
      setAccountType(hint.account_type || 'credit_card')
      setAccountLast4(hint.last4 || '')
      setAccountInstitution(hint.institution || '')
      setAccountColor(hint.color || '#a67c52')

      const accts = await getAccounts()
      setExistingAccounts(accts.data)

      let matched: Account | null = null
      if (hint.last4 && hint.institution) {
        matched = accts.data.find(a =>
          a.last4 === hint.last4 && a.institution?.toLowerCase() === hint.institution?.toLowerCase()
        ) ?? null
      }
      if (!matched && hint.last4) {
        matched = accts.data.find(a => a.last4 === hint.last4) ?? null
      }
      if (!matched && hint.institution) {
        matched = accts.data.find(a =>
          a.institution?.toLowerCase() === hint.institution?.toLowerCase() &&
          a.type === hint.account_type
        ) ?? null
      }

      if (matched) {
        setSelectedAccountId(matched.id)
        setAccountName(matched.name)
        setAccountType(matched.type)
        setAccountInstitution(matched.institution || '')
        setAccountLast4(matched.last4 || '')
        setAccountColor(matched.color)
        setShowAccountOverride(false)
      } else {
        setSelectedAccountId(null)
        setShowAccountOverride(true)
      }

      setStep('account')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to parse file'
      setError(msg)
      setStep('upload')
    }
  }, [])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return
    setFileQueue(acceptedFiles)
    setQueueIndex(0)
    setQueueResults([])
    await processFile(acceptedFiles[0])
  }, [processFile])

  const selectExistingAccount = (acct: Account) => {
    setSelectedAccountId(acct.id)
    setAccountName(acct.name)
    setAccountType(acct.type)
    setAccountInstitution(acct.institution || '')
    setAccountLast4(acct.last4 || '')
    setAccountColor(acct.color)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      'text/csv': ['.csv', '.CSV'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    disabled: step !== 'upload',
  })

  const handleSave = async () => {
    setStep('saving')
    try {
      const res = await confirmUpload(
        transactions,
        file?.name || '',
        fileHash,
        selectedAccountId ? undefined : {
          name: accountName.trim() || `${accountInstitution || 'Account'} ...${accountLast4}`.trim(),
          type: accountType,
          institution: accountInstitution.trim() || undefined,
          last4: accountLast4.trim() || undefined,
          color: accountColor,
        },
        selectedAccountId ?? undefined,
      )
      const sk = res.data.skipped ?? 0
      setSkippedCount(sk)

      const result: QueueResult = {
        fileName: file?.name || '',
        saved: res.data.duplicate ? 0 : parsedCount - sk,
        skipped: sk,
        duplicate: res.data.duplicate,
      }
      setQueueResults(prev => [...prev, result])

      if (!res.data.duplicate) {
        const maxDate = transactions.reduce((best, t) => t.date > best ? t.date : best, '')
        if (maxDate) {
          const d = new Date(maxDate + 'T00:00:00')
          const candidate = { year: d.getFullYear(), month: d.getMonth() + 1 }
          setJumpTo(prev => {
            if (!prev) return candidate
            return candidate.year > prev.year || (candidate.year === prev.year && candidate.month > prev.month)
              ? candidate : prev
          })
        }
      }

      setStep(res.data.duplicate ? 'duplicate' : 'done')
    } catch {
      setError('Failed to save transactions')
      setStep('account')
    }
  }

  const handleNextFile = async () => {
    const nextIndex = queueIndex + 1
    setQueueIndex(nextIndex)
    await processFile(fileQueue[nextIndex])
  }

  const handleManualSave = async () => {
    if (!manual.description.trim() || !manual.amount || !manual.date) {
      setManualError('Date, description and amount are required.')
      return
    }
    setManualSaving(true)
    setManualError('')
    try {
      await createTransaction({
        date: manual.date,
        description: manual.description.trim(),
        amount: Math.abs(parseFloat(manual.amount)),
        type: manual.type,
        category: manual.category,
        account: manual.account.trim() || undefined,
      })
      setManualDone(n => n + 1)
      setManual({ ...EMPTY_MANUAL, date: manual.date, account: manual.account })
    } catch {
      setManualError('Failed to save. Please try again.')
    } finally {
      setManualSaving(false)
    }
  }

  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)

  const isMultiFile = fileQueue.length > 1
  const isLastFile = queueIndex >= fileQueue.length - 1
  const completedResults = queueResults  // results saved so far (including current)

  // Cumulative totals across all completed files
  const cumSaved = completedResults.reduce((s, r) => s + r.saved, 0)
  const cumSkipped = completedResults.reduce((s, r) => s + r.skipped, 0)
  const cumDupes = completedResults.filter(r => r.duplicate).length

  // Queue progress pill shown in header when processing a multi-file batch
  const queuePill: ReactNode = isMultiFile && step !== 'upload' ? (
    <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-text-muted">
      {Array.from({ length: fileQueue.length }, (_, i) => {
        const pastResult = queueResults[i]
        const dotClass = i < queueIndex
          ? (pastResult?.duplicate ? 'bg-warning' : 'bg-income')
          : i === queueIndex ? 'bg-primary'
          : 'bg-surface-border'
        return <span key={i} className={`w-2 h-2 rounded-full transition-colors ${dotClass}`} />
      })}
      <span className="ml-1">{queueIndex + 1} of {fileQueue.length}</span>
    </span>
  ) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add Transactions"
        className="relative bg-surface-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <div>
            <h2 className="text-lg font-semibold text-text flex items-center">
              Add Transactions
              {queuePill}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {isMultiFile && step !== 'upload'
                ? file?.name
                : 'Upload a statement or enter manually'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-surface-hover text-text-faint">
            <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs — only on initial screen */}
        {step === 'upload' && (
          <div className="flex border-b border-surface-border">
            {(['upload', 'manual'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-text-muted hover:text-text'}`}>
                {t === 'upload' ? '📤  Upload Statement' : '✏️  Enter Manually'}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── UPLOAD TAB ── */}
          {tab === 'upload' && (
            <>
              {/* Drop zone */}
              {step === 'upload' && (
                <div>
                  <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary-light' : 'border-surface-border hover:border-primary hover:bg-surface'}`}>
                    <input {...getInputProps()} />
                    <div className="flex justify-center mb-4">
                      <div className="w-14 h-14 bg-primary-light rounded-full flex items-center justify-center">
                        <svg aria-hidden="true" className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-text mb-1">
                      {isDragActive ? 'Drop them here!' : 'Drag & drop or click to upload'}
                    </p>
                    <p className="text-xs text-text-faint">CSV, Excel, PDF (free) or screenshot (AI) · Select multiple files</p>
                  </div>
                  {error && <div className="mt-4 p-3 bg-expense-light border border-expense/20 rounded-lg text-sm text-expense-text">{error}</div>}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {[
                      { label: 'CSV / Excel', icon: '📊', desc: 'Chase, Amex, Citi, Discover, .xlsx', free: true, recommended: true },
                      { label: 'PDF', icon: '📋', desc: 'Bank PDF statements', free: true, recommended: false },
                      { label: 'PDF / Screenshot', icon: '🤖', desc: 'Scanned or photo — uses AI', free: false, recommended: false },
                    ].map(item => (
                      <div key={item.label} className={`rounded-xl p-3 text-center ${item.free ? 'bg-income-light border border-income/20' : 'bg-surface border border-surface-border'}`}>
                        <div className="text-2xl mb-1">{item.icon}</div>
                        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-text flex-wrap">
                          {item.label}
                          {item.free
                            ? <span className="text-income-text font-semibold">FREE</span>
                            : <span className="text-text-faint font-normal">AI</span>
                          }
                          {item.recommended && (
                            <span className="text-primary font-semibold">Recommended</span>
                          )}
                        </div>
                        <div className="text-xs text-text-faint mt-0.5">{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Parsing spinner */}
              {step === 'parsing' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-12 h-12 rounded-full animate-spin mb-4 border-primary border-t-transparent" style={{ borderWidth: '3px', borderStyle: 'solid' }} />
                  <p className="text-sm font-medium text-text">Reading your statement…</p>
                  <p className="text-xs text-text-faint mt-1">{file?.name}</p>
                </div>
              )}

              {/* Account Info */}
              {step === 'account' && (
                <div className="space-y-4">
                  {/* Parsed summary */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-surface rounded-xl p-2.5">
                      <div className="text-lg font-bold text-text">{parsedCount}</div>
                      <div className="text-xs text-text-muted">Transactions</div>
                    </div>
                    <div className="bg-income-light rounded-xl p-2.5">
                      <div className="text-sm font-bold text-income-text">{fmt(totalIncome)}</div>
                      <div className="text-xs text-income-text">Income</div>
                    </div>
                    <div className="bg-expense-light rounded-xl p-2.5">
                      <div className="text-sm font-bold text-expense-text">{fmt(totalExpenses)}</div>
                      <div className="text-xs text-expense-text">Expenses</div>
                    </div>
                  </div>

                  {/* Transaction preview — first 3 rows */}
                  {transactions.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-text-muted mb-1">Preview</label>
                      <div className="rounded-xl border border-surface-border overflow-hidden text-xs">
                        {transactions.slice(0, 3).map((t, i) => {
                          const expanded = expandedPreviewRows.has(i)
                          return (
                            <div key={i} className={`flex items-start gap-2 px-3 py-2 ${i > 0 ? 'border-t border-surface-border' : ''}`}>
                              <span className="text-text-faint w-14 shrink-0 pt-0.5">{t.date.slice(5)}</span>
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={() => togglePreviewRow(i)}
                                  title={t.description}
                                  className={`text-left text-text w-full ${expanded ? 'break-words' : 'truncate'} block hover:text-primary`}
                                >
                                  {t.description}
                                </button>
                                <span className="text-text-faint">{t.category}</span>
                              </div>
                              <span className={`shrink-0 font-medium tabular-nums pt-0.5 ${t.type === 'income' || t.type === 'transfer_in' ? 'text-income-text' : t.type === 'transfer' || t.type === 'transfer_out' ? 'text-text-muted' : 'text-expense-text'}`}>
                                {t.type === 'income' || t.type === 'transfer_in' ? '+' : ''}{fmt(t.amount)}
                              </span>
                            </div>
                          )
                        })}
                        {transactions.length > 3 && (
                          <div className="px-3 py-1.5 border-t border-surface-border text-text-faint text-center">
                            … and {transactions.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Account selection */}
                  {selectedAccountId && !showAccountOverride ? (
                    <div>
                      <label className="block text-xs font-semibold text-text-muted mb-1.5">Account</label>
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-income/30 bg-income-light">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: accountColor }} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text truncate">
                              {accountName}{accountLast4 ? ` ···${accountLast4}` : ''}
                            </p>
                            {accountInstitution && (
                              <p className="text-xs text-text-muted">{accountInstitution}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <svg aria-hidden="true" className="w-4 h-4 text-income flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <button
                            onClick={() => setShowAccountOverride(true)}
                            className="text-xs text-text-muted hover:text-text underline"
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {existingAccounts.length > 0 && (
                        <div>
                          <label className="block text-xs font-semibold text-text-muted mb-1">Use existing account</label>
                          <select
                            value={selectedAccountId ?? ''}
                            onChange={e => {
                              const id = e.target.value ? Number(e.target.value) : null
                              if (id === null) {
                                setSelectedAccountId(null)
                              } else {
                                const acct = existingAccounts.find(a => a.id === id)
                                if (acct) {
                                  selectExistingAccount(acct)
                                  setShowAccountOverride(false)
                                }
                              }
                            }}
                            className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card"
                          >
                            <option value="">— New account —</option>
                            {existingAccounts.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name}{a.last4 ? ` ···${a.last4}` : ''}{a.institution ? ` (${a.institution})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {!selectedAccountId && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">Account Name</label>
                            <input type="text" placeholder="e.g. Chase Sapphire, PNC Checking"
                              value={accountName} onChange={e => setAccountName(e.target.value)}
                              className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">Account Type</label>
                            <div className="flex gap-3">
                              {([['credit_card', '💳 Credit Card'], ['bank_account', '🏦 Bank Account']] as const).map(([val, label]) => (
                                <button key={val} onClick={() => setAccountType(val)}
                                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${accountType === val ? 'border-primary bg-primary-light text-primary-text' : 'border-surface-border text-text-muted hover:bg-surface'}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-text-muted mb-1">Bank / Issuer</label>
                              <input type="text" placeholder="e.g. Chase, PNC, Amex"
                                value={accountInstitution} onChange={e => setAccountInstitution(e.target.value)}
                                className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-text-muted mb-1">Last 4 Digits</label>
                              <input type="text" maxLength={4} placeholder="1234"
                                value={accountLast4} onChange={e => setAccountLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary font-mono tracking-widest" />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1.5">Color Tag</label>
                            <ColorPicker value={accountColor} onChange={setAccountColor} />
                          </div>

                          {(accountName || accountInstitution) && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-xs text-text-faint">Preview:</span>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium"
                                style={{ backgroundColor: accountColor }}>
                                {accountName || accountInstitution}{accountLast4 ? ` ···${accountLast4}` : ''}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {error && <div className="p-3 bg-expense-light border border-expense/20 rounded-lg text-sm text-expense-text">{error}</div>}
                </div>
              )}

              {/* Saving */}
              {step === 'saving' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-12 h-12 rounded-full animate-spin mb-4 border-income border-t-transparent" style={{ borderWidth: '3px', borderStyle: 'solid' }} />
                  <p className="text-sm font-medium text-text">Saving {parsedCount} transactions…</p>
                  {isMultiFile && <p className="text-xs text-text-faint mt-1">File {queueIndex + 1} of {fileQueue.length}</p>}
                </div>
              )}

              {/* Duplicate warning */}
              {step === 'duplicate' && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 bg-warning-light rounded-full flex items-center justify-center mb-4">
                    <svg aria-hidden="true" className="w-7 h-7 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  </div>
                  <p className="text-base font-semibold text-text">Duplicate file</p>
                  <p className="text-sm text-text-muted mt-2 max-w-xs">
                    This file has already been uploaded. No transactions were saved.
                  </p>
                  <p className="text-xs text-text-faint mt-1">{file?.name}</p>
                  {isMultiFile && !isLastFile && (
                    <p className="text-xs text-text-muted mt-3">
                      {fileQueue.length - queueIndex - 1} more file{fileQueue.length - queueIndex - 1 !== 1 ? 's' : ''} remaining in this batch.
                    </p>
                  )}
                </div>
              )}

              {/* Done */}
              {step === 'done' && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="w-14 h-14 bg-income-light rounded-full flex items-center justify-center mb-4">
                    <svg aria-hidden="true" className="w-7 h-7 text-income" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>

                  {/* Current file result */}
                  <p className="text-base font-semibold text-text">
                    {parsedCount - skippedCount} transactions saved
                    {isMultiFile ? ` — file ${queueIndex + 1} of ${fileQueue.length}` : '!'}
                  </p>
                  {skippedCount > 0 && (
                    <p className="text-xs text-text-muted mt-1">{skippedCount} duplicate{skippedCount !== 1 ? 's' : ''} skipped</p>
                  )}
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium"
                    style={{ backgroundColor: accountColor }}>
                    {accountName || accountInstitution}{accountLast4 ? ` ···${accountLast4}` : ''}
                  </div>

                  {/* Multi-file batch summary */}
                  {isMultiFile && isLastFile && cumSaved + cumSkipped + cumDupes > 0 && (
                    <div className="mt-4 w-full bg-surface rounded-xl p-3 text-xs text-left space-y-1">
                      <p className="font-semibold text-text-muted uppercase tracking-wide mb-2">Batch summary</p>
                      {completedResults.map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <span className={`truncate max-w-[200px] ${r.duplicate ? 'text-warning' : 'text-text-muted'}`}>
                            {r.fileName}
                          </span>
                          <span className={r.duplicate ? 'text-warning font-medium flex-shrink-0' : 'text-income font-medium flex-shrink-0'}>
                            {r.duplicate ? 'duplicate' : `+${r.saved}`}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-surface-border font-semibold text-text">
                        <span>Total saved</span>
                        <span className="text-income">{cumSaved}</span>
                      </div>
                    </div>
                  )}

                  {!isMultiFile && (
                    <>
                      <p className="text-xs text-text-faint mt-3">You can review, edit, or delete individual transactions in the dashboard.</p>
                      <div className="mt-5 w-full space-y-2 text-left">
                        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-primary-light border border-primary/20 rounded-lg">
                          <svg aria-hidden="true" className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs text-primary-text">
                            Categories are auto-assigned and may not always be accurate. Review them in the dashboard after uploading.
                          </p>
                        </div>
                        {transactions.some(t => /venmo|zelle|check/i.test(t.description)) && (
                          <div className="flex items-start gap-2.5 px-3 py-2.5 bg-warning-light border border-warning/20 rounded-lg">
                            <svg aria-hidden="true" className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                            <p className="text-xs text-warning-text">
                              Venmo, Zelle or Check payments were found — review and correct them in the dashboard.
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── MANUAL TAB ── */}
          {tab === 'manual' && (
            <div className="space-y-4">
              {manualDone > 0 && (
                <div className="flex items-center gap-2 p-3 bg-income-light border border-income/20 rounded-lg text-sm text-income-text">
                  <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {manualDone} transaction{manualDone !== 1 ? 's' : ''} saved — keep adding or close to view dashboard.
                </div>
              )}
              {manualError && <div className="p-3 bg-expense-light border border-expense/20 rounded-lg text-sm text-expense-text">{manualError}</div>}

              <div className="flex rounded-lg border border-surface-border overflow-hidden">
                {(['expense', 'income'] as const).map(t => (
                  <button key={t} onClick={() => setManual(m => ({ ...m, type: t }))}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${manual.type === t
                      ? t === 'expense' ? 'bg-expense text-white' : 'bg-income text-white'
                      : 'bg-surface-card text-text-muted hover:bg-surface'}`}>
                    {t === 'expense' ? '💳 Expense' : '💰 Income'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Date</label>
                  <input type="date" value={manual.date}
                    onChange={e => setManual(m => ({ ...m, date: e.target.value }))}
                    className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Amount ($)</label>
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={manual.amount}
                    onChange={e => setManual(m => ({ ...m, amount: e.target.value }))}
                    className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Description</label>
                <input type="text" placeholder="e.g. Whole Foods, Salary…" value={manual.description}
                  onChange={e => setManual(m => ({ ...m, description: e.target.value }))}
                  className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
                  <select value={manual.category}
                    onChange={e => setManual(m => ({ ...m, category: e.target.value }))}
                    className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-card text-text">
                    {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Account (optional)</label>
                  <input type="text" placeholder="e.g. Chase Sapphire" value={manual.account}
                    onChange={e => setManual(m => ({ ...m, account: e.target.value }))}
                    className="w-full text-sm border border-surface-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-surface-border flex justify-end gap-3">
          {tab === 'manual' ? (
            <>
              {manualDone > 0 && (
                <button onClick={() => onDone()} className="px-4 py-2 text-sm text-text-muted hover:bg-surface-hover rounded-lg">
                  View Dashboard
                </button>
              )}
              <button onClick={handleManualSave} disabled={manualSaving}
                className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
                {manualSaving ? 'Saving…' : 'Save Transaction'}
              </button>
            </>
          ) : (step === 'done' || step === 'duplicate') ? (
            isLastFile ? (
              <button onClick={() => onDone(jumpTo)} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
                View Dashboard
              </button>
            ) : (
              <>
                <button onClick={() => onDone(jumpTo)} className="px-4 py-2 text-sm text-text-muted hover:bg-surface-hover rounded-lg">
                  Done early
                </button>
                <button onClick={handleNextFile} className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover flex items-center gap-2">
                  Next file
                  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )
          ) : step === 'account' ? (
            <>
              <button onClick={() => { setStep('upload'); setFileQueue([]); setQueueIndex(0); setQueueResults([]) }} className="px-4 py-2 text-sm text-text-muted hover:bg-surface-hover rounded-lg">
                Back
              </button>
              <button onClick={handleSave}
                disabled={!accountName.trim() && !accountInstitution.trim()}
                className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed">
                Save {parsedCount} Transactions
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:bg-surface-hover rounded-lg">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
