# Deploying BACKROOMS: NO-CLIP so friends can play

The game is a Node + WebSocket server that also serves the browser client. It's already
configured for hosting: it reads the host's `PORT`, has a health check at `/api/health`,
and ships `render.yaml`, a `Dockerfile`, and a `Procfile`. Pick ONE host below.

The two steps only YOU can do are **(a) creating accounts** and **(b) the browser login** —
everything else is ready.

---

## Option A — Render (recommended: free, supports WebSockets, simplest)

1. **Make a GitHub repo** (free): go to https://github.com/new → name it `backrooms-noclip`
   → Create. Leave it empty (no README).
2. **Push this code to it.** In this folder run (replace `YOURNAME`):
   ```sh
   git remote add origin https://github.com/YOURNAME/backrooms-noclip.git
   git branch -M main
   git push -u origin main
   ```
   Git will ask you to sign in to GitHub (a browser window / device code). Done once.
3. **Deploy on Render** (free): https://render.com → sign up → **New → Blueprint** →
   connect your GitHub → pick `backrooms-noclip`. Render reads `render.yaml` and deploys.
4. After ~2–3 minutes you get a URL like `https://backrooms-noclip.onrender.com`.
   **Share that link with your friends.** They just open it and play — no wallet needed.

> Render's free tier sleeps after ~15 min idle; the first visit then takes ~50s to wake.
> Fine for friends; upgrade to the $7 plan for always-on if you want zero wait.

---

## Option B — Railway (no GitHub needed; deploys this folder directly)

1. Sign up at https://railway.app (free trial credit).
2. Install the CLI and deploy:
   ```sh
   npm i -g @railway/cli
   railway login        # opens browser
   railway init         # name the project
   railway up           # uploads & builds THIS folder
   railway domain       # generates a public URL
   ```

---

## Option C — Fly.io (always-on free allowance; uses the Dockerfile)

1. Sign up at https://fly.io (needs a card for verification, free allowance).
2. ```sh
   # install flyctl, then:
   fly launch --now    # detects the Dockerfile, picks a region, deploys
   ```

---

## After it's live
- Test the URL yourself first, then share it.
- Real prizes stay OFF until `docs/COMPLIANCE.md` is satisfied — the server refuses to start
  in `mainnet-beta` mode otherwise. Devnet demo pool is on by default.
- To redeploy after changes: Render auto-deploys on `git push`; Railway `railway up`;
  Fly `fly deploy`.
