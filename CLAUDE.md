# Family Budget Dashboard

A personal family budget tracking web app with AI-powered statement parsing.
Built to replace a manual Excel tracker with an easy upload-and-visualize workflow.

## Architecture

```
familybudget/
├── backend/                  FastAPI + SQLite + Anthropic SDK
│   ├── main.py               App entry point, CORS, lifespan
│   ├── database.py           SQLAlchemy engine + session + table init + category seeding
│   ├── models.py             Transaction + Category + Account ORM models
│   ├── schemas.py            Pydantic request/response schemas
│   ├── requirements.txt      Python dependencies
│   ├── routers/
│   │   ├── upload.py         POST /api/upload/parse + /api/upload/confirm
│   │   ├── transactions.py   CRUD: GET/POST/PATCH/DELETE /api/transactions
│   │   ├── dashboard.py      GET /api/dashboard/monthly|monthly/context|yearly|yearly/categories|years
│   │   └── settings.py       CRUD for /api/categories and /api/accounts
│   └── services/
│       ├── ai_parser.py        Claude AI file parsing (image/PDF)
│       ├── direct_parser.py    Universal CSV + Excel parser (no AI)
│       ├── pdf_parser.py       Rule-based PDF parser (no AI, structured PDFs)
│       └── account_detector.py Auto-detect account info from filename/CSV headers
│
├── frontend/                 React + Vite + TypeScript + Tailwind + Recharts
│   ├── tailwind.config.js    Design token system (semantic color tokens)
│   ├── src/
│   │   ├── App.tsx           Root layout, header nav, month/year controls
│   │   ├── index.css         Global styles: warm body, focus-visible ring, reduced-motion
│   │   ├── api/client.ts     Axios API calls to backend
│   │   ├── types/index.ts    Shared TypeScript interfaces
│   │   ├── hooks/
│   │   │   └── useFocusTrap.ts  Accessible modal focus management
│   │   └── components/
│   │       ├── Dashboard.tsx         Main dashboard (month + year views)
│   │       ├── SummaryCards.tsx      4 KPI cards (income/spending/net/rate)
│   │       ├── TransactionList.tsx   Dual-layout list (mobile cards + desktop table)
│   │       ├── UploadModal.tsx       Drag-drop upload + parse + duplicate detection
│   │       ├── ManageModal.tsx       Accounts & categories CRUD with color picker
│   │       └── charts/
│   │           ├── CategoryPieChart.tsx   Spending by category donut chart
│   │           └── MonthlyBarChart.tsx    Income vs spending bar chart
│
├── .impeccable.md            Design context for AI design skills
├── .env.example              Environment variable template
├── CHANGELOG.md              Running log of material changes (update after each session)
├── ROADMAP.md                Feature roadmap and technical decisions log
├── start.sh                  One-command startup script
└── 2022 Family Money Tracker.xlsx   Reference only (original tracker)
```

## How to Run

### First time setup

```bash
cd ~/projects/familybudget
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
./start.sh
```

Opens at **http://localhost:5175** automatically.

> **Note**: If ports 5173–5174 are already in use from a previous session, Vite bumps to the next available port. Kill old instances first to get a consistent address:
> ```bash
> pkill -f "uvicorn main:app"; pkill -f "vite"
> ```

### Subsequent runs

```bash
cd ~/projects/familybudget && ./start.sh
```

## Key Details

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Powers AI parsing of all file types |
| `DATABASE_URL` | No | Defaults to `sqlite:///./familybudget.db` |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload/parse` | Upload file → parsed transactions preview + `file_hash` |
| POST | `/api/upload/confirm` | Save transactions; returns `{saved, duplicate}` |
| GET | `/api/transactions` | List (filter: year, month, category, account_id) |
| POST | `/api/transactions` | Add a single transaction manually |
| PATCH | `/api/transactions/:id` | Update transaction |
| DELETE | `/api/transactions/:id` | Delete a transaction |
| GET | `/api/dashboard/monthly` | Month summary + category breakdown |
| GET | `/api/dashboard/monthly/context` | Last N months of income/expenses (1 query, replaces 6 parallel calls) |
| GET | `/api/dashboard/yearly` | Full 12-month data + annual totals |
| GET | `/api/dashboard/yearly/categories` | Annual category breakdown — returns `{all, bank, cc}` |
| GET | `/api/dashboard/years` | List of years with data |
| GET | `/api/categories` | All categories with id, name, color |
| POST | `/api/categories` | Create category |
| PATCH | `/api/categories/:id` | Update category (name, color) |
| DELETE | `/api/categories/:id` | Delete (blocked with 409 if transactions reference it) |
| GET | `/api/accounts` | All accounts |
| POST | `/api/accounts` | Create account |
| PATCH | `/api/accounts/:id` | Update account |
| DELETE | `/api/accounts/:id` | Delete (blocked with 409 if transactions reference it) |

### Database Schema

SQLite at `backend/familybudget.db`. Tables:

```
transactions(id, date, description, amount, type, category, account, account_id,
             source_file, notes, file_hash, created_at)

categories(id, name, color, sort_order, created_at)
  — seeded with 16 defaults on startup if empty

