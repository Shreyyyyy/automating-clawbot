# SANKHYA BotBuilder (Demo)

A minimal end-to-end demo of:
- a website wizard that asks what bot you need
- generating a setup code
- generating an installer command

This is a **demo scaffold**. It does not auto-install system packages with sudo.

## Run

```bash
cd sankhya-botbuilder/server
npm install
npm run dev
```

Open:
- http://127.0.0.1:8787

## Demo flow
1) Choose bot type + voice toggle
2) Click "Create setup"
3) Copy the command and run it on the laptop:

```bash
curl -fsSL http://127.0.0.1:8787/install.sh?code=XXXXX | bash
```

## Deploy for free (Render)

Render free tier sleeps on idle (fine for demo).

1) Push this folder to GitHub
2) Go to https://render.com → New → Blueprint
3) Select your repo
4) Render will detect `render.yaml` and deploy

Your public URL will be shown in Render as:
`https://<service-name>.onrender.com`

## Next steps (to make it production)
- Persist setups in a DB (sqlite/postgres)
- Add Windows installer (PowerShell)
- Integrate OpenClaw config writing (config.schema-driven)
- Add Tailscale auto-setup instructions
- Add voice pipeline auto-setup (faster-whisper) and config toggle
