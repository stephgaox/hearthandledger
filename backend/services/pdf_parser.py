"""
Free PDF statement parser using pdfplumber.

Strategy:
  1. Extract full text from all pages.
  2. Locate the TRANSACTIONS section (skip boilerplate pages).
  3. Track section context (credits vs purchases) to determine transaction type.
  4. Parse each line: short date (M/D or M/D/YY) + description + amount at end.
  5. Infer year from the statement closing date found in the header.
  6. Fall back to AI if text is too short (scanned/image PDF).
"""

import re
from datetime import date as date_type
from typing import Optional

import pdfplumber

from services.direct_parser import _map_category

# ── Date helpers ───────────────────────────────────────────────────────────────

# Matches: "3/20/2026", "03/20/26", "3-20-2026"
_FULL_DATE_RE = re.compile(r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b")

# Short date at start of line: "2/22" or "02/22"
_SHORT_DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})\s+")

# Amount at end of line: "$34.29", "-$28.46", "($28.46)"
_AMOUNT_RE = re.compile(r"[\-\+]?\$?[\d,]+\.\d{2}\)?\s*$")


def _parse_full_date(text: str) -> Optional[date_type]:
    m = _FULL_DATE_RE.search(text)
    if not m:
        return None
    month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if year < 100:
        year += 2000
    try:
        return date_type(year, month, day)
    except ValueError:
        return None


def _parse_short_date(line: str, stmt_year: int, stmt_month: int) -> Optional[tuple[date_type, str]]:
    """Parse a short M/D date at line start; return (date, rest_of_line) or None."""
    m = _SHORT_DATE_RE.match(line)
    if not m:
        return None
    month, day = int(m.group(1)), int(m.group(2))
    # If transaction month > statement month, it's from the prior year
    year = stmt_year if month <= stmt_month else stmt_year - 1
    try:
        d = date_type(year, month, day)
    except ValueError:
        return None
    rest = line[m.end():]
    return d, rest


def _parse_amount(text: str) -> Optional[tuple[float, str]]:
    """Extract the trailing amount; return (float, line_without_amount) or None."""
    m = _AMOUNT_RE.search(text)
    if not m:
        return None
    raw = m.group(0).strip()
    # Strip currency / formatting
    negative = raw.startswith("-") or raw.startswith("(")
    cleaned = re.sub(r"[^\d.]", "", raw)
    try:
        val = float(cleaned)
    except ValueError:
        return None
    if negative:
        val = -val
    desc = text[:m.start()].strip()
    return val, desc


# ── Section classifier ────────────────────────────────────────────────────────

def _section_type(line: str) -> Optional[str]:
    """Return 'credit', 'debit', or None if line is a section header."""
    lo = line.lower()
    if any(k in lo for k in ("payments and other credits", "credits", "other credits")):
        return "credit"
    if any(k in lo for k in ("purchases and other debits", "purchases", "other debits", "transactions")):
        return "debit"
    return None


def _is_skip_line(line: str) -> bool:
    lo = line.lower().strip()
    return (
        lo.startswith("total ")
        or lo.startswith("trans date")
        or lo.startswith("description")
        or lo.startswith("page ")
        or lo.startswith("statement closing")
        or lo.startswith("interest charge")
        or not lo
    )


# ── Income keyword override ───────────────────────────────────────────────────

_INCOME_KEYWORDS = (
    "interest", "dividend", "deposit", "lending",
    "payroll", "paycheck", "direct deposit", "ach deposit",
    "cash back", "cashback", "reward",
)

_TRANSFER_KEYWORDS = (
    "e-pay", "epay", "autopay", "payment", "mobile payment",
    "online payment", "credit card pay", "transfer",
)


def _classify_type(desc: str, section: str) -> str:
    lo = desc.lower()
    if any(k in lo for k in _TRANSFER_KEYWORDS):
        # Use section to determine direction:
        # debit section = money leaving → transfer_out (e.g. CC bill payment from bank)
        # credit section = money arriving → transfer_in (e.g. payment received on CC)
        return "transfer_out" if section == "debit" else "transfer_in"
    if any(k in lo for k in _INCOME_KEYWORDS):
        return "income"
    if section == "credit":
        return "income"
    return "expense"


# ── Main parser ───────────────────────────────────────────────────────────────

def _find_transaction_pages(pages) -> list[str]:
    """Return text of pages that contain a TRANSACTIONS section."""
    result = []
    for page in pages:
        text = page.extract_text() or ""
        if re.search(r"\bTRANSACTIONS\b", text, re.IGNORECASE):
            result.append(text)
    return result


def parse_pdf_direct(path: str) -> Optional[list[dict]]:
    """
    Parse a PDF bank statement without AI.
    Returns transaction list, or None if the PDF appears scanned/image-based.
    """
    with pdfplumber.open(path) as pdf:
        all_pages = pdf.pages
        full_text = "\n".join(p.extract_text() or "" for p in all_pages)

    # Too little text → scanned/image PDF → fall back to AI
    if len(full_text.strip()) < 200:
        return None

    # Find statement closing date to infer year for short dates
    stmt_date = _parse_full_date(full_text)
    stmt_year = stmt_date.year if stmt_date else date_type.today().year
    stmt_month = stmt_date.month if stmt_date else date_type.today().month

    # Find pages with TRANSACTIONS section
    tx_pages_text = _find_transaction_pages(all_pages)
    if not tx_pages_text:
        # Try whole document as fallback
        tx_pages_text = [full_text]

    transactions = []

    for page_text in tx_pages_text:
        lines = page_text.splitlines()

        # Find start of TRANSACTIONS block
        in_tx_section = False
        current_section = "debit"  # default

        for line in lines:
            stripped = line.strip()

            # Enter transactions block
            if re.match(r"^\s*TRANSACTIONS\s*$", stripped, re.IGNORECASE):
                in_tx_section = True
                continue

            if not in_tx_section:
                continue

            # Section headers (no date at start)
            sec = _section_type(stripped)
            if sec and not _SHORT_DATE_RE.match(stripped):
                current_section = sec
                continue

            # Skip noise lines
            if _is_skip_line(stripped):
                continue

            # Try to parse as transaction line
            result = _parse_short_date(stripped, stmt_year, stmt_month)
            if not result:
                continue
            tx_date, rest = result

            amt_result = _parse_amount(rest)
            if not amt_result:
                continue
            amount, desc = amt_result

            desc = re.sub(r"\s+", " ", desc).strip()
            if not desc:
                continue

            abs_amount = abs(amount)
            tx_type = _classify_type(desc, current_section)

            transactions.append({
                "date": tx_date.isoformat(),
                "description": desc,
                "amount": round(abs_amount, 2),
                "type": tx_type,
                "category": _map_category("", desc),
            })

    return transactions if transactions else None
