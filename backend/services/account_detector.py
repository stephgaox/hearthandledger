"""
Detect account info (institution, last 4 digits, type) from a filename or CSV content.
All results are suggestions — the user always confirms before saving.
"""

import os
import re
from typing import Optional

# Known institution colors
INSTITUTION_COLORS = {
    "chase":            "#4a627a", # muted navy
    "amex":             "#5f6c5a", # faded sage green
    "american express": "#5f6c5a", # faded sage green
    "citi":             "#8c4a3d", # brick red
    "citibank":         "#8c4a3d", # brick red
    "discover":         "#c07838", # warm copper
    "pnc":              "#b07030", # amber-copper
    "bank of america":  "#9a4848", # dusty crimson
    "bofa":             "#9a4848", # dusty crimson
    "wells fargo":      "#8a5a3a", # warm sienna
    "capital one":      "#9a4848", # dusty crimson
    "fidelity":         "#4a7c59", # forest green
    "vanguard":         "#7a5a82", # plum-mauve
    "usaa":             "#5a7a8a", # steel blue-gray
    "ally":             "#6a7888", # slate blue-gray
    "td bank":          "#6b7a3e", # olive green
}

# Filename patterns per institution: (regex, institution_name, account_type)
FILENAME_PATTERNS = [
    (r"Chase(\d{4})_",       "Chase",            "credit_card"),
    (r"Checking(\d{4})",     None,               "bank_account"),
    (r"Savings(\d{4})",      None,               "bank_account"),
    (r"amex",                "Amex",             "credit_card"),
    (r"discover",            "Discover",         "credit_card"),
    (r"citi",                "Citi",             "credit_card"),
    (r"pnc",                 "PNC",              "bank_account"),
    (r"bofa|bankofamerica",  "Bank of America",  "bank_account"),
    (r"wellsfargo",          "Wells Fargo",      "bank_account"),
]

# Keywords that suggest credit card vs bank account
CREDIT_CARD_WORDS = {"card", "credit", "sapphire", "freedom", "gold", "platinum",
                     "cash back", "rewards", "visa", "mastercard", "amex", "discover"}
BANK_ACCOUNT_WORDS = {"checking", "savings", "bank", "pnc", "fidelity", "ally",
                      "bofa", "wellsfargo", "td", "usaa", "vanguard"}


def _institution_color(institution: Optional[str]) -> str:
    if not institution:
        return "#8a9aaa"
    return INSTITUTION_COLORS.get(institution.lower(), "#8a9aaa")


def _guess_type_from_name(name: str) -> str:
    lower = name.lower()
    if any(w in lower for w in CREDIT_CARD_WORDS):
        return "credit_card"
    if any(w in lower for w in BANK_ACCOUNT_WORDS):
        return "bank_account"
    return "credit_card"  # default assumption


def detect_from_filename(filename: str) -> dict:
    base = os.path.splitext(filename)[0]
    lower = base.lower()

    last4 = None
    institution = None
    account_type = "credit_card"

    # Check known filename patterns
    for pattern, inst, atype in FILENAME_PATTERNS:
        m = re.search(pattern, base, re.IGNORECASE)
        if m:
            if inst:
                institution = inst
            account_type = atype
            # Capture last4 if group exists
            if m.lastindex and m.lastindex >= 1:
                last4 = m.group(1)
            break

    # Generic: any 4-digit sequence if not found yet
    if not last4:
        m = re.search(r"(\d{4})", base)
        if m:
            last4 = m.group(1)

    # Detect institution from filename if not found
    if not institution:
        for inst_key in INSTITUTION_COLORS:
            if inst_key.replace(" ", "") in lower.replace(" ", ""):
                institution = inst_key.title()
                account_type = _guess_type_from_name(inst_key)
                break

    return {
        "last4": last4,
        "institution": institution,
        "account_type": account_type,
    }


def detect_from_csv_content(content: str) -> dict:
    """Scan the first 15 lines of a CSV for embedded account info."""
    lines = content.split("\n")[:15]
    text = " ".join(lines)

    last4 = None
    institution = None

    # "ending in 1234" / "****1234" / "xxxx1234" / "...1234"
    m = re.search(r"(?:ending in|ending|xxxx|x{4}|\*{4}|\.{3,4})\s*(\d{4})", text, re.IGNORECASE)
    if m:
        last4 = m.group(1)

    # "Account: xxxxxxxx1234" or "Account Number: ...1234"
    if not last4:
        m = re.search(r"account[^:]*:\s*[x*\-\d\s]*?(\d{4})\b", text, re.IGNORECASE)
        if m:
            last4 = m.group(1)

    # Institution name in content
    for inst_key in INSTITUTION_COLORS:
        if inst_key in text.lower():
            institution = inst_key.title()
            break

    return {"last4": last4, "institution": institution}


def build_account_hint(filename: str, file_content: Optional[str] = None) -> dict:
    """
    Combine filename + content detection into a single hint dict.
    Returns:
        last4, institution, account_type, suggested_name, color
    """
    hint = detect_from_filename(filename)

    # Content detection can fill in gaps
    if file_content:
        content_hint = detect_from_csv_content(file_content)
        if not hint["last4"] and content_hint.get("last4"):
            hint["last4"] = content_hint["last4"]
        if not hint["institution"] and content_hint.get("institution"):
            hint["institution"] = content_hint["institution"]

    # Build a suggested display name
    parts = []
    if hint["institution"]:
        parts.append(hint["institution"])
    if hint["account_type"] == "credit_card":
        parts.append("Card")
    else:
        parts.append("Account")
    if hint["last4"]:
        parts.append(f"...{hint['last4']}")
    hint["suggested_name"] = " ".join(parts) if parts else ""
    hint["color"] = _institution_color(hint.get("institution"))

    return hint
