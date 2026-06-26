#!/bin/bash

# Exit on any error
set -e

# Resolve to the parent directory (the monorepo root), since this script
# lives inside mystic-vibes-api/ but sibling repos are at the same level.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &> /dev/null && pwd)
AI_SERVICE_DIR="$SCRIPT_DIR/AI-service"

# Use Colima's Docker socket if available
if [ -S "$HOME/.colima/default/docker.sock" ]; then
  export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
fi

# Use newer Docker CLI if the system one is too old
if [ -x "/opt/homebrew/Cellar/docker/29.4.0/bin/docker" ]; then
  export PATH="/opt/homebrew/Cellar/docker/29.4.0/bin:$PATH"
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ── Production-host guard ────────────────────────────────────────────────────
# This stack binds FIXED ports (11434/5001/11435) and the live `mystic-ai`
# cloudflared tunnel. On a machine with multiple clones of this repo, whichever
# clone runs this script LAST silently becomes production — and if that clone
# has stale code or is missing the cloud API keys, live palm readings degrade
# (e.g. fall back to slow local Ollama). That actually happened.
#
# So only the folder carrying the `.production-host` marker (a gitignored,
# host-local file at the monorepo root) may start the shared stack. Other clones
# refuse. To intentionally run anyway (e.g. dev testing on other ports), set
# FORCE_START=1.
if [ ! -f "$SCRIPT_DIR/.production-host" ] && [ "${FORCE_START:-0}" != "1" ]; then
  echo -e "${RED}✋ Refusing to start: this folder is NOT the designated production host.${NC}"
  echo -e "${YELLOW}   The live stack must run from the folder containing a .production-host marker,"
  echo -e "   to avoid two clones fighting over the same ports + tunnel.${NC}"
  echo ""
  echo -e "   This folder: ${SCRIPT_DIR}"
  echo -e "   To make THIS folder the production host:"
  echo -e "       ${GREEN}touch \"$SCRIPT_DIR/.production-host\"${NC}"
  echo -e "   To start anyway without claiming production (advanced):"
  echo -e "       ${GREEN}FORCE_START=1 $0${NC}"
  exit 1
fi

echo "🚀 Starting Vibely AI Complete Stack..."
echo "==============================================="
echo ""

# ── Validate required env vars before doing anything heavy ───────────────────
# Catches the common "service crashes on boot, you see a vague curl timeout 60s
# later" failure mode for the security-required vars.
echo "🔐 Validating env files..."
require_env_key() {
  local file="$1" key="$2"
  if [ ! -f "$file" ]; then
    echo -e "   ${RED}❌ Missing env file: $file${NC}"
    return 1
  fi
  if ! grep -qE "^${key}=.+" "$file"; then
    echo -e "   ${RED}❌ $file is missing required key: $key${NC}"
    return 1
  fi
}
ENV_OK=1
require_env_key "$SCRIPT_DIR/mystic-vibes-api/.env" "JWT_SECRET"       || ENV_OK=0
require_env_key "$SCRIPT_DIR/mystic-vibes-api/.env" "AI_SERVICES"      || ENV_OK=0
require_env_key "$SCRIPT_DIR/mystic-vibes-api/.env" "AI_SERVICES_KEY"  || ENV_OK=0
require_env_key "$SCRIPT_DIR/AI-service/.env"      "SERVICE_AUTH_KEY" || ENV_OK=0
if [ "$ENV_OK" -ne 1 ]; then
  echo -e "   ${RED}❌ Fix the missing env vars above before starting.${NC}"
  echo -e "   ${YELLOW}💡 Generate secrets with: openssl rand -hex 32${NC}"
  echo -e "   ${YELLOW}💡 AI_SERVICES_KEY (in api/.env) must match SERVICE_AUTH_KEY (in AI-service/.env)${NC}"
  exit 1
fi
# Also assert the two shared secrets actually match, or the gateway returns 401.
API_KEY=$(grep -E '^AI_SERVICES_KEY=' "$SCRIPT_DIR/mystic-vibes-api/.env" | head -1 | cut -d= -f2-)
SVC_KEY=$(grep -E '^SERVICE_AUTH_KEY='  "$SCRIPT_DIR/AI-service/.env"      | head -1 | cut -d= -f2-)
if [ "$API_KEY" != "$SVC_KEY" ]; then
  echo -e "   ${RED}❌ AI_SERVICES_KEY (api) != SERVICE_AUTH_KEY (ai-service) — gateway will 401 every reading.${NC}"
  exit 1
