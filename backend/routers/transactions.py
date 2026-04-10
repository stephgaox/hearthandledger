from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Transaction
from schemas import TransactionCreate, TransactionOut, TransactionUpdate

router = APIRouter()


class BulkDeleteRequest(BaseModel):
    ids: list[int]


class FileDeleteRequest(BaseModel):
    file_hash: str


class ReclassifyRequest(BaseModel):
    from_category: str
    to_category: str


@router.get("/transactions/source-files")
def list_source_files(account_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    """Return distinct uploaded files (file_hash + source_file name + count), optionally filtered by account."""
    from sqlalchemy import func
    q = (
        db.query(
            Transaction.file_hash,
            Transaction.source_file,
            func.count(Transaction.id).label("count"),
            func.min(Transaction.date).label("min_date"),
            func.max(Transaction.date).label("max_date"),
        )
        .filter(Transaction.file_hash.isnot(None))
    )
    if account_id is not None:
        q = q.filter(Transaction.account_id == account_id)
    rows = (
        q
        .group_by(Transaction.file_hash, Transaction.source_file)
        .order_by(func.max(Transaction.date).desc())
        .all()
    )
    return [
        {
            "file_hash": r.file_hash,
            "source_file": r.source_file,
            "count": r.count,
            "min_date": r.min_date.isoformat() if r.min_date else None,
            "max_date": r.max_date.isoformat() if r.max_date else None,
        }
        for r in rows
    ]


@router.delete("/transactions/all")
def delete_all_transactions(db: Session = Depends(get_db)):
    """Delete every transaction. Irreversible. Returns count deleted."""
    count = db.query(Transaction).count()
    db.query(Transaction).delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}


@router.delete("/transactions/bulk")
def bulk_delete(req: BulkDeleteRequest, db: Session = Depends(get_db)):
    """Delete a list of transaction IDs in one query."""
    deleted = (
        db.query(Transaction)
        .filter(Transaction.id.in_(req.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


@router.delete("/transactions/by-file")
def delete_by_file(req: FileDeleteRequest, db: Session = Depends(get_db)):
    """Delete all transactions belonging to a specific uploaded file."""
    deleted = (
        db.query(Transaction)
        .filter(Transaction.file_hash == req.file_hash)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


@router.patch("/transactions/reclassify")
def reclassify_transactions(req: ReclassifyRequest, db: Session = Depends(get_db)):
    """Bulk move all transactions from one category name to another."""
    updated = (
        db.query(Transaction)
        .filter(Transaction.category == req.from_category)
        .update({"category": req.to_category}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    account_id: Optional[int] = Query(None),
    file_hash: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if file_hash:
        q = q.filter(Transaction.file_hash == file_hash)
    else:
        if year:
            q = q.filter(Transaction.date >= date_type(year, 1, 1)).filter(
                Transaction.date < date_type(year + 1, 1, 1)
            )
        if month and year:
            start = date_type(year, month, 1)
            end = date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)
            q = q.filter(Transaction.date >= start).filter(Transaction.date < end)
        if category:
            q = q.filter(Transaction.category == category)
        if account_id:
            q = q.filter(Transaction.account_id == account_id)
    return q.order_by(Transaction.date.desc()).all()


@router.post("/transactions", response_model=TransactionOut)
def create_transaction(tx: TransactionCreate, db: Session = Depends(get_db)):
    obj = Transaction(**tx.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


# When a user recategorizes to a transfer-class category, infer the correct
# directional type rather than collapsing everything to a generic "transfer".
_CATEGORY_TYPE_MAP = {
    "CC Payments":       "transfer_out",   # bank paying a CC bill — always outgoing
    "Payment Received":  "transfer_in",    # CC receiving a payment — always incoming
    "Withdraw":          "transfer_out",   # cash withdrawal — always outgoing
    "Transfer":          None,             # plain transfer — preserve existing type
}


@router.patch("/transactions/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, tx: TransactionUpdate, db: Session = Depends(get_db)):
    obj = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Transaction not found")
    data = tx.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(obj, field, value)
    # If category implies a direction, set type accordingly (only when category changed
    # and the caller didn't explicitly supply a type override).
    if "category" in data and "type" not in data and obj.category in _CATEGORY_TYPE_MAP:
        inferred = _CATEGORY_TYPE_MAP[obj.category]
        if inferred is not None:
            obj.type = inferred
    # Amounts are always stored positive.
    if obj.amount is not None and obj.amount < 0:
        obj.amount = abs(obj.amount)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    obj = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(obj)
    db.commit()
    return {"deleted": True}


