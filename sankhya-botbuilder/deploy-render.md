# Deploy to Render (free)

This project is already configured with `render.yaml`.

## 1) Push to GitHub

```bash
cd sankhya-botbuilder
git init
git add -A
git commit -m "SANKHYA BotBuilder"
# create an empty GitHub repo, then:
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

## 2) Deploy on Render

1. Go to https://render.com
2. New → **Blueprint**
3. Select the GitHub repo
4. Click Apply

Render will build and deploy automatically.

## 3) Verify

- Open `https://<service>.onrender.com/`
- Click Create setup
- Run the generated command:

```bash
curl -fsSL https://<service>.onrender.com/install.sh?code=XXXXX | bash
```