fi
echo "   ✅ env files OK and shared secrets match"
echo ""

# Source the AI-service .env so OLLAMA_MODEL (and friends) come from a single
# source of truth — same value the Node gateway/Python service will use.
# Subshell so the exported PORT (=11434, the gateway's port) doesn't leak into
# the backend's child process and make it try to listen on the gateway's port.
OLLAMA_MODEL=$(set -a; . "$SCRIPT_DIR/AI-service/.env"; echo "$OLLAMA_MODEL")
export OLLAMA_MODEL

# Ensure logrotate is installed and launchd job is registered
LOGROTATE_CONF="$SCRIPT_DIR/mystic-vibes-api/logrotate/vibely.conf"
LOGROTATE_PLIST="$HOME/Library/LaunchAgents/com.vibely.logrotate.plist"
if ! command -v logrotate &> /dev/null; then
  echo "📋 Installing logrotate for log management..."
  brew install logrotate
fi
if [ ! -f "$LOGROTATE_PLIST" ]; then
  echo "📋 Registering logrotate launchd job..."
  cp "$SCRIPT_DIR/mystic-vibes-api/logrotate/com.vibely.logrotate.plist" "$LOGROTATE_PLIST"
  # `launchctl load` is deprecated on macOS 12+; use the modern bootstrap form.
  launchctl bootstrap "gui/$(id -u)" "$LOGROTATE_PLIST" 2>/dev/null \
    || launchctl load "$LOGROTATE_PLIST"
fi

# Clean up any existing processes
echo "0️⃣ Cleaning up existing processes..."
pkill -x ollama 2>/dev/null || true   # exact match — don't kill ollama-cli, etc.
# Kill stack processes by name too — port-only kills miss orphaned nodemon
# children that aren't bound at cleanup time, which pile up across runs and
# create "ghost" backends squatting on the gateway's port (11434). See README.
pkill -f "mystic-vibes-api/node_modules/.bin/nodemon" 2>/dev/null || true  # backend (all stale copies)
pkill -f "src/node_service/server.js" 2>/dev/null || true                  # AI gateway
pkill -f "mystic-vibes-ai/node_modules/.bin/vite" 2>/dev/null || true      # frontend
lsof -ti:11434 | xargs kill -9 2>/dev/null || true  # AI Service Gateway
lsof -ti:11435 | xargs kill -9 2>/dev/null || true  # Ollama
lsof -ti:5001  | xargs kill -9 2>/dev/null || true  # Python AI Service

lsof -ti:3001 | xargs kill -9 2>/dev/null || true   # Backend
lsof -ti:3000 | xargs kill -9 2>/dev/null || true   # Frontend
sleep 2
echo "   ✅ Cleanup complete"
echo ""

# Check if PostgreSQL is running
echo "1️⃣ Checking PostgreSQL..."

# First, check if Docker/Colima is running
if ! docker info > /dev/null 2>&1;
then
  echo -e "   ${YELLOW}⚠️  Docker daemon not running${NC}"
  
  # Check if Colima is installed
  if command -v colima &> /dev/null;
then
  echo "    Starting Colima..."
  colima start
  
  # Wait for Colima to be ready
  echo "   ⏳ Waiting for Colima to initialize..."
  for i in {1..30};
do
  if docker info > /dev/null 2>&1;
then
  echo "   ✅ Colima started successfully"
  break
fi
  if [ $i -eq 30 ]; then
    echo -e "   ${RED}❌ ERROR: Colima failed to start after 30 seconds${NC}"
    echo -e "   ${YELLOW}💡 Try manually: colima start${NC}"
    exit 1
  fi
  sleep 1
done
else
  echo -e "   ${RED}❌ ERROR: Docker daemon is not running and Colima is not installed${NC}"
  echo -e "   ${YELLOW}💡 Install Colima: brew install colima${NC}"
  echo -e "   ${YELLOW}💡 OR start Docker Desktop${NC}"
  exit 1
fi
fi

# Now start PostgreSQL
if docker ps | grep -q vibely-postgres;
then
  echo "   ✅ PostgreSQL already running"
else
  echo "   📦 Starting PostgreSQL..."
  
  # Try to start existing container first
  if docker start vibely-postgres > /dev/null 2>&1;
then
  sleep 3
  echo "   ✅ PostgreSQL started (existing container)"
else
  # No existing container, create new one
  if docker run -d --name vibely-postgres \
    -e POSTGRES_PASSWORD=password \
    -e POSTGRES_DB=vibely_ai \
    -p 5432:5432 \
    postgres:15 > /dev/null 2>&1;
then
  sleep 5
  echo "   ✅ PostgreSQL started (new container)"
else
  echo -e "   ${RED}❌ ERROR: Failed to start PostgreSQL container${NC}"
  echo -e "   ${YELLOW}💡 Try: docker rm vibely-postgres${NC}"
  exit 1
fi
fi
  
  # Verify PostgreSQL is actually running
  if ! docker ps | grep -q vibely-postgres;
then
  echo -e "   ${RED}❌ ERROR: PostgreSQL container not running${NC}"
  exit 1
fi
fi

# Bootstrap DB schema + migrations if missing.
# Idempotent: only applies the base schema when `users` table doesn't exist;
# always re-runs migrations (most use CREATE/ALTER IF NOT EXISTS).
echo "   🗄️  Checking database schema..."
USERS_EXISTS=$(PGPASSWORD=password docker exec vibely-postgres psql -U postgres -d vibely_ai -tA -c "SELECT to_regclass('public.users') IS NOT NULL" 2>/dev/null)
if [ "$USERS_EXISTS" != "t" ]; then
  echo "   📋 Base schema missing — applying database-schema.sql..."
  PGPASSWORD=password docker exec -i vibely-postgres psql -U postgres -d vibely_ai < "$SCRIPT_DIR/mystic-vibes-api/database-schema.sql" > /tmp/vibely-db-schema.log 2>&1
  echo "   ✅ Base schema applied"
else
  echo "   ✅ Base schema already present"
fi

