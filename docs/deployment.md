# Deployment

ClauseRipple runs fully locally (see the README). For a live demo, these are the **free** options verified on
2026-10-15 (pricing changes — re-check before relying on them). Nothing here requires a paid plan.

## Recommended free topology

| Piece | Where | Cost | Notes |
|---|---|---|---|
| Web (Next.js) | **Vercel Hobby** | free, no card | non-commercial use; `NEXT_PUBLIC_API_URL` must point at the API |
| API + FalkorDB | **Render free web service** (one Docker container, `deploy/render/Dockerfile`) | free | sleeps after 15 min idle (~1 min cold start); disk is ephemeral — the demo graph is re-seeded on every boot |
| FalkorDB (alternative) | **FalkorDB Cloud Free** | free, no card | 100 MB, no TLS, stopped after 1 day idle; set `FALKORDB_HOST/PORT/USERNAME/PASSWORD` and use `apps/api/Dockerfile` instead |

Not used: Koyeb (no longer free for new sign-ups), Fly.io (trial only), Hugging Face Docker Spaces (needs PRO),
Railway (trial credits), GCP/Oracle free tiers (card required).

## Steps (≈15 minutes, all in your own accounts)

1. **API + FalkorDB on Render** — New → Blueprint → connect the GitHub repo (it reads `render.yaml`), or New → Web
   Service → Docker with `dockerfilePath: deploy/render/Dockerfile`. Set:
   - `CORS_ORIGINS` = your Vercel URL (e.g. `https://clauseripple.vercel.app`)
   - `MCP_ALLOWED_HOSTS` = your Render host (e.g. `clauseripple-api.onrender.com`)
   - optional planner: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` (empty = deterministic playbook)

   Health check: `GET /health` → `falkordb: connected`.
2. **Web on Vercel** — Import the repo, root directory `apps/web`, framework Next.js, env
   `NEXT_PUBLIC_API_URL=https://<your-render-host>`. Deploy.
3. **Warm it before judging** — open the Render URL `/health` a minute before demoing (free instances sleep), then
   the Vercel URL → **Reset demo**.

## Everything in Docker (self-hosted VM or local)

```bash
docker compose --profile full up --build      # FalkorDB + Browser + API + web
```

The API image (`apps/api/Dockerfile`) bakes in the local embedding model, so nothing is downloaded at runtime.
The web image is a Next.js standalone build; `NEXT_PUBLIC_API_URL` is a build arg (it is inlined at build time).

## Security notes for public deployments

- Demo mode only performs internal graph writes; there is no upload or arbitrary-query endpoint.
- Keep LLM keys in the host's secret store (`sync: false` in `render.yaml`); they are never sent to the browser.
- `CORS_ORIGINS` and `MCP_ALLOWED_HOSTS` must list only your own origins/hosts.
- Anyone with the URL can press **Reset demo** — that is intentional for judging, and it only resets the demo graph.
