from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import Account, Category, Transaction

router = APIRouter()

# ── Categories ────────────────────────────────────────────────────────────────

@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(Category).order_by(Category.sort_order, Category.name).all()
    return [{"id": c.id, "name": c.name, "color": c.color} for c in cats]

@router.post("/categories")
def create_category(payload: dict, db: Session = Depends(get_db)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if db.query(Category).filter(Category.name == name).first():
        raise HTTPException(status_code=409, detail="Category already exists")
    max_order = db.query(Category).count()
    cat = Category(name=name, color=payload.get("color", "#6b7280"), sort_order=max_order)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "color": cat.color}

@router.patch("/categories/{cat_id}")
def update_category(cat_id: int, payload: dict, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if "name" in payload and payload["name"]:
        new_name = payload["name"].strip()
        if new_name != cat.name:
            # Case-insensitive check: "target" and "Target" should merge, not collide
            existing = db.query(Category).filter(
                func.lower(Category.name) == new_name.lower(), Category.id != cat_id
            ).first()
            if existing:
                # Merge: move all transactions to the existing category, then delete this one
                db.query(Transaction).filter(Transaction.category == cat.name).update(
                    {"category": existing.name}, synchronize_session=False
                )
                db.delete(cat)
                db.commit()
                return {"id": existing.id, "name": existing.name, "color": existing.color, "merged": True}
            # Normal rename — cascade to transactions
            db.query(Transaction).filter(Transaction.category == cat.name).update(
                {"category": new_name}, synchronize_session=False
            )
        cat.name = new_name
    if "color" in payload and payload["color"]:
        cat.color = payload["color"]
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "color": cat.color}

@router.delete("/categories/{cat_id}")
def delete_category(
    cat_id: int,
    reassign_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    count = db.query(Transaction).filter(Transaction.category == cat.name).count()
    if count > 0:
        if not reassign_to:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete: {count} transaction(s) use this category",
            )
        # Reassign transactions before deleting
        db.query(Transaction).filter(Transaction.category == cat.name).update(
            {"category": reassign_to}, synchronize_session=False
        )
    db.delete(cat)
    db.commit()
    return {"deleted": True}

# ── Accounts ──────────────────────────────────────────────────────────────────

@router.get("/accounts/date-ranges")
def account_date_ranges(db: Session = Depends(get_db)):
    """Return min/max transaction date per account for sidebar date-range display."""
    rows = (
        db.query(
            Transaction.account_id,
            func.min(Transaction.date).label("min_date"),
            func.max(Transaction.date).label("max_date"),
        )
        .filter(Transaction.account_id.isnot(None))
        .group_by(Transaction.account_id)
        .all()
    )
    return [
        {"account_id": r.account_id, "min_date": str(r.min_date), "max_date": str(r.max_date)}
        for r in rows
    ]


@router.post("/accounts")
def create_account(payload: dict, db: Session = Depends(get_db)):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    acct = Account(
        name=name,
        type=payload.get("type", "credit_card"),
        institution=payload.get("institution"),
        last4=payload.get("last4"),
        color=payload.get("color", "#3b82f6"),
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return {"id": acct.id, "name": acct.name, "type": acct.type,
            "institution": acct.institution, "last4": acct.last4, "color": acct.color}

@router.patch("/accounts/{acct_id}")
def update_account(acct_id: int, payload: dict, db: Session = Depends(get_db)):
    acct = db.query(Account).filter(Account.id == acct_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    if "name" in payload and payload["name"] is not None:
        new_name = payload["name"].strip()
        if new_name != acct.name:
            db.query(Transaction).filter(Transaction.account_id == acct_id).update(
                {"account": new_name}, synchronize_session=False
            )
        acct.name = new_name
    for field in ("type", "institution", "last4", "color"):
        if field in payload and payload[field] is not None:
            setattr(acct, field, payload[field])
    db.commit()
    db.refresh(acct)
    return {"id": acct.id, "name": acct.name, "type": acct.type,
            "institution": acct.institution, "last4": acct.last4, "color": acct.color}

@router.delete("/accounts/{acct_id}")
def delete_account(acct_id: int, db: Session = Depends(get_db)):
    acct = db.query(Account).filter(Account.id == acct_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    count = db.query(Transaction).filter(Transaction.account_id == acct_id).count()
    if count > 0:
        raise HTTPException(status_code=409, detail=f"Cannot delete: {count} transaction(s) linked to this account")
    db.delete(acct)
    db.commit()
    return {"deleted": True}
