#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Check for .env ────────────────────────────────────────────────────────────
if [ ! -f "$ROOT/.env" ]; then
  echo "⚠️  No .env file found."
  echo "   Run: cp .env.example .env"
  echo "   Then add your ANTHROPIC_API_KEY"
  exit 1
fi

# Load env vars for this script (so we can check the key)
set -a; source "$ROOT/.env"; set +a

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "your_anthropic_api_key_here" ]; then
  echo "⚠️  Please set ANTHROPIC_API_KEY in .env"
  exit 1
fi

# ── Backend ───────────────────────────────────────────────────────────────────
echo "▶ Setting up Python backend..."
cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

echo "▶ Starting backend on http://localhost:8000 ..."
# Copy .env so uvicorn picks it up
cp "$ROOT/.env" "$ROOT/backend/.env" 2>/dev/null || true

uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "▶ Setting up frontend..."
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
  npm install
fi

echo "▶ Starting frontend on http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!

# ── Open browser ──────────────────────────────────────────────────────────────
sleep 3
if command -v open &>/dev/null; then
  open "http://localhost:5173"
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:5173"
fi

echo ""
echo "✅ HearthNet Dashboard is running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   Press Ctrl+C to stop."
echo ""

# ── Cleanup on exit ───────────────────────────────────────────────────────────
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT INT TERM
wait $BACKEND_PID $FRONTEND_PID
