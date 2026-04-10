# Distribution Plan: Hearth & Ledger

## What We're Working With

**Current stack:**
- **Backend**: Python (FastAPI + SQLite + Anthropic API)
- **Frontend**: Vite + React + TypeScript + Tailwind
- **Entry point**: `start.sh` (runs both locally already)
- **Key constraint**: Requires an `ANTHROPIC_API_KEY` — users must bring their own

---

## Recommended Strategy: Two Tiers

Deliver two experiences for two audiences.

---

## Tier 1: GitHub Self-Host (Technical Users) — Primary

Already 80% there. Just needs Docker and a clean README.

### Step 1 — Clean the Repo for Public Release

| Task | Details |
|---|---|
| `statements/` folder | Add to `.gitignore` — personal PDFs should never ship |
| `familybudget.db` | Add to `.gitignore` — no user's data in the repo |
| `.env` | Confirm it's gitignored |
| `CLAUDE.md` / `.claude/` | Review whether to keep or remove before publishing |
| `demo_data/` | Keep — the 6 demo CSVs we just created become the official demo |

### Step 2 — Docker Compose (One-Command Install)

Create `docker-compose.yml` at the root. Most impactful single file for distribution.

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    volumes: ["./data:/app/data"]   # persistent SQLite DB outside container
    env_file: .env

  frontend:
    build: ./frontend
    ports: ["80:80"]
    depends_on: [backend]
```

**Files to create:**
- `backend/Dockerfile` — Python 3.12-slim, pip install requirements, run uvicorn
- `frontend/Dockerfile` — Node 20 build stage → nginx alpine serve stage

**User experience becomes:**
```bash
git clone https://github.com/you/hearth-ledger
cd hearth-ledger
cp .env.example .env    # add ANTHROPIC_API_KEY
docker compose up
# → opens on http://localhost
```

### Step 3 — README Rewrite

The README becomes the product landing page. Needs:
- Hero screenshot or GIF of the dashboard
- **3-path quickstart**: Docker (recommended), `start.sh` (dev), manual
- Clear callout: "You need an Anthropic API key" + link to get one
- "Try the demo" section pointing to `demo_data/` with upload instructions
- Feature list (category detection, CC trend chart, dark mode, etc.)

### Step 4 — GitHub v1.0.0 Release

- Tag `v1.0.0` in git
- Create a GitHub Release with release notes
- Attach all 6 demo CSV files as downloadable release assets
- GitHub auto-generates `.zip` and `.tar.gz` source downloads

---

## Tier 2: One-Click Cloud Deploy (Non-Technical Users)

No terminal, no Docker. Just a URL.

### Recommended Platform: Railway

Railway reads a `railway.toml` config from the repo and handles multi-service deployments automatically.

| Component | How It Works |
|---|---|
| Backend service | Python buildpack detects `requirements.txt`, runs uvicorn |
| Frontend service | Node buildpack builds Vite, serves `/dist` via CDN |
| `ANTHROPIC_API_KEY` | User pastes it into Railway's env var dashboard |
| SQLite file | Mounted to a Railway persistent volume (`$RAILWAY_VOLUME_MOUNT_PATH`) |
| Public URL | Railway assigns a free `.railway.app` domain on first deploy |

**Estimated cost:** Free for low-traffic use; ~$5/month if using a persistent volume.

**Alternative: Render.com** — very similar, also free tier, strong Python + static site support.

> [!WARNING]
> SQLite works fine for personal/family use (1–5 users). If you ever want to make this multi-tenant (many families sharing one server), you'd need to add PostgreSQL + user authentication. That's a separate project.

### README Deploy Button

A one-click button in the README lets people deploy without any local setup:

```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/YOUR_TEMPLATE_ID)
```

---

## What We Do NOT Need

| Thing | Why Skip |
|---|---|
| Electron desktop app | Docker already gives a local GUI feel without native packaging |
| PostgreSQL migration | Overkill for personal/family-scale SQLite |
| User auth / login | Out of scope for personal use |
| App Store listing | Mobile packaging (Capacitor) is a separate future project |
| CI/CD pipeline | Nice to have, not required for v1 |

---

## Effort Estimate

| Task | Time |
|---|---|
| `.gitignore` audit + cleanup | 30 min |
| `backend/Dockerfile` | 45 min |
| `frontend/Dockerfile` (nginx) | 45 min |
| `docker-compose.yml` | 30 min |
| README rewrite + screenshot | 2–3 hrs |
| `git tag v1.0.0` + GitHub Release | 30 min |
| `railway.toml` + test deploy | 1–2 hrs |
| **Total** | **~6–8 hours** |

---

## Order of Execution (When Approved)

1. `.gitignore` audit
2. `backend/Dockerfile`
3. `frontend/Dockerfile`
4. `docker-compose.yml`
5. `README.md` full rewrite
6. Tag `v1.0.0`, create GitHub Release, attach demo CSVs
7. `railway.toml`, test cloud deploy
8. Add one-click deploy button to README

> [!IMPORTANT]
> The Anthropic API key is the only real blocker for non-technical users. Consider adding a note that the app is **fully functional without a key** for CSV uploads — only PDF/image uploads require Anthropic. This dramatically lowers the barrier to try the app.
