import axios from 'axios'
import type {
  Account,
  CCMonthlyItem,
  CCPaymentMonthItem,
  Category,
  MonthlyContextItem,
  MonthlyDashboard,
  ParsedTransaction,
  Transaction,
  YearlyDashboard,
  YearlyCategoryDashboard,
  AccountHint,
} from '../types'

const api = axios.create({ baseURL: '/api' })

// Dashboard
export const getMonthlyDashboard = (year: number, month: number) =>
  api.get<MonthlyDashboard>(`/dashboard/monthly?year=${year}&month=${month}`)

export const getYearlyDashboard = (year: number) =>
  api.get<YearlyDashboard>(`/dashboard/yearly?year=${year}`)

export const getYearlyCategories = (year: number) =>
  api.get<YearlyCategoryDashboard>(`/dashboard/yearly/categories?year=${year}`)

export const getMonthlyAccountBreakdown = (year: number, month: number, accountType?: string) =>
  api.get<{ name: string; color: string; last4: string | null; amount: number }[]>(
    `/dashboard/monthly/accounts?year=${year}&month=${month}${accountType ? `&account_type=${accountType}` : ''}`
  )

export const getMonthlyIncomeAccountBreakdown = (year: number, month: number, accountType?: string) =>
  api.get<{ name: string; color: string; last4: string | null; amount: number }[]>(
    `/dashboard/monthly/accounts/income?year=${year}&month=${month}${accountType ? `&account_type=${accountType}` : ''}`
  )

export const getMonthlyCCNetBreakdown = (year: number, month: number) =>
  api.get<{ name: string; color: string; last4: string | null; amount: number }[]>(
    `/dashboard/monthly/accounts/cc-net?year=${year}&month=${month}`
  )

export const getYearlyAccountBreakdown = (year: number, accountType?: string) =>
  api.get<{ name: string; color: string; last4: string | null; amount: number }[]>(
    `/dashboard/yearly/accounts?year=${year}${accountType ? `&account_type=${accountType}` : ''}`
  )

export const getYearlyIncomeAccountBreakdown = (year: number, accountType?: string) =>
  api.get<{ name: string; color: string; last4: string | null; amount: number }[]>(
    `/dashboard/yearly/accounts/income?year=${year}${accountType ? `&account_type=${accountType}` : ''}`
  )

export const getYearlyCCNetBreakdown = (year: number) =>
  api.get<{ name: string; color: string; last4: string | null; amount: number }[]>(
    `/dashboard/yearly/accounts/cc-net?year=${year}`
  )

export const getMonthlyContext = (year: number, month: number, count = 6) =>
  api.get<MonthlyContextItem[]>(`/dashboard/monthly/context?year=${year}&month=${month}&count=${count}`)

export const getCCMonthly = (year: number, month?: number, count = 6) =>
  api.get<CCMonthlyItem[]>(
    `/dashboard/cc-monthly?year=${year}${month != null ? `&month=${month}&count=${count}` : ''}`
  )

export const getCCPaymentsByCard = (year: number, month?: number, count = 6) =>
  api.get<CCPaymentMonthItem[]>(
    `/dashboard/cc-payments-by-card?year=${year}${month != null ? `&month=${month}&count=${count}` : ''}`
  )

export const getAvailableYears = () =>
  api.get<{ years: number[]; latest_year: number; latest_month: number }>('/dashboard/years')

// Transactions
export const getTransactions = (params: {
  year?: number
  month?: number
  category?: string
  account_id?: number
  file_hash?: string
}) => api.get<Transaction[]>('/transactions', { params })

export const createTransaction = (tx: Omit<Transaction, 'id' | 'created_at'>) =>
  api.post<Transaction>('/transactions', tx)

export const updateTransaction = (id: number, data: Partial<Transaction>) =>
  api.patch<Transaction>(`/transactions/${id}`, data)

export const deleteTransaction = (id: number) =>
  api.delete(`/transactions/${id}`)

export const reclassifyTransactions = (from_category: string, to_category: string) =>
  api.patch<{ updated: number }>('/transactions/reclassify', { from_category, to_category })

export const bulkDeleteTransactions = (ids: number[]) =>
  api.delete<{ deleted: number }>('/transactions/bulk', { data: { ids } })

export const deleteTransactionsByFile = (file_hash: string) =>
  api.delete<{ deleted: number }>('/transactions/by-file', { data: { file_hash } })

export const deleteAllTransactions = () =>
  api.delete<{ deleted: number }>('/transactions/all')

export const getSourceFiles = (account_id?: number) =>
  api.get<{ file_hash: string; source_file: string; count: number; min_date: string; max_date: string }[]>(
    '/transactions/source-files',
    account_id !== undefined ? { params: { account_id } } : undefined
  )

export const getCategories = () =>
  api.get<Category[]>('/categories')

export const createCategory = (name: string, color: string) =>
  api.post<Category>('/categories', { name, color })

export const updateCategory = (id: number, data: { name?: string; color?: string }) =>
  api.patch<Category>(`/categories/${id}`, data)

export const deleteCategory = (id: number, reassignTo?: string) =>
  api.delete(`/categories/${id}`, reassignTo ? { params: { reassign_to: reassignTo } } : undefined)

// Accounts
export const getAccounts = () =>
  api.get<Account[]>('/accounts')

export const getAccountDateRanges = () =>
  api.get<{ account_id: number; min_date: string; max_date: string }[]>('/accounts/date-ranges')

export const createAccount = (data: { name: string; type: string; institution?: string; last4?: string; color: string }) =>
  api.post<Account>('/accounts', data)

export const updateAccount = (id: number, data: Partial<Account>) =>
  api.patch<Account>(`/accounts/${id}`, data)

export const deleteAccount = (id: number) =>
  api.delete(`/accounts/${id}`)

// Upload
export const parseStatement = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<{
    transactions: ParsedTransaction[]
    count: number
    method: string
    account_hint: AccountHint
    file_hash: string
  }>('/upload/parse', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const confirmUpload = (
  transactions: ParsedTransaction[],
  sourceFile: string,
  fileHash?: string,
  account?: {
    name: string
    type: string
    institution?: string
    last4?: string
    color: string
  },
  accountId?: number,
) =>
  api.post<{ saved: number; skipped: number; duplicate: boolean }>('/upload/confirm', {
    transactions,
    source_file: sourceFile,
    file_hash: fileHash,
    account: accountId ? undefined : account,
    account_id: accountId,
  })