accounts(id, name, type, institution, last4, color, created_at)
```

- `type` values: `'income'` | `'expense'` | `'transfer_in'` | `'transfer_out'` | `'transfer'` (legacy)
- `amount` is `Numeric(12,2)` — always positive; sign is determined by `type`.
- `file_hash` is SHA-256 of uploaded file bytes — used for duplicate detection.
- `account_id` FK links transaction to accounts table; `account` is a legacy text field.
- `accounts.type` is `'bank_account'` | `'credit_card'` | `'investment'`

### Design Token System (Tailwind)

All components use semantic tokens instead of raw Tailwind palette classes:

```js
primary:  { DEFAULT, hover, light, text }   // brand blue
income:   { DEFAULT, light, text }           // green
expense:  { DEFAULT, light, text }           // red
surface:  { DEFAULT, card, border, hover }   // warm neutrals
text:     { DEFAULT, muted, faint }          // warm near-blacks
```

**Never use** `gray-*`, `blue-*`, `bg-white`, `border-gray-200` directly — use tokens.

### Accessibility Standards

- All modals: `role="dialog" aria-modal="true" aria-label="..."` + `useFocusTrap` hook
- `useFocusTrap`: Tab/Shift+Tab cycling, Escape-to-close, focus restoration on unmount
- All icon-only buttons have `aria-label`
- Toggle buttons have `aria-pressed`
- Filter selects have `aria-label`
- Global `:focus-visible` ring in `index.css`
- `@media (prefers-reduced-motion)` disables all animations globally

### Adding Transactions — Three Ways

1. **Direct Upload (free)** — CSV or Excel; universal parser auto-detects bank format (Chase, Amex, Citi, Discover, PNC, generic). Amex uses positive=expense convention (auto-detected).
2. **AI Upload** — PDF or image; Claude Haiku extracts and categorizes (~$0.001/upload).
3. **Manual Entry** — Upload modal → "Enter Manually" tab.

### Supported Upload Formats

| Format | Parsing | Cost |
|---|---|---|
| CSV (Chase, Amex, Citi, Discover, PNC, generic) | Direct — no AI | Free |
| Excel .xlsx (Family Money Tracker format) | Direct — no AI | Free |
| PDF bank statements | AI (Claude Haiku) | ~$0.001/upload |
| PNG / JPG / WebP screenshots | AI (Claude Haiku) | ~$0.001/upload |

### CSV Amount Convention Detection

`direct_parser.py` samples up to 20 rows to determine sign convention:
- ≥65% positive amounts → Amex/Discover (positive = expense)
- Otherwise → Chase/Citi (positive = income, negative = expense)
- `prefix_sign` format (e.g. `- $50.00`) → PNC-style explicit sign

### Duplicate File Detection

`upload.py` computes SHA-256 of file bytes on parse. On confirm, checks if any existing transaction has the same `file_hash`. Returns `{saved: 0, duplicate: true}` if matched — no transactions saved.

### Responsive Layout

`TransactionList` has two layouts:
- Mobile (`md:hidden`): card-per-transaction with category color strip, 44px touch targets
- Desktop (`hidden md:block`): full table with hover-reveal action buttons

### Cash-Basis Two-Ecosystem Architecture

Dashboard totals use a strict two-ecosystem model to prevent double-counting when bank accounts pay off credit cards.

**Bank Ecosystem (Cash Flow)**
- Income = bank account `income` transactions only
- Expenses = bank account direct expenses + CC bill payments (`transfer_out` + category `CC Payments`)
- Net Savings = Income − Expenses
- Bar chart and yearly view are filtered to `bank_account` type only

**CC Ecosystem (Liability Ledger)**
- CC Net Charges = CC `expense` transactions − CC refunds (`income`)
- `Payment Received` on CC (`transfer_in`) is excluded from all totals — it's a liability payoff, not real income

**Transfer type rules**
| Category | Type |
|---|---|
| CC Payments | `transfer_out` |
| Payment Received | `transfer_in` |
| Withdraw | `transfer_out` |
| Inter-bank move (out) | `transfer_out` |
| Inter-bank move (in) | `transfer_in` |

**Investment detection** — `transfer_out` transactions are only flagged as investments if they cannot be balanced against a matching `transfer_in` of the same amount (prevents inter-bank transfers from being miscounted as investments).

**Category pie chart** has a 3-state toggle: All / Bank / CC — driven by `/yearly/categories` returning `{all, bank, cc}`.

## Development Notes

- Vite dev server proxies `/api/*` to `localhost:8000` (see `frontend/vite.config.ts`)
- Backend creates DB tables and seeds categories on startup — no migrations needed
- AI parsing uses `claude-haiku-4-5-20251001`
- Context bar chart shows last 6 months via single `/dashboard/monthly/context` call
- Yearly category chart uses single `/dashboard/yearly/categories` call — returns `{all, bank, cc}` sets
- Clicking a pie chart category filters the transaction list
- `ManageModal` accessible from both App header (⚙️) and TransactionList header

## Roadmap / Future Ideas

- [ ] Budget goals / spending limits per category
- [ ] Export to CSV/PDF report
- [ ] Multi-user / family member accounts
- [ ] Recurring bills tracker
- [ ] Deploy to cloud (Railway, Fly.io, Vercel)
