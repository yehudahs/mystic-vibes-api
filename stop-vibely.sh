#!/bin/bash

echo "🛑 Stopping Vibely AI Stack..."
echo "================================================"
echo ""

# Stop frontend
if [ -f /tmp/vibely-frontend.pid ]; then
  FRONTEND_PID=$(cat /tmp/vibely-frontend.pid)
  echo "🎨 Stopping Frontend (PID: $FRONTEND_PID)..."
  kill $FRONTEND_PID 2>/dev/null && echo "   ✅ Frontend stopped" || echo "   ⚠️  Frontend already stopped"
  rm /tmp/vibely-frontend.pid
else
  echo "🎨 Stopping Frontend..."
  lsof -ti:3000 | xargs kill 2>/dev/null
  lsof -ti:3004 | xargs kill 2>/dev/null && echo "   ✅ Frontend stopped" || echo "   ⚠️  Frontend not running"
fi
echo ""

# Stop backend
if [ -f /tmp/vibely-backend.pid ]; then
  BACKEND_PID=$(cat /tmp/vibely-backend.pid)
  echo "🔧 Stopping Backend (PID: $BACKEND_PID)..."
  kill $BACKEND_PID 2>/dev/null && echo "   ✅ Backend stopped" || echo "   ⚠️  Backend already stopped"
  rm /tmp/vibely-backend.pid
else
  echo "🔧 Stopping Backend..."
  lsof -ti:3001 | xargs kill 2>/dev/null && echo "   ✅ Backend stopped" || echo "   ⚠️  Backend not running"
fi
# Also kill any orphaned nodemon — it survives a crash of its child and then
# auto-respawns the API on whatever PORT it had in env (which has bitten us:
# orphan nodemon respawning the API on port 11434 and intercepting tunnel traffic).
pkill -f "nodemon index.js" 2>/dev/null && echo "   ✅ Killed orphaned nodemon(s)" || true
echo ""

# Stop Cloudflare Tunnel
if [ -f /tmp/vibely-cloudflared.pid ]; then
  CLOUDFLARED_PID=$(cat /tmp/vibely-cloudflared.pid)
  echo "🌐 Stopping Cloudflare Tunnel (PID: $CLOUDFLARED_PID)..."
  kill $CLOUDFLARED_PID 2>/dev/null && echo "   ✅ Tunnel stopped" || echo "   ⚠️  Already stopped"
  rm /tmp/vibely-cloudflared.pid
else
  echo "🌐 Stopping Cloudflare Tunnel..."
  pkill cloudflared 2>/dev/null && echo "   ✅ Tunnel stopped" || echo "   ⚠️  Tunnel not running"
fi
echo ""

# Stop AI Service Gateway + Python AI Service
if [ -f /tmp/vibely-ai-service.pid ]; then
  AI_PID=$(cat /tmp/vibely-ai-service.pid)
  echo "🤖 Stopping AI Service Gateway (PID: $AI_PID)..."
  kill $AI_PID 2>/dev/null && echo "   ✅ AI Service Gateway stopped" || echo "   ⚠️  Already stopped"
  rm /tmp/vibely-ai-service.pid
else
  echo "🤖 Stopping AI Service Gateway..."
  lsof -ti:11434 | xargs kill 2>/dev/null && echo "   ✅ AI Service Gateway stopped" || echo "   ⚠️  Not running"
fi
# Always kill Python AI Service (port 5001) — spawned as child process
lsof -ti:5001 | xargs kill 2>/dev/null && echo "   ✅ Python AI Service stopped" || true
echo ""

# Stop Ollama (parent + runner subprocess)
if [ -f /tmp/vibely-ollama.pid ]; then
  OLLAMA_PID=$(cat /tmp/vibely-ollama.pid)
  echo "🧠 Stopping Ollama (PID: $OLLAMA_PID)..."
  kill $OLLAMA_PID 2>/dev/null && echo "   ✅ Ollama stopped" || echo "   ⚠️  Already stopped"
  rm /tmp/vibely-ollama.pid
else
  echo "🧠 Stopping Ollama..."
  pkill -x ollama 2>/dev/null && echo "   ✅ Ollama stopped" || echo "   ⚠️  Ollama not running"
fi
# The runner subprocess (loaded model in GPU memory) has its own argv[0] and
# survives `pkill ollama`. Free GPU memory by killing it explicitly.
pkill -f "ollama runner" 2>/dev/null && echo "   ✅ Ollama runner stopped" || true
# Also free 11435 in case anything leaked
lsof -ti:11435 | xargs kill 2>/dev/null || true
echo ""

# Optionally stop database
read -p "🗄️  Stop PostgreSQL database? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "   Stopping PostgreSQL..."
  docker stop vibely-postgres 2>/dev/null && echo "   ✅ PostgreSQL stopped" || echo "   ⚠️  PostgreSQL not running"
else
  echo "   ✅ PostgreSQL left running"
fi

echo ""
echo "✅ Vibely AI Stack Stopped!"
echo ""
