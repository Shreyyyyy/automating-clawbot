import express from "express";
import { nanoid } from "nanoid";
import path from "path";

const app = express();
app.use(express.json({ limit: "1mb" }));

// In-memory store for demo. Replace with DB for prod.
const setups = new Map();

const PORT = process.env.PORT || 8787;

function originFromReq(req) {
  const proto = (req.headers["x-forwarded-proto"] || "http").toString().split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// Serve simple wizard UI
app.use("/", express.static(path.resolve("../public")));

// Create a setup code from wizard choices
app.post("/api/create", (req, res) => {
  const profile = req.body || {};
  const code = nanoid(10).toUpperCase();
  setups.set(code, {
    createdAt: new Date().toISOString(),
    profile,
  });
  const baseUrl = originFromReq(req);
  res.json({
    ok: true,
    code,
    installLinuxMac: `curl -fsSL ${baseUrl}/install.sh?code=${code} | bash`,
  });
});

// Demo installer script.
// NOTE: This does NOT sudo-install anything automatically. It prints the exact steps.
app.get("/install.sh", (req, res) => {
  const code = String(req.query.code || "").trim().toUpperCase();
  const setup = setups.get(code);
  if (!setup) {
    res.status(404).type("text/plain").send("Invalid code\n");
    return;
  }

  // Minimal profile fields
  const botType = setup.profile.botType || "personal";
  const voice = setup.profile.voice === true ? "on" : "off";
  const channel = setup.profile.channel || "whatsapp";

  // A safe, user-driven script (no credential capture)
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
  echo "   - openclaw found: $(openclaw --version 2>/dev/null || echo ok)"
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

# Minimal template files for a bot persona (user can edit)
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
echo "   - Link WhatsApp (if enabled in your OpenClaw config):"
echo "     openclaw whatsapp login"
echo "   - Access from phone: use Tailscale IP + your dashboard port (once you expose one)"

echo

echo "Done."
`;

  res
    .status(200)
    .setHeader("Content-Type", "text/x-shellscript; charset=utf-8")
    .setHeader("Content-Disposition", "inline; filename=install.sh")
    .send(script);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BotBuilder server running on 0.0.0.0:${PORT}`);
});
