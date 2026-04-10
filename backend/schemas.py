from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


# ── Account ───────────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    name: str
    type: str                          # 'credit_card' | 'bank_account'
    institution: Optional[str] = None
    last4: Optional[str] = None
    color: str = "#3b82f6"


class AccountOut(AccountCreate):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Transaction ───────────────────────────────────────────────────────────────

class TransactionBase(BaseModel):
    date: date
    description: str
    amount: float
    type: str           # 'income' | 'expense' | 'transfer'
    category: str = "Other"
    account: Optional[str] = None
    account_id: Optional[int] = None
    notes: Optional[str] = None


class TransactionCreate(TransactionBase):
    source_file: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    category: Optional[str] = None
    account: Optional[str] = None
    account_id: Optional[int] = None
    notes: Optional[str] = None


class TransactionOut(TransactionBase):
    id: int
    source_file: Optional[str] = None
    file_hash: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────────────────────────

class MonthlySummary(BaseModel):
    income: float
    expenses: float
    net: float
    savings_rate: float


class CategoryAmount(BaseModel):
    name: str
    amount: float


class MonthlyData(BaseModel):
    month: int
    income: float
    expenses: float
    net: float


# ── Upload ────────────────────────────────────────────────────────────────────

class ParsedTransaction(BaseModel):
    date: str
    description: str
    amount: float
    type: str
    category: str
    account: Optional[str] = None
    account_id: Optional[int] = None


class AccountHint(BaseModel):
    last4: Optional[str] = None
    institution: Optional[str] = None
    account_type: str = "credit_card"
    suggested_name: str = ""
    color: str = "#3b82f6"
