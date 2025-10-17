#!/bin/bash

echo "🌐 Starting ngrok tunnel for Ollama..."
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed"
    echo "📦 Installing ngrok..."

    # Check if Homebrew is available (macOS)
    if command -v brew &> /dev/null; then
        brew install ngrok
    else
        echo "Please install ngrok manually:"
        echo "1. Go to https://ngrok.com/download"
        echo "2. Download and install ngrok"
        echo "3. Run: ngrok authtoken YOUR_TOKEN"
        exit 1
    fi
fi

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "❌ Ollama is not running on localhost:11434"
    echo "Please start Ollama first:"
    echo "  ./start-ollama.sh"
    exit 1
fi

echo "✅ Ollama is running"

# Check if ngrok is already running
if curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
    # Get existing tunnel URL
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok[^"]*')
    if [ -n "$NGROK_URL" ]; then
        echo "✅ ngrok tunnel already running"
        echo "🔗 Public Ollama URL: $NGROK_URL"
        echo ""
        echo "💾 To use this URL, update your environment:"
        echo "  export OLLAMA_BASE_URL=$NGROK_URL"
        echo ""
        exit 0
    else
        echo "⚠️  ngrok is running but no active tunnels found"
        echo "🔄 Stopping existing ngrok process..."
        pkill ngrok
        sleep 2
    fi
else
    # Check for existing ngrok processes that might be stuck
    if pgrep ngrok > /dev/null; then
        echo "⚠️  Found stuck ngrok process"
        echo "🔄 Stopping existing ngrok process..."
        pkill ngrok
        sleep 2
    fi
fi

echo ""
echo "🔑 Checking ngrok authentication..."

# Test ngrok authentication by checking config
if ! ngrok config check > /dev/null 2>&1; then
    echo "❌ ngrok authentication failed"
    echo ""
    echo "📋 Please set up ngrok authentication:"
    echo "1. Sign up: https://dashboard.ngrok.com/signup"
    echo "2. Get your authtoken: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "3. Install token: ngrok config add-authtoken YOUR_TOKEN_HERE"
    echo ""
    echo "🔄 Then run this script again"
    exit 1
fi

echo "✅ ngrok authentication OK"
echo ""

# Start ngrok tunnel
echo "🚀 Starting ngrok tunnel..."
ngrok http 11434 > ngrok.log 2>&1 &
NGROK_PID=$!
echo $NGROK_PID > .ngrok.pid

echo "⏳ Waiting for ngrok to start..."

# Wait for ngrok to be ready (max 15 seconds)
for i in {1..15}; do
    if curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
        break
    fi
    if [ $i -eq 15 ]; then
        echo "❌ ngrok failed to start within 15 seconds"
        cat ngrok.log
        kill $NGROK_PID 2>/dev/null
        exit 1
    fi
    sleep 1
done

# Get the public URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok[^"]*')

if [ -n "$NGROK_URL" ]; then
    echo "✅ ngrok tunnel started successfully!"
    echo ""
    echo "🔗 Public Ollama URL: $NGROK_URL"
    echo "📝 ngrok PID: $NGROK_PID"
    echo ""
    echo "💾 To use this URL:"
    echo "1. Update your .env file:"
    echo "   OLLAMA_BASE_URL=$NGROK_URL"
    echo ""
    echo "2. Or set environment variable:"
    echo "   export OLLAMA_BASE_URL=$NGROK_URL"
    echo ""
    echo "3. Restart your server to use the new URL"
    echo ""
    echo "📊 ngrok web interface: http://localhost:4040"
    echo "📝 Logs: ngrok.log"
    echo ""
    echo "🛑 To stop ngrok:"
    echo "  ./stop-ngrok.sh"
    echo "  # or"
    echo "  kill \$(cat .ngrok.pid)"
    echo ""
    echo "⚠️  WARNING: This exposes your Ollama instance to the internet."
    echo "   Only use for development and testing!"
else
    echo "❌ Failed to get ngrok URL"
    echo "Check ngrok.log for details"
    kill $NGROK_PID 2>/dev/null
    exit 1
fi