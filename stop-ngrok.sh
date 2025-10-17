#!/bin/bash

echo "🛑 Stopping ngrok tunnel..."

# Check if PID file exists
if [ -f .ngrok.pid ]; then
    NGROK_PID=$(cat .ngrok.pid)
    if ps -p $NGROK_PID > /dev/null 2>&1; then
        echo "🔄 Stopping ngrok (PID: $NGROK_PID)..."
        kill $NGROK_PID
        sleep 2

        # Force kill if still running
        if ps -p $NGROK_PID > /dev/null 2>&1; then
            echo "⚠️  Force killing ngrok..."
            kill -9 $NGROK_PID
        fi

        echo "✅ ngrok stopped"
    else
        echo "⚠️  ngrok process not found (PID: $NGROK_PID)"
    fi
    rm -f .ngrok.pid
else
    echo "⚠️  No ngrok PID file found"
fi

# Also try to kill any ngrok processes
NGROK_PIDS=$(pgrep ngrok)
if [ -n "$NGROK_PIDS" ]; then
    echo "🔄 Stopping remaining ngrok processes..."
    pkill ngrok
    echo "✅ All ngrok processes stopped"
fi

echo "🏁 ngrok shutdown complete"