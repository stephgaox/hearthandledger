# Family Budget Dashboard — Roadmap

## Current State (v0.1 — done)

- Upload CSV / Excel / PDF / screenshots
- AI parsing for PDF and images (requires Anthropic API credits)
- Direct parsing for CSV and Excel — free, no API needed (Chase, Amex, Citi, Discover, generic)
- Dashboard: monthly & yearly views, bar chart, category donut, 4 KPI cards
- Transaction list: search, inline category edit, delete
- Manual transaction entry
- 2022 Excel data imported — all 1,107 transactions linked to colored account badges
- Account records auto-created on upload — user confirms name, type, last 4, color

---

## V1 — Core Financial Tracking

### ✅ Phase 1 · Account Tagging (done)
Every transaction knows which card or bank account it came from.

- [x] `accounts` table — name, type, institution, last 4 digits, color
- [x] Auto-detect account info from filename and CSV content
- [x] Upload dialog prompts user to confirm/fill account info
- [x] All new transactions saved with `account_id`
- [x] Transaction list shows colored account badge; inline edit can reassign account
- [x] 2022 Excel data backfilled to proper accounts

---

### ✅ Phase 2 · Cross-Account Transfer Detection (done 2026-04-06)
Prevent double-counting when a bank account pays off a credit card.

Solved via the **cash-basis two-ecosystem architecture** — better than the originally planned `transfer_pair_id` pairing approach:
- `transfer_in` / `transfer_out` directional types replace the generic `transfer`
- CC bill payments: `transfer_out` + category `CC Payments` — counted as bank expense once, never as CC income
- Payment received on CC: `transfer_in` + category `Payment Received` — excluded from all totals
- Inter-bank moves: balanced pairs (`transfer_out` + matching `transfer_in`) cancel out automatically
- Dashboard totals are strictly bank-ecosystem (income) and bank+CC (spending) — no double-counting possible

### 🔲 Phase 2b · Account Type Column in Transaction List
Add an **Account Type** indicator to the desktop transaction table so users can see at a glance whether each transaction came from a bank account or credit card.

- [ ] Backend: include `account_type` in `GET /api/transactions` response (join to `accounts.type`)
- [ ] Frontend: add `Bank` / `Credit Card` badge column between Account and Category in desktop table
- [ ] Mobile: small badge on the account line in card view
- [ ] Support filtering: extend existing account dropdown or add Bank / CC toggle

---

### 🔲 Phase 3 · UI Polish with shadcn/ui
Replace hand-built Tailwind components with a proper component library.

**Why:** shadcn/ui gives polished buttons, dialogs, dropdowns, and cards — used by
thousands of production apps, looks professional, consistent design system.

**Steps:**
- [ ] `npx shadcn@latest init` (modifies `tailwind.config.js`, `tsconfig.json`, `vite.config.ts`)
- [ ] Add components: `button`, `dialog`, `select`, `input`, `badge`, `card`, `tabs`, `tooltip`
- [ ] Replace inline Tailwind buttons/inputs throughout existing components
- [ ] Keep custom `income` / `expense` / `net` colors in Tailwind config after shadcn rewrites it
- [ ] Account filter bar — click any account pill to scope the whole dashboard to that account
- [ ] Better mobile layout (stack cards vertically, responsive table)

---

### 🔲 Phase 4 · Statements View (sidebar navigation)
Per-account spreadsheet showing all transactions across all time, accessible from a left sidebar.

- [ ] Hamburger icon in header opens a slide-in sidebar (w-64, z-40)
- [ ] Sidebar "Statements" section lists all accounts by name with color dot; future stubs: Budget Goals, Reports
- [ ] Each account in the sidebar shows the date range covered by its transactions (e.g. "Jan 2023 – Dec 2024") — fetched from a lightweight `/api/accounts/summary` endpoint or derived from the existing source-files endpoint; displayed as a subtitle under the account name
- [ ] Clicking an account switches main area to a read-only statement table grouped by year
- [ ] **Limited inline editing within the statement** — only fields that are easy to get wrong from auto-parsing:
  - Correct the **sign** (flip income ↔ expense) for misclassified amounts
  - Correct the **transaction type** (`income` / `expense` / `transfer_in` / `transfer_out`)
  - Correct the **category**
  - All other fields (date, description, amount value) remain read-only in this view to preserve statement integrity
- [ ] "← Dashboard" breadcrumb returns to main view; month/year nav hidden in statement view
- [ ] No new backend endpoint needed — `GET /api/transactions?account_id=X` (no year/month) returns all-time data

---

## Alternative Dashboard Chart Options (TBD — Row 3 left slot)

Three options considered for the empty left panel in dashboard Row 3:

- **Savings goal progress** — a goal-vs-actual bar per category; shows how close spending is to a user-defined monthly limit
- **Net worth / investment tracker** — pulls investment transfer_out transactions over time; plots a running balance line chart to visualize growth
- **Monthly cashflow waterfall** — income → spending components (bank direct, CC payments) → net; a waterfall bar that breaks down where each dollar went

---

## V2 — Sharing & Growth (future)

These are ideas for after V1 is stable and being used regularly.

- [ ] **Budget goals** — set a monthly spending limit per category; dashboard shows progress bar
- [ ] **Recurring bills tracker** — recreate the "Bills" sheet from the 2022 Excel; track fixed monthly bills separately from variable spending
- [ ] **Export** — download filtered transactions as CSV, or generate a monthly PDF summary
- [ ] **Multi-user / family members** — separate login per family member, shared dashboard view
- [ ] **Cloud deployment** — host on Railway, Fly.io, or similar so family can access from phone without running the app locally; migrate SQLite → PostgreSQL at that point
- [ ] **AI batch categorization for CSV uploads** — after direct parsing, send all `"Other"` descriptions to Claude Haiku in one batch call to auto-categorize novel merchants; hold until deployment since it requires API key availability in production (Option A, deferred)
- [ ] **Income tracking** — upload pay stubs or bank deposits to track salary, bonuses, and other income separately from spending

---

## Technical Decisions Log

| Decision | Reason |
|---|---|
| SQLite (not Postgres) | File-based, zero setup, sufficient for personal/family use indefinitely |
| Direct CSV parser (no AI) | Free, instant, handles all major bank formats; AI only needed for PDF/images |
| No Alembic migrations | Personal tool; simple `ALTER TABLE` shim in `database.py` is sufficient |
| No React Router | Only 3 pages; simple `page` state string avoids dependency overhead |
| Accounts created on upload | Simpler than a separate account setup screen; auto-detect fills in most fields |

---

## Known Issues / Tech Debt

- 2022 Excel accounts have no `last4` — they were imported from text names, not card numbers. Can be filled in manually via the transaction list edit button.
- The yearly category chart fires 12 parallel API calls (one per month). Works fine but could be replaced with a single `/api/dashboard/yearly/categories` endpoint later.
- `import_excel.py` and `assign_2022_accounts.py` are one-time scripts — they should not be run again against an already-populated database.
