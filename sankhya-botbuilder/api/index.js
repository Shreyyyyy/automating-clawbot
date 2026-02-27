import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

import crypto from "crypto";

// Stateless token signing (works on serverless)
const SECRET = process.env.BOTBUILDER_SECRET || "dev-insecure-secret";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
}

function signToken(payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(payload).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function htmlResponse(html) {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: html,
  };
}

function jsonResponse(obj, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj, null, 2),
  };
}

function textResponse(text, statusCode = 200, contentType = "text/plain; charset=utf-8") {
  return {
    statusCode,
    headers: { "content-type": contentType },
    body: text,
  };
}

function readPublicIndex() {
  // Vercel's project root depends on what you selected as "Root Directory".
  // Try common locations so we don't crash with 500.
  const candidates = [
    path.join(process.cwd(), "public", "index.html"),
    path.join(process.cwd(), "sankhya-botbuilder", "public", "index.html"),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    } catch {}
  }

  return `<!doctype html><html><body><h2>BotBuilder misconfigured</h2>
  <p>Could not find <code>public/index.html</code>.</p>
  <p>Fix: In Vercel project settings, set <b>Root Directory</b> to <code>sankhya-botbuilder</code> and redeploy.</p>
  </body></html>`;
}

export default async function handler(req, res) {
  // Vercel gives Node request/response. We'll manually route.
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  const baseUrl = `https://${req.headers.host}`;

  if (pathname === "/health") {
    res.status(200).json({ ok: true });
    return;
  }

  if (pathname === "/" && req.method === "GET") {
    res.status(200).setHeader("content-type", "text/html; charset=utf-8");
    res.send(readPublicIndex());
    return;
  }

  if (pathname === "/api/create" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const profile = body ? JSON.parse(body) : {};

    const code = nanoid(10).toUpperCase();
    const token = signToken({
      code,
      createdAt: new Date().toISOString(),
      profile,
    });

    res.status(200).json({
      ok: true,
      code,
      installLinuxMac: `curl -fsSL ${baseUrl}/install.sh?token=${encodeURIComponent(token)} | bash`,
      installWindows: `powershell -NoProfile -ExecutionPolicy Bypass -Command \"iwr ${baseUrl}/install.ps1?token=${encodeURIComponent(token)} -UseBasicParsing | iex\"`,
    });
    return;
  }

  if (pathname === "/install.sh" && req.method === "GET") {
    const token = String(url.searchParams.get("token") || "");
    const setup = verifyToken(token);
    if (!setup) {
      res.status(404).setHeader("content-type", "text/plain; charset=utf-8");
      res.send("Invalid token\n");
      return;
    }

    const botType = setup.profile?.botType || "personal";
    const voice = setup.profile?.voice === true ? "on" : "off";
    const channel = setup.profile?.channel || "whatsapp";

    const script = `#!/usr/bin/env bash
set -euo pipefail

BOT_TYPE="${botType}"
VOICE="${voice}"
CHANNEL="${channel}"

echo "SANKHYA BotBuilder — installer"
echo "Bot type: $BOT_TYPE"
echo "Channel: $CHANNEL"
echo "Voice: $VOICE"
echo

echo "0) Preflight"
command -v node >/dev/null 2>&1 || { echo "Node.js is required. Install Node 20+ and rerun."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required. Install Node and rerun."; exit 1; }

echo

echo "1) Install OpenClaw (if missing)"
if command -v openclaw >/dev/null 2>&1; then
  echo "   - openclaw already installed"
else
  echo "   - installing openclaw globally (may ask for password if npm needs it)"
  npm i -g openclaw
fi

echo

echo "2) Write bot workspace templates"
WS="$HOME/.openclaw/workspace"
mkdir -p "$WS"

cat > "$WS/SOUL.md" <<EOF
# SOUL.md
You are Ava.
You act as a ${botType} bot.
Treat every voice note as a task request.
Ask clarifying questions only when required.
Be concise and practical.
EOF

cat > "$WS/USER.md" <<'EOF'
# USER.md
- Notes: Setup via SANKHYA BotBuilder
EOF

echo "   - wrote $WS/SOUL.md and $WS/USER.md"

echo

echo "3) Voice transcription (optional)"
if [ "$VOICE" = "on" ]; then
  if command -v ffmpeg >/dev/null 2>&1; then
    echo "   - ffmpeg present"
  else
    echo "   - ffmpeg missing. Install it for voice notes transcription."
    echo "     Ubuntu: sudo apt-get install -y ffmpeg"
    echo "     macOS: brew install ffmpeg"
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -m pip install --user -q faster-whisper || true
    echo "   - faster-whisper installed (best-effort)"
  else
    echo "   - python3 missing; skip faster-whisper"
  fi
fi

echo

echo "4) Phone access (recommended): Tailscale"
if command -v tailscale >/dev/null 2>&1; then
  echo "   - tailscale installed"
  echo "   - run once: sudo tailscale up"
else
  echo "   - install tailscale from: https://tailscale.com/download"
fi

echo

echo "5) Start OpenClaw gateway"
openclaw gateway start || true

echo

echo "6) Link channel"
if [ "$CHANNEL" = "whatsapp" ]; then
  echo "Run: openclaw whatsapp login"
fi

echo

echo "Done. OpenClaw is installed + started."
`;

    res.status(200);
    res.setHeader("content-type", "text/x-shellscript; charset=utf-8");
    res.setHeader("content-disposition", "inline; filename=install.sh");
    res.send(script);
    return;
  }

  if (pathname === "/install.ps1" && req.method === "GET") {
    const token = String(url.searchParams.get("token") || "");
    const setup = verifyToken(token);
    if (!setup) {
      res.status(404).setHeader("content-type", "text/plain; charset=utf-8");
      res.send("Invalid token\n");
      return;
    }

    const botType = setup.profile?.botType || "personal";
    const voice = setup.profile?.voice === true ? "on" : "off";
    const channel = setup.profile?.channel || "whatsapp";

    const ps1 = `Param()
$ErrorActionPreference = 'Stop'

Write-Host "SANKHYA BotBuilder — installer" -ForegroundColor Cyan
Write-Host "Bot type: ${botType}"
Write-Host "Channel: ${channel}"
Write-Host "Voice: ${voice}"

# 1) Install OpenClaw (requires Node + npm)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required. Install Node 20+ and rerun." -ForegroundColor Red
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm is required. Install Node and rerun." -ForegroundColor Red
  exit 1
}

if (-not (Get-Command openclaw -ErrorAction SilentlyContinue)) {
  Write-Host "Installing OpenClaw..." -ForegroundColor Yellow
  npm i -g openclaw
} else {
  Write-Host "OpenClaw already installed" -ForegroundColor Green
}

# 2) Write workspace templates
$ws = Join-Path $HOME ".openclaw\workspace"
New-Item -ItemType Directory -Force -Path $ws | Out-Null

Set-Content -Path (Join-Path $ws "SOUL.md") -Value @"
# SOUL.md
You are Ava.
You act as a ${botType} bot.
Treat every voice note as a task request.
Ask clarifying questions only when required.
Be concise and practical.
"@

Set-Content -Path (Join-Path $ws "USER.md") -Value @"
# USER.md
- Notes: Setup via SANKHYA BotBuilder
"@

# 3) Start gateway
try { openclaw gateway start } catch {}

# 4) Link channel
if ("${channel}" -eq "whatsapp") {
  Write-Host "Run: openclaw whatsapp login" -ForegroundColor Cyan
}

Write-Host "Done." -ForegroundColor Green
`;

    res.status(200);
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("content-disposition", "inline; filename=install.ps1");
    res.send(ps1);
    return;
  }

  // Fallback 404
  res.status(404).setHeader("content-type", "text/plain; charset=utf-8");
  res.send("Not found\n");
}