# Apply migrations (idempotent — most use IF NOT EXISTS)
if [ -d "$SCRIPT_DIR/mystic-vibes-api/migrations" ]; then
  for mig in "$SCRIPT_DIR/mystic-vibes-api/migrations"/*.sql; do
    mig_name=$(basename "$mig")
    PGPASSWORD=password docker exec -i vibely-postgres psql -U postgres -d vibely_ai < "$mig" > /tmp/vibely-db-migration.log 2>&1 \
      && echo "   ✅ migration: $mig_name" \
      || echo -e "   ${YELLOW}⚠ migration $mig_name had warnings (often expected for idempotent re-runs)${NC}"
  done
fi
echo ""

# Start Ollama (on port 11435 to avoid conflict with AI Service)
echo "2️⃣ Starting Ollama AI..."

# Install Ollama if missing
if ! command -v ollama &> /dev/null; then
  echo "   📦 Ollama not found, installing..."
  if command -v brew &> /dev/null; then
    brew install ollama
  else
    echo "   ⬇️  Downloading Ollama installer..."
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  if ! command -v ollama &> /dev/null; then
    echo -e "   ${RED}❌ ERROR: Ollama installation failed${NC}"
    exit 1
  fi
  echo "   ✅ Ollama installed"
fi

if pgrep -x "ollama" > /dev/null;
then
  echo "   ⚠️  Ollama already running, restarting..."
  pkill -x ollama
  sleep 2
fi

# NUM_PARALLEL=1: the AI-service fair scheduler already serializes LLM calls to
# one-at-a-time so the first reading returns at full GPU speed and concurrent
# users interleave. Keep Ollama at 1 so it never splits the GPU across requests.
OLLAMA_HOST=127.0.0.1:11435 OLLAMA_NUM_PARALLEL=1 OLLAMA_KEEP_ALIVE=24h ollama serve > /tmp/vibely-ollama.log 2>&1 &
OLLAMA_PID=$!
echo "   ⏳ Ollama starting on port 11435 (PID: $OLLAMA_PID)..."
sleep 3

# Verify Ollama is running
if ! curl -s http://localhost:11435/api/tags > /dev/null 2>&1;
then
  echo -e "   ${RED}❌ ERROR: Ollama failed to start${NC}"
  echo -e "   ${YELLOW}💡 Check logs: tail -f /tmp/vibely-ollama.log${NC}"
  exit 1
fi

echo "   ✅ Ollama running on http://localhost:11435"

# Pull required model if not already downloaded.
# OLLAMA_MODEL was sourced from AI-service/.env above (the single source of
# truth) — same value the Python service will request from Ollama, so we
# pull exactly what's needed. The fallback only matters if .env is missing.
REQUIRED_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
if ! OLLAMA_HOST=127.0.0.1:11435 ollama list 2>/dev/null | grep -q "$REQUIRED_MODEL"; then
  echo "   📥 Downloading model $REQUIRED_MODEL (this may take a while)..."
  OLLAMA_HOST=127.0.0.1:11435 ollama pull "$REQUIRED_MODEL"
  echo "   ✅ Model $REQUIRED_MODEL ready"
else
  echo "   ✅ Model $REQUIRED_MODEL already downloaded"
fi
echo ""

# Download AI model weights if needed (SAM for palm CV pipeline)
echo "3️⃣  Checking AI model weights..."
cd "$AI_SERVICE_DIR"
bash "$AI_SERVICE_DIR/download-models.sh"

# Start Unified AI Service Gateway (port 11434)
# server.js automatically spawns the Python AI Service (port 5001) as a child process
echo "4️⃣  Starting Unified AI Service Gateway..."
cd "$AI_SERVICE_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null;
then
  echo -e "   ${RED}❌ ERROR: Node.js is not installed${NC}"
  echo -e "   ${YELLOW}💡 Install: brew install node${NC}"
  exit 1
fi

# Set up Python venv with 3.9 if missing
if [ ! -d "venv" ]; then
  echo -e "   ${YELLOW}⚠️  Python venv not found, creating...${NC}"
  /opt/homebrew/bin/python3.9 -m venv venv
  venv/bin/pip install --upgrade pip -q
  venv/bin/pip install -r requirements.txt > /tmp/vibely-pip-install.log 2>&1
  echo "   ✅ Python venv ready"
fi

# Install node dependencies
if [ ! -d "node_modules" ]; then
  echo -e "   ${YELLOW}⚠️  node_modules not found, running npm install...${NC}"
  npm install > /tmp/vibely-ai-npm-install.log 2>&1
fi

# Run node directly instead of `npm start` — `npm start` wraps the process,
# so $! points at the npm wrapper. Killing that doesn't reliably stop the
# child Node server, leaving port 11434 orphaned. Direct exec gives us the
# real PID for stop-vibely.sh.
node src/node_service/server.js > /tmp/vibely-ai-service.log 2>&1 &
AI_SERVICE_PID=$!
echo "   ⏳ AI Service starting (PID: $AI_SERVICE_PID)..."
sleep 3

# Verify AI Service is running
if ! curl -s http://localhost:11434/health > /dev/null 2>&1;
then
  echo -e "   ${RED}❌ ERROR: AI Service failed to start${NC}"
  echo -e "   ${YELLOW}💡 Check logs: tail -f /tmp/vibely-ai-service.log${NC}"
  exit 1
fi

echo "   ✅ AI Service running on http://localhost:11434"
echo ""

# Start Cloudflare Tunnel
echo "5️⃣  Starting Cloudflare Tunnel (ai.mystic-vibes.com)..."

if ! command -v cloudflared &> /dev/null; then
  echo -e "   ${RED}❌ ERROR: cloudflared is not installed${NC}"
  echo -e "   ${YELLOW}💡 Install: brew install cloudflare/cloudflare/cloudflared${NC}"
  exit 1
fi

cloudflared tunnel run mystic-ai > /tmp/vibely-cloudflared.log 2>&1 &
CLOUDFLARED_PID=$!
echo $CLOUDFLARED_PID > /tmp/vibely-cloudflared.pid
echo "   ⏳ Tunnel starting (PID: $CLOUDFLARED_PID)..."
sleep 4

if ! curl -s https://ai.mystic-vibes.com/health > /dev/null 2>&1; then
  echo -e "   ${YELLOW}⚠️  Tunnel may still be connecting (check: tail -f /tmp/vibely-cloudflared.log)${NC}"
else
  echo "   ✅ Tunnel live at https://ai.mystic-vibes.com"
fi
echo ""

# Start Backend
echo "6️⃣  Starting Backend API..."

BACKEND_DIR="$SCRIPT_DIR/mystic-vibes-api"

# Check if backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
  echo -e "   ${RED}❌ ERROR: mystic-vibes-api directory not found${NC}"
  exit 1
fi

cd "$BACKEND_DIR"

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo -e "   ${RED}❌ ERROR: package.json not found in backend${NC}"
  exit 1
fi

echo "   📦 Installing backend dependencies..."
npm install --silent
# Pin PORT explicitly: if the calling shell has PORT set (e.g. someone sourced
# AI-service/.env, where PORT=11434), the backend would inherit it and bind the
# gateway's port — hijacking the tunnel. Never trust the caller's environment.
PORT=3001 npm run dev > /tmp/vibely-backend.log 2>&1 &
BACKEND_PID=$!
echo "   ⏳ Backend starting (PID: $BACKEND_PID)..."
sleep 5

# Verify backend is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1;
then
  echo -e "   ${RED}❌ ERROR: Backend failed to start${NC}"
  echo -e "   ${YELLOW}💡 Check logs: tail -f /tmp/vibely-backend.log${NC}"
  exit 1
fi

echo "   ✅ Backend running on http://localhost:3001"
echo ""

# Start Frontend
echo "7️⃣  Starting Frontend..."

FRONTEND_DIR="$SCRIPT_DIR/mystic-vibes-ai"

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
  echo -e "   ${RED}❌ ERROR: mystic-vibes-ai directory not found${NC}"
  exit 1
fi

cd "$FRONTEND_DIR"

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo -e "   ${RED}❌ ERROR: package.json not found in frontend${NC}"
  exit 1
fi

echo "   📦 Installing frontend dependencies..."
npm install --silent
npm run dev > /tmp/vibely-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   ⏳ Frontend starting (PID: $FRONTEND_PID)..."
sleep 5

# Verify frontend is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1;
then
  echo -e "   ${RED}❌ ERROR: Frontend failed to start${NC}"
  echo -e "   ${YELLOW}💡 Check logs: tail -f /tmp/vibely-frontend.log${NC}"
  exit 1
fi

echo "   ✅ Frontend running on http://localhost:3000"
echo ""

# Run AI reading smoke tests
echo "8️⃣  Running AI reading smoke tests..."
bash "$AI_SERVICE_DIR/test-readings.sh"
echo ""

echo "==============================================="
echo -e "${GREEN}✅ ALL SERVICES VERIFIED AND RUNNING!${NC}"
echo "==============================================="
echo ""
echo "📍 Access Points:"
echo "   🌐 Frontend:         http://localhost:3000"
echo "   🔌 Backend API:      http://localhost:3001/api"
echo "   ❤️  Health Check:     http://localhost:3001/health"
echo "   🐍 Python AI Service: http://localhost:5001"
echo "   📊 AI Gateway:       http://localhost:11434/dashboard"
echo "   🔧 AI Health:        http://localhost:11434/health"
echo "   🤖 Ollama:           http://localhost:11435"
echo ""
echo ""
echo "📝 Process IDs:"
echo "   Ollama:      $OLLAMA_PID"
echo "   AI Service:  $AI_SERVICE_PID  (spawns Python AI Service internally)"
echo "   Tunnel:      $CLOUDFLARED_PID"
echo "   Backend:     $BACKEND_PID"
echo "   Frontend:    $FRONTEND_PID"
echo ""
echo "📊 View Logs:"
echo "   Ollama:      tail -f /tmp/vibely-ollama.log"
echo "   AI Service:  tail -f /tmp/vibely-ai-service.log"
echo "   Tunnel:      tail -f /tmp/vibely-cloudflared.log"
echo "   Backend:     tail -f /tmp/vibely-backend.log"
echo "   Frontend:    tail -f /tmp/vibely-frontend.log"
echo ""
echo "🛑 To Stop:"
echo "   kill $OLLAMA_PID $AI_SERVICE_PID $BACKEND_PID $FRONTEND_PID"
echo "   docker stop vibely-postgres"
echo ""
echo "Or save PIDs to file:"
echo "$OLLAMA_PID" > /tmp/vibely-ollama.pid
echo "$AI_SERVICE_PID" > /tmp/vibely-ai-service.pid
echo "$BACKEND_PID" > /tmp/vibely-backend.pid
echo "$FRONTEND_PID" > /tmp/vibely-frontend.pid
echo "   Saved PIDs to /tmp/vibely-*.pid"
echo ""