#!/bin/bash

# Exit on any error
set -e

# Resolve to the parent directory (the monorepo root), since this script
# lives inside mystic-vibes-api/ but sibling repos are at the same level.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &> /dev/null && pwd)
AI_SERVICE_DIR="$SCRIPT_DIR/AI-service"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Starting Vibely AI Complete Stack..."
echo "==============================================="
echo ""

# Clean up any existing processes
echo "0️⃣ Cleaning up existing processes..."
pkill ollama 2>/dev/null || true
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
echo ""

# Start Ollama (on port 11435 to avoid conflict with AI Service)
echo "2️⃣ Starting Ollama AI..."

# Check if Ollama is installed
if ! command -v ollama &> /dev/null;
then
  echo -e "   ${RED}❌ ERROR: Ollama is not installed${NC}"
  echo -e "   ${YELLOW}💡 Install: brew install ollama${NC}"
  exit 1
fi

if pgrep -x "ollama" > /dev/null;
then
  echo "   ⚠️  Ollama already running, restarting..."
  pkill ollama
  sleep 2
fi

OLLAMA_HOST=127.0.0.1:11435 OLLAMA_NUM_PARALLEL=7 ollama serve > /tmp/vibely-ollama.log 2>&1 &
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
echo ""

# Start Unified AI Service Gateway (port 11434)
# server.js automatically spawns the Python AI Service (port 5001) as a child process
echo "3️⃣  Starting Unified AI Service Gateway..."
cd "$AI_SERVICE_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null;
then
  echo -e "   ${RED}❌ ERROR: Node.js is not installed${NC}"
  echo -e "   ${YELLOW}💡 Install: brew install node${NC}"
  exit 1
fi

# Install node dependencies
if [ ! -d "node_modules" ]; then
  echo -e "   ${YELLOW}⚠️  node_modules not found, running npm install...${NC}"
  npm install > /tmp/vibely-ai-npm-install.log 2>&1
fi

npm start > /tmp/vibely-ai-service.log 2>&1 &
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

# Start Backend
echo "5️⃣  Starting Backend API..."

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

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo -e "   ${YELLOW}⚠️  node_modules not found, running npm install...${NC}"
  npm install
fi

npm run dev > /tmp/vibely-backend.log 2>&1 &
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
echo "6️⃣  Starting Frontend..."

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

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo -e "   ${YELLOW}⚠️  node_modules not found, running npm install...${NC}"
  npm install
fi

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
echo "   Backend:     $BACKEND_PID"
echo "   Frontend:    $FRONTEND_PID"
echo ""
echo "📊 View Logs:"
echo "   Ollama:      tail -f /tmp/vibely-ollama.log"
echo "   AI Service:  tail -f /tmp/vibely-ai-service.log"
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