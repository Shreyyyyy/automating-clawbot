import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

// In-memory store per serverless instance (OK for option A demo)
const setups = globalThis.__SANKHYA_SETUPS__ || (globalThis.__SANKHYA_SETUPS__ = new Map());

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
    setups.set(code, { createdAt: new Date().toISOString(), profile });

    res.status(200).json({
      ok: true,
      code,
      installLinuxMac: `curl -fsSL ${baseUrl}/install.sh?code=${code} | bash`,
    });
    return;
  }

  if (pathname === "/install.sh" && req.method === "GET") {
    const code = String(url.searchParams.get("code") || "").trim().toUpperCase();
    const setup = setups.get(code);
    if (!setup) {
      res.status(404).setHeader("content-type", "text/plain; charset=utf-8");
      res.send("Invalid code\n");
      return;
    }

    const botType = setup.profile.botType || "personal";
    const voice = setup.profile.voice === true ? "on" : "off";
    const channel = setup.profile.channel || "whatsapp";

    const script = `#!/usr/bin/env bash
set -euo pipefail

CODE="${code}"
BOT_TYPE="${botType}"
VOICE="${voice}"
CHANNEL="${channel}"

echo "SANKHYA BotBuilder — installer"
echo "Setup code: $CODE"
echo "Bot type: $BOT_TYPE"
echo "Channel: $CHANNEL"
echo "Voice: $VOICE"
echo

echo "1) Checking for openclaw..."
if command -v openclaw >/dev/null 2>&1; then
  echo "   - openclaw found"
else
  echo "   - openclaw not found. Install it first (Node required):"
  echo "     npm i -g openclaw"
  echo "     (then rerun this installer)"
  exit 1
fi

echo

echo "2) Tailscale (recommended for phone->laptop access)"
if command -v tailscale >/dev/null 2>&1; then
  echo "   - tailscale is installed"
  echo "   - run: sudo tailscale up"
else
  echo "   - tailscale is not installed"
  echo "   - install from: https://tailscale.com/download"
  echo "   - then run: sudo tailscale up"
fi

echo

echo "3) Creating local workspace template (demo)"
WS="$HOME/.openclaw/workspace"
mkdir -p "$WS"

cat > "$WS/SOUL.md" <<'EOF'
# SOUL.md
You are a helpful assistant.
Treat voice notes as tasks.
Be concise and practical.
EOF

cat > "$WS/USER.md" <<'EOF'
# USER.md
- Name: (unknown)
- Notes: Setup via SANKHYA BotBuilder
EOF

echo "   - Wrote $WS/SOUL.md and $WS/USER.md"

echo

echo "4) Next steps"
echo "   - Start OpenClaw gateway on this machine"
echo "     openclaw gateway start"
echo "   - Link WhatsApp:"
echo "     openclaw whatsapp login"

echo

echo "Done."
`;

    res.status(200);
    res.setHeader("content-type", "text/x-shellscript; charset=utf-8");
    res.setHeader("content-disposition", "inline; filename=install.sh");
    res.send(script);
    return;
  }

  // Fallback 404
  res.status(404).setHeader("content-type", "text/plain; charset=utf-8");
  res.send("Not found\n");
}
